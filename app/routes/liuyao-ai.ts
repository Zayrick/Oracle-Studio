import type { Route } from "./+types/liuyao-ai";

import { cloudflareContext } from "@/lib/cloudflare-context";

const OPENROUTER_CHAT_COMPLETIONS_URL = "https://us.oxio.uno/fetch/openrouter.ai/api/v1/chat/completions";
const DEFAULT_LIUYAO_OPENROUTER_MODEL = "deepseek/deepseek-chat-v3.1";
const DEFAULT_LIUYAO_OPENROUTER_APP_NAME = "Oracle Studio";
const MAX_BASE64_PAYLOAD_LENGTH = 90_000;
const MAX_OPENROUTER_ERROR_LENGTH = 2_000;
const MAX_LIUYAO_SESSION_ID_LENGTH = 256;
const MAX_LIUYAO_CONTEXT_MESSAGES = 12;
const MAX_LIUYAO_MESSAGE_CONTENT_LENGTH = 4_000;

type LiuyaoAIEnv = Env & {
  liuyao_OPENROUTER_API_KEY?: string;
  liuyao_OPENROUTER_MODEL?: string;
  liuyao_OPENROUTER_APP_NAME?: string;
  liuyao_OPENROUTER_PROVIDER_SORT?: string;
  liuyao_OPENROUTER_REASONING_EFFORT?: string;
};

type LiuyaoAIClientRequest = {
  payload: string;
};

type LiuyaoAIDecodedPayload = {
  systemPrompt: string;
  sessionId: string;
  messages: LiuyaoAIMessage[];
};

type LiuyaoAIMessage = {
  role: "user" | "assistant";
  content: string;
};

type OpenRouterChatCompletionRequest = {
  model: string;
  session_id: string;
  stream: true;
  messages: Array<{ role: "system" | LiuyaoAIMessage["role"]; content: string }>;
  provider?: {
    sort: string;
  };
  reasoning?: {
    effort: string;
  };
};

type OpenRouterStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: unknown;
  };
};

