import { unixNow } from "@/lib/unix-time";
import type { AIFeature } from "@/features/ai/config.server";
import {
  isRecord, normalizeStreamUsage, summarizeAIUsage,
  type AIUsageStatus, type AIUsageSummary, type NormalizedAIUsage,
} from "@/features/ai/usage";

export type AIUsageTrace = {
  turnId: string;
  sessionId: string;
  historyRecordId: string | null;
  messageId: number | null;
};
export type AIModelCall = { id: string; sequence: number; metadata: string };
export type AIRecordedState = "running" | "complete" | "stopped" | "error";
export type AIUsageScope = { turnId: string } | { feature: AIFeature; sessionId: string };

function touchUsageTurn(db: D1Database, userId: string, turnId: string) {
  return db.prepare("UPDATE ai_usage_turns SET revision = revision + 1, updated_at = ? WHERE user_id = ? AND id = ?")
    .bind(unixNow(), userId, turnId);
}

export function usageScopeFilter(scope: AIUsageScope) {
  return "turnId" in scope
    ? { sql: "t.id = ?", values: [scope.turnId] }
    : { sql: "t.feature = ? AND t.session_id = ?", values: [scope.feature, scope.sessionId] };
}

type SummaryRow = {
  turn_id: string; revision: number; call_id: string | null;
  usage_status: AIUsageStatus; normalized_json: string | null; tool_count: number;
};

export async function getUsageSummaries(
  db: D1Database, userId: string, scope: AIUsageScope,
): Promise<AIUsageSummary[]> {
  const filter = usageScopeFilter(scope);
  const { results } = await db.prepare(`
    SELECT t.id AS turn_id, t.revision, c.id AS call_id, c.usage_status, c.normalized_json,
      (SELECT COUNT(*) FROM ai_tool_calls tool WHERE tool.model_call_id = c.id) AS tool_count
    FROM ai_usage_turns t LEFT JOIN ai_model_calls c ON c.user_id = t.user_id AND c.turn_id = t.id
    WHERE t.user_id = ? AND ${filter.sql}
    ORDER BY t.created_at, c.sequence
  `).bind(userId, ...filter.values).all<SummaryRow>();
  const groups = new Map<string, SummaryRow[]>();
  for (const row of results) groups.set(row.turn_id, [...(groups.get(row.turn_id) ?? []), row]);
  return [...groups.entries()].map(([turnId, rows]) => summarizeAIUsage(
    turnId, rows[0].revision,
    rows.flatMap((row) => row.call_id ? [{
      usageStatus: row.usage_status,
      usage: row.normalized_json ? JSON.parse(row.normalized_json) as NormalizedAIUsage : null,
    }] : []),
    rows.reduce((sum, row) => sum + row.tool_count, 0),
  ));
}

