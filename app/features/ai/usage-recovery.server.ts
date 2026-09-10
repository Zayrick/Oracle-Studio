import { z } from "zod";
import { getAccountState } from "@/features/auth/auth.server";
import { getOpenRouterAPIBase, OPENROUTER_API_BASE } from "@/features/ai/config.server";
import { getUserAIKey } from "@/features/ai/credentials.server";
import { isRecord, normalizeGenerationUsage } from "@/features/ai/usage";
import {
  getUsageSummaries, recordUsageObservation, usageScopeFilter, type AIUsageScope,
} from "@/features/ai/usage-store.server";

const recoveryRequest = z.object({
  feature: z.enum(["bazi", "liuyao"]),
  sessionId: z.string().min(1).max(200),
});

async function readGenerationSnapshot(response: Response, apiKey: string): Promise<Record<string, unknown>> {
  const text = (await response.text()).replaceAll(apiKey, "[REDACTED]");
  try {
    const json: unknown = JSON.parse(text);
    return isRecord(json) ? json : { body: json };
  } catch {
    return { raw_body: text };
  }
}

export async function recoverUsage({ db, apiKey, userId, scope, apiBase = OPENROUTER_API_BASE }: {
  apiBase?: string;
  db: D1Database; apiKey: string; userId: string; scope: AIUsageScope;
}) {
  const filter = usageScopeFilter(scope);
  const { results: calls } = await db.prepare(`
    SELECT c.id, c.turn_id, c.generation_id FROM ai_model_calls c
    JOIN ai_usage_turns t ON t.user_id = c.user_id AND t.id = c.turn_id
    WHERE t.user_id = ? AND ${filter.sql} AND c.usage_status != 'complete'
    ORDER BY t.created_at, c.sequence
  `).bind(userId, ...filter.values).all<{ id: string; turn_id: string; generation_id: string | null }>();

  for (const call of calls) {
    let payload: Record<string, unknown> | null = null;
    let httpStatus: number | null = null;
    let errorCode: string | undefined;
    let usage: ReturnType<typeof normalizeGenerationUsage> | null = null;
    try {
      if (!call.generation_id) {
        errorCode = "missing_generation_id";
      } else {
        const response = await fetch(`${apiBase}/generation?id=${encodeURIComponent(call.generation_id)}`, {
          headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
          redirect: "manual",
          signal: AbortSignal.timeout(5_000),
        });
        httpStatus = response.status;
        payload = await readGenerationSnapshot(response, apiKey);
        if (!response.ok) {
          errorCode = `http_${httpStatus}`;
        } else if (!isRecord(payload.data) || payload.data.id !== call.generation_id) {
          errorCode = "invalid_generation";
        } else {
          usage = normalizeGenerationUsage(payload.data);
          if (usage.cost === null) errorCode = "missing_cost";
          await db.prepare(`UPDATE ai_model_calls SET model = COALESCE(?, model),
            provider = COALESCE(?, provider) WHERE id = ? AND user_id = ? AND cost IS NULL`)
            .bind(typeof payload.data.model === "string" ? payload.data.model : null,
              typeof payload.data.provider_name === "string" ? payload.data.provider_name : null, call.id, userId).run();
        }
      }
    } catch {
      errorCode = "lookup_failed";
    }
    await recordUsageObservation({
      db, userId, turnId: call.turn_id, callId: call.id, source: "generation",
      payload, usage, httpStatus, errorCode,
    });
  }
}

export async function handleAIUsageRequest(request: Request, env: Env, ctx: ExecutionContext) {
  const headers = new Headers({ "Cache-Control": "private, no-store", Vary: "Cookie, X-Account-Id" });
  const fail = (status: number, error: string) => Response.json({ error }, { status, headers });
  if (request.method !== "POST") {
    headers.set("Allow", "POST");
    return fail(405, "仅支持 POST 请求。");
  }
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail(403, "请求来源不合法。");
  try {
    const account = await getAccountState(request, env, ctx, headers);
    if (!account.available) return fail(503, "账户服务暂时不可用。");
    if (!account.user) return fail(401, "请登录后查询用量。");
    if (!account.user.emailVerified) return fail(403, "请先验证邮箱。");
    if (request.headers.get("X-Account-Id") !== account.user.id) return fail(409, "账户已切换，请刷新后重试。");
    const parsed = recoveryRequest.safeParse(await request.json());
    if (!parsed.success) return fail(400, "用量查询参数不合法。");
    const scope = parsed.data;
    const userId = account.user.id;
    let usages = await getUsageSummaries(env.AUTH_DB, userId, scope);
    if (usages.some((usage) => usage.status !== "complete")) {
      const apiKey = await getUserAIKey(env, userId);
      const task = recoverUsage({ db: env.AUTH_DB, apiKey, userId, scope, apiBase: getOpenRouterAPIBase(env) });
      ctx.waitUntil(task);
      await task;
      usages = await getUsageSummaries(env.AUTH_DB, userId, scope);
    }
    return Response.json({ usages }, { headers });
  } catch {
    console.error(JSON.stringify({ event: "ai_usage_recovery_failed" }));
    return fail(503, "无法获取费用");
  }
}
