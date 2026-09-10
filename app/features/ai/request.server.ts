import { getAccountState } from "@/features/auth/auth.server";
import {
  AI_APP_TITLE,
  getAIPreset,
  OPENROUTER_API_BASE,
  type AIFeature,
} from "@/features/ai/config.server";
import {
  AICredentialError,
  getUserAIKey,
} from "@/features/ai/credentials.server";

export type AIConnection = {
  apiKey: string;
  userId: string;
  model: string;
  origin: string;
  signal: AbortSignal;
};

export class AIRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function aiMethodNotAllowed() {
  return Response.json(
    { error: "仅支持 POST 请求。" },
    {
      status: 405,
      headers: { Allow: "POST", "Cache-Control": "private, no-store" },
    },
  );
}

export async function handleAIRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  feature: AIFeature,
  handle: (
    request: Request,
    connection: AIConnection,
  ) => Promise<ReadableStream<Uint8Array>>,
) {
  if (request.method !== "POST") return aiMethodNotAllowed();
  const headers = new Headers({
    "Cache-Control": "private, no-store, no-transform",
    "X-Content-Type-Options": "nosniff",
    Vary: "Cookie, X-Account-Id",
  });
  try {
    const origin = new URL(request.url).origin;
    if (request.headers.get("origin") !== origin) {
      throw new AIRequestError(403, "请求来源不合法。");
    }
    const account = await getAccountState(request, env, ctx, headers);
    if (!account.available)
      throw new AIRequestError(503, "账户服务暂时不可用。");
    if (!account.user) throw new AIRequestError(401, "请登录后使用 AI 解读。");
    if (!account.user.emailVerified)
      throw new AIRequestError(403, "请先验证邮箱。");
    // Prevent another tab's session change from billing a request to the wrong account.
    if (request.headers.get("X-Account-Id") !== account.user.id) {
      throw new AIRequestError(409, "账户已切换，请刷新后重试。");
    }
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    ) {
      throw new AIRequestError(415, "请使用 JSON 提交请求。");
    }
    const body = await handle(request, {
      apiKey: await getUserAIKey(env, account.user.id),
      userId: account.user.id,
      model: getAIPreset(env, feature),
      origin,
      signal: request.signal,
    });
    headers.set("Content-Type", "application/x-ndjson; charset=utf-8");
    return new Response(body, { headers });
  } catch (error) {
    let status = 503;
    let message = "AI 服务暂时不可用，请稍后重试。";
    if (error instanceof AIRequestError) {
      status = error.status;
      message = error.message;
    } else if (
      error instanceof AICredentialError &&
      error.code === "AI_ACCOUNT_NOT_BOUND"
    ) {
      message = "账户尚未启用 AI 解读，请重新登录后重试。";
    } else {
      console.error(JSON.stringify({ event: "ai_request_failed", feature }));
    }
    return Response.json({ error: message }, { status, headers });
  }
}

/** Shared inference transport. Management credentials are never used here. */
export async function requestAICompletion(
  connection: AIConnection,
  sessionId: string,
  payload: Record<string, unknown>,
  signal: AbortSignal = connection.signal,
) {
  let response: Response;
  try {
    response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
      method: "POST",
      redirect: "manual",
      headers: {
        Authorization: `Bearer ${connection.apiKey}`,
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        "HTTP-Referer": connection.origin,
        "X-OpenRouter-Title": AI_APP_TITLE,
      },
      body: JSON.stringify({
        ...payload,
        model: connection.model,
        user: connection.userId,
        session_id: `${connection.userId}:${sessionId}`,
        stream: true,
      }),
      signal: AbortSignal.any([connection.signal, signal]),
    });
  } catch {
    throw new AIRequestError(502, "AI 服务连接失败，请稍后重试。");
  }
  if (!response.ok) {
    await response.body?.cancel();
    console.error(
      JSON.stringify({
        event: "ai_upstream_rejected",
        status: response.status,
      }),
    );
    throw new AIRequestError(
      response.status === 429 ? 503 : 502,
      "AI 服务暂时无法完成解读，请稍后重试。",
    );
  }
  if (!response.body)
    throw new AIRequestError(502, "AI 服务未返回内容，请稍后重试。");
  return response.body;
}