export async function recordUsageObservation(args: {
  db: D1Database; userId: string; turnId: string; callId: string;
  source: "stream" | "generation"; payload: Record<string, unknown> | null;
  usage: NormalizedAIUsage | null; httpStatus?: number | null; errorCode?: string;
}) {
  const { db, userId, turnId, callId, source, payload, usage } = args;
  const known = usage?.cost !== null && usage?.cost !== undefined;
  const fields = Object.fromEntries(Object.entries(usage ?? {}).filter(([, value]) => value !== null));
  await db.batch([
    db.prepare(`INSERT INTO ai_usage_observations
      (id, model_call_id, source, outcome, http_status, error_code, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), callId, source, known ? "complete" : "unavailable",
        args.httpStatus ?? null, args.errorCode ?? null, payload ? JSON.stringify(payload) : null, unixNow()),
    // Final stream usage takes precedence over a concurrent generation lookup.
    db.prepare(`UPDATE ai_model_calls SET
      normalized_json = CASE WHEN ? = 'generation' AND cost IS NOT NULL THEN normalized_json
        ELSE json_patch(COALESCE(normalized_json, '{}'), ?) END,
      cost = CASE WHEN ? = 'generation' AND cost IS NOT NULL THEN cost ELSE COALESCE(?, cost) END,
      usage_status = CASE WHEN ? IS NOT NULL OR cost IS NOT NULL THEN 'complete'
        WHEN ? = 'generation' THEN 'unavailable' ELSE usage_status END,
      usage_json = CASE WHEN ? = 'stream' THEN ? ELSE usage_json END
      WHERE id = ? AND user_id = ? AND turn_id = ?`)
      .bind(source, JSON.stringify(fields), source, usage?.cost ?? null, usage?.cost ?? null, source, source,
        source === "stream" && payload && isRecord(payload.usage) ? JSON.stringify(payload.usage) : null,
        callId, userId, turnId),
    touchUsageTurn(db, userId, turnId),
  ]);
}

export class AIUsageRecorder {
  private sequence = 0;
  private previousCallId: string | null = null;
  onUsage?: (usage: AIUsageSummary) => void;

  constructor(
    readonly db: D1Database,
    readonly userId: string,
    readonly feature: AIFeature,
    readonly trace: AIUsageTrace,
    readonly workspaceId: string,
  ) {}

  async initialize() {
    const now = unixNow();
    const result = await this.db.prepare(`INSERT INTO ai_usage_turns
      (user_id, id, feature, session_id, history_record_id, message_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, id) DO NOTHING`)
      .bind(this.userId, this.trace.turnId, this.feature, this.trace.sessionId,
        this.trace.historyRecordId, this.trace.messageId, now, now).run();
    return result.meta.changes > 0;
  }

  async publish() {
    const [summary] = await getUsageSummaries(this.db, this.userId, { turnId: this.trace.turnId });
    if (summary) this.onUsage?.(summary);
    return summary;
  }

  async startCall(payload: Record<string, unknown>, requestedModel: string): Promise<AIModelCall> {
    const call = { id: crypto.randomUUID(), sequence: ++this.sequence, metadata: "" };
    await this.db.batch([
      this.db.prepare(`INSERT INTO ai_model_calls
        (id, user_id, turn_id, sequence, parent_call_id, credential_hash, workspace_id, requested_model, request_json, created_at)
        VALUES (?, ?, ?, ?, ?, (SELECT key_hash FROM user_ai_credentials WHERE user_id = ?), ?, ?, ?, ?)`)
        .bind(call.id, this.userId, this.trace.turnId, call.sequence, this.previousCallId,
          this.userId, this.workspaceId, requestedModel, JSON.stringify(payload), unixNow()),
      touchUsageTurn(this.db, this.userId, this.trace.turnId),
    ]);
    this.previousCallId = call.id;
    return call;
  }

  async response(call: AIModelCall, response: Response) {
    await this.db.prepare("UPDATE ai_model_calls SET http_status = ?, generation_id = COALESCE(?, generation_id) WHERE id = ? AND user_id = ?")
      .bind(response.status, response.headers.get("X-Generation-Id"), call.id, this.userId).run();
    await this.publish();
  }

  async chunk(call: AIModelCall, chunk: Record<string, unknown>) {
    const choice = Array.isArray(chunk.choices) && isRecord(chunk.choices[0]) ? chunk.choices[0] : {};
    const values = [chunk.id, chunk.model, chunk.provider, choice.finish_reason, choice.native_finish_reason]
      .map((value) => typeof value === "string" && value ? value : null);
    const metadata = JSON.stringify(values);
    if (values.some(Boolean) && metadata !== call.metadata) {
      await this.db.prepare(`UPDATE ai_model_calls SET generation_id = COALESCE(?, generation_id),
        model = COALESCE(?, model), provider = COALESCE(?, provider),
        finish_reason = COALESCE(?, finish_reason), native_finish_reason = COALESCE(?, native_finish_reason)
        WHERE id = ? AND user_id = ?`)
        .bind(...values, call.id, this.userId).run();
      call.metadata = metadata;
    }
    if (isRecord(chunk.usage)) {
      await recordUsageObservation({
        db: this.db, userId: this.userId, turnId: this.trace.turnId, callId: call.id,
        source: "stream", payload: chunk, usage: normalizeStreamUsage(chunk.usage), httpStatus: 200,
      });
      await this.publish();
    }
  }

  async finishCall(call: AIModelCall, state: AIRecordedState) {
    await this.db.prepare("UPDATE ai_model_calls SET state = ?, ended_at = ? WHERE id = ? AND user_id = ?")
      .bind(state, unixNow(), call.id, this.userId).run();
  }

  async startTool(call: AIModelCall, tool: { id: string; function: { name: string; arguments: string } }) {
    const id = crypto.randomUUID();
    await this.db.batch([
      this.db.prepare(`INSERT INTO ai_tool_calls
        (id, model_call_id, tool_call_id, name, arguments, state, created_at)
        VALUES (?, ?, ?, ?, ?, 'running', ?)`)
        .bind(id, call.id, tool.id, tool.function.name, tool.function.arguments, unixNow()),
      touchUsageTurn(this.db, this.userId, this.trace.turnId),
    ]);
    return id;
  }

  async finishTool(id: string, result: string, error: boolean) {
    await this.db.batch([
      this.db.prepare("UPDATE ai_tool_calls SET result = ?, state = ?, ended_at = ? WHERE id = ?")
        .bind(result, error ? "error" : "complete", unixNow(), id),
      touchUsageTurn(this.db, this.userId, this.trace.turnId),
    ]);
    await this.publish();
  }

  async finish(state: Exclude<AIRecordedState, "running">) {
    const now = unixNow();
    await this.db.batch([
      this.db.prepare("UPDATE ai_model_calls SET state = ?, ended_at = ? WHERE user_id = ? AND turn_id = ? AND state = 'running'")
        .bind(state, now, this.userId, this.trace.turnId),
      this.db.prepare(`UPDATE ai_tool_calls SET state = 'error', ended_at = ?
        WHERE state = 'running' AND model_call_id IN (SELECT id FROM ai_model_calls WHERE user_id = ? AND turn_id = ?)`)
        .bind(now, this.userId, this.trace.turnId),
      this.db.prepare("UPDATE ai_usage_turns SET state = ?, ended_at = ?, updated_at = ?, revision = revision + 1 WHERE user_id = ? AND id = ?")
        .bind(state, now, now, this.userId, this.trace.turnId),
    ]);
  }
}