export function loader() {
  return jsonError("仅支持 POST 请求。", 405, { Allow: "POST" });
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return jsonError("仅支持 POST 请求。", 405, { Allow: "POST" });
  }

  const env = context.get(cloudflareContext).env as LiuyaoAIEnv;
  const apiKey = env.liuyao_OPENROUTER_API_KEY;

  if (!apiKey) {
    return jsonError("服务端未配置 liuyao_OPENROUTER_API_KEY。", 500);
  }

  const clientPayload = await readClientPayload(request);

  if (!clientPayload.ok) {
    return jsonError(clientPayload.error, 400);
  }

  const decodedPayload = decodeLiuyaoPayload(clientPayload.value.payload);

  if (!decodedPayload.ok) {
    return jsonError(decodedPayload.error, 400);
  }

  const openRouterResponse = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": new URL(request.url).origin,
      "X-Title": env.liuyao_OPENROUTER_APP_NAME || DEFAULT_LIUYAO_OPENROUTER_APP_NAME,
    },
    body: JSON.stringify(buildOpenRouterRequestBody(env, decodedPayload.value)),
  });

  if (!openRouterResponse.ok) {
    const upstreamError = await readBoundedText(openRouterResponse.body);
    return jsonError(formatUpstreamError(openRouterResponse.status, upstreamError), 502);
  }

  if (!openRouterResponse.body) {
    return jsonError("OpenRouter 未返回可读取的流。", 502);
  }

  return new Response(streamOpenRouterText(openRouterResponse.body), {
    headers: {
      "Cache-Control": "no-store, no-transform",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function buildOpenRouterRequestBody(env: LiuyaoAIEnv, payload: LiuyaoAIDecodedPayload) {
  const providerSort = env.liuyao_OPENROUTER_PROVIDER_SORT?.trim();
  const reasoningEffort = env.liuyao_OPENROUTER_REASONING_EFFORT?.trim();

  const body: OpenRouterChatCompletionRequest = {
    model: env.liuyao_OPENROUTER_MODEL || DEFAULT_LIUYAO_OPENROUTER_MODEL,
    session_id: payload.sessionId,
    stream: true,
    messages: [{ role: "system", content: payload.systemPrompt }, ...payload.messages],
  };

  if (providerSort) {
    body.provider = {
      sort: providerSort,
    };
  }

  if (reasoningEffort) {
    body.reasoning = {
      effort: reasoningEffort,
    };
  }

  return body;
}

async function readClientPayload(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return { ok: false, error: "请求体不是有效 JSON。" } as const;
  }

  if (!isRecord(body) || typeof body.payload !== "string") {
    return { ok: false, error: "请求体缺少 payload。" } as const;
  }

  if (body.payload.length === 0 || body.payload.length > MAX_BASE64_PAYLOAD_LENGTH) {
    return { ok: false, error: "payload 长度不合法。" } as const;
  }

  return { ok: true, value: body as LiuyaoAIClientRequest } as const;
}

function decodeLiuyaoPayload(payload: string) {
  let decoded: unknown;

  try {
    const binary = atob(payload);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    decoded = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { ok: false, error: "payload 解码失败。" } as const;
  }

  if (!isRecord(decoded)) {
    return { ok: false, error: "payload 内容不合法。" } as const;
  }

  const systemPrompt = typeof decoded.systemPrompt === "string" ? decoded.systemPrompt.trim() : "";
  const sessionId = typeof decoded.sessionId === "string" ? decoded.sessionId.trim() : "";
  const messages = Array.isArray(decoded.messages) ? normalizeLiuyaoAIMessages(decoded.messages) : [];

  if (!systemPrompt || !sessionId || messages.length === 0) {
    return { ok: false, error: "payload 缺少必要提示词。" } as const;
  }

  if (sessionId.length > MAX_LIUYAO_SESSION_ID_LENGTH) {
    return { ok: false, error: "sessionId 长度不合法。" } as const;
  }

  if (messages[messages.length - 1]?.role !== "user") {
    return { ok: false, error: "最后一条消息必须是用户提问。" } as const;
  }

  return {
    ok: true,
    value: { systemPrompt, sessionId, messages } satisfies LiuyaoAIDecodedPayload,
  } as const;
}

function normalizeLiuyaoAIMessages(messages: unknown[]) {
  return messages
    .slice(-MAX_LIUYAO_CONTEXT_MESSAGES)
    .flatMap((message): LiuyaoAIMessage[] => {
      if (!isRecord(message)) {
        return [];
      }

      const role = message.role;
      const content = typeof message.content === "string" ? message.content.trim() : "";

      if ((role !== "user" && role !== "assistant") || !content) {
        return [];
      }

      return [
        {
          role,
          content: content.slice(0, MAX_LIUYAO_MESSAGE_CONTENT_LENGTH),
        },
      ];
    });
}

function streamOpenRouterText(body: ReadableStream<Uint8Array>) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      reader = body.getReader();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          buffer = emitCompleteSseLines(buffer, controller, encoder);
        }

        buffer += decoder.decode();

        if (buffer.trim()) {
          emitOpenRouterSseLine(buffer, controller, encoder);
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
    async cancel() {
      await reader?.cancel();
    },
  });
}

function emitCompleteSseLines(
  buffer: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder
) {
  const lines = buffer.split(/\r?\n/);
  const rest = lines.pop() ?? "";

  for (const line of lines) {
    emitOpenRouterSseLine(line, controller, encoder);
  }

  return rest;
}

function emitOpenRouterSseLine(
  line: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder
) {
  const trimmed = line.trim();

  if (!trimmed.startsWith("data:")) {
    return;
  }

  const data = trimmed.slice("data:".length).trim();

  if (!data || data === "[DONE]") {
    return;
  }

  let chunk: OpenRouterStreamChunk;

  try {
    chunk = JSON.parse(data) as OpenRouterStreamChunk;
  } catch {
    throw new Error("OpenRouter 流式响应解析失败。");
  }

  const upstreamError = chunk.error?.message;

  if (typeof upstreamError === "string" && upstreamError) {
    throw new Error(upstreamError);
  }

  const content = chunk.choices?.[0]?.delta?.content;

  if (typeof content === "string" && content) {
    controller.enqueue(encoder.encode(content));
  }
}

async function readBoundedText(body: ReadableStream<Uint8Array> | null) {
  if (!body) {
    return "";
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";

  try {
    while (text.length < MAX_OPENROUTER_ERROR_LENGTH) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  return text.slice(0, MAX_OPENROUTER_ERROR_LENGTH);
}

function formatUpstreamError(status: number, errorText: string) {
  const trimmedError = errorText.trim();

  return trimmedError
    ? `OpenRouter 请求失败（${status}）：${trimmedError}`
    : `OpenRouter 请求失败（${status}）。`;
}

function jsonError(message: string, status: number, headers?: HeadersInit) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        ...headers,
        "Cache-Control": "no-store",
      },
    }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
