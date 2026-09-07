import {
  getAccountState,
  type AuthEnvironment,
} from "@/features/auth/auth.server";
import { unixNow } from "@/lib/unix-time";
import {
  cloudHistoryEntrySchema,
  historySyncRequestSchema,
  MAX_RECORD_BYTES,
  MAX_SYNC_BYTES,
  type HistoryMutation,
} from "./schema";

interface CloudRow {
  id: string;
  revision: string;
  deleted_at: number | null;
  record_json: string | null;
}
const PAGE_SIZE = 30;

function decodeRow(row: CloudRow) {
  return cloudHistoryEntrySchema.parse({
    id: row.id,
    revision: row.revision,
    deletedAt: row.deleted_at,
    record: row.record_json === null ? null : JSON.parse(row.record_json),
  });
}

export async function listCloudHistory(
  db: D1Database,
  userId: string,
  cursor: string,
) {
  const { results } = await db
    .prepare(
      "SELECT id, revision, deleted_at, record_json FROM user_data WHERE user_id = ? AND id > ? ORDER BY id LIMIT ?",
    )
    .bind(userId, cursor, PAGE_SIZE + 1)
    .all<CloudRow>();
  const rows = results.slice(0, PAGE_SIZE);
  return {
    entries: rows.map(decodeRow),
    cursor: results.length > PAGE_SIZE ? rows.at(-1)!.id : null,
  };
}

export async function applyCloudHistoryChanges(
  db: D1Database,
  userId: string,
  changes: HistoryMutation[],
) {
  const now = unixNow();
  // Each compare-and-swap and its acknowledgement are in the same D1 transaction.
  const results = await db.batch<CloudRow>(
    changes.flatMap((change) => [
      db
        .prepare(
          `
      INSERT INTO user_data (user_id, id, record_json, revision, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, id) DO UPDATE SET
        record_json = excluded.record_json, revision = excluded.revision,
        updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
      WHERE user_data.deleted_at IS NULL AND
        (? = 'delete' OR (? = 'upsert' AND user_data.revision = ?))
    `,
        )
        .bind(
          userId,
          change.id,
          change.record === null ? null : JSON.stringify(change.record),
          change.mutationId,
          change.record?.createdAt ?? now,
          change.record?.updatedAt ?? now,
          change.kind === "delete" ? now : null,
          change.kind,
          change.kind,
          change.baseRevision,
        ),
      db
        .prepare(
          "SELECT id, revision, deleted_at, record_json FROM user_data WHERE user_id = ? AND id = ?",
        )
        .bind(userId, change.id),
    ]),
  );
  return {
    results: changes.map((change, index) => ({
      mutationId: change.mutationId,
      entry: decodeRow(results[index * 2 + 1].results[0]),
    })),
  };
}

class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readSyncBody(request: Request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new RequestError(415, "请使用 JSON 提交同步数据。");
  }
  if (!request.body) throw new RequestError(400, "同步数据为空。");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_SYNC_BYTES) {
        await reader.cancel();
        throw new RequestError(413, "同步数据过大，请分批重试。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new RequestError(400, "同步数据格式不合法。");
  }
  const parsed = historySyncRequestSchema.safeParse(value);
  if (!parsed.success) throw new RequestError(400, "同步数据格式不合法。");
  for (const change of parsed.data.changes) {
    if (
      new TextEncoder().encode(JSON.stringify(change.record)).byteLength >
      MAX_RECORD_BYTES
    ) {
      throw new RequestError(413, "单条记录过大，已保留本机数据。");
    }
    if (change.id === "preferences" && change.kind === "delete")
      throw new RequestError(400, "外观设置不能删除。");
  }
  return parsed.data;
}

export async function handleHistoryRequest(
  request: Request,
  env: AuthEnvironment,
  ctx: ExecutionContext,
) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    Vary: "Cookie, X-Account-Id",
  });
  try {
    if (request.method !== "GET" && request.method !== "POST") {
      headers.set("Allow", "GET, POST");
      throw new RequestError(405, "不支持此请求方法。");
    }
    if (
      request.method === "POST" &&
      request.headers.get("origin") !== new URL(request.url).origin
    ) {
      throw new RequestError(403, "请求来源不合法。");
    }
    const account = await getAccountState(request, env, ctx, headers);
    if (!account.available) throw new RequestError(503, "账户服务暂时不可用。");
    if (!account.user) throw new RequestError(401, "请登录后同步。");
    // A cookie may have changed in another tab since the caller queued these records.
    if (request.headers.get("X-Account-Id") !== account.user.id)
      throw new RequestError(409, "账户已切换，请刷新后重试。");
    if (request.method === "GET") {
      const cursor = new URL(request.url).searchParams.get("cursor") ?? "";
      if (cursor.length > 200) throw new RequestError(400, "分页参数不合法。");
      return Response.json(
        await listCloudHistory(env.AUTH_DB, account.user.id, cursor),
        { headers },
      );
    }
    const { changes } = await readSyncBody(request);
    return Response.json(
      await applyCloudHistoryChanges(env.AUTH_DB, account.user.id, changes),
      { headers },
    );
  } catch (error) {
    if (error instanceof RequestError)
      return Response.json(
        { message: error.message },
        { status: error.status, headers },
      );
    console.error(JSON.stringify({ event: "history_sync_failed" }));
    return Response.json(
      { message: "云端同步暂时失败，本机待同步数据会保留并重试。" },
      { status: 503, headers },
    );
  }
}
