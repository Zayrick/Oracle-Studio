import type { Route } from "./+types/liuyao-ai";

import {
  enqueueAIStreamEvent,
  parseOpenRouterChunkDeltas,
  parseOpenRouterSseLine,
} from "@/features/ai/openrouter-stream";
import {
  LLM_APP_TITLE,
  getLlmChatCompletionsUrl,
  getLlmModel,
} from "@/features/ai/llm-config";
import { cloudflareContext } from "@/lib/cloudflare-context";

type LiuyaoAIEnv = Env & {
  liuyao_LLM_KEY?: string;
  liuyao_LLM_MODEL?: string;
  liuyao_LLM_BASE?: string;
};

type LiuyaoAIPayload = {
  systemPrompt: string;
  sessionId: string;
  messages: LiuyaoAIMessage[];
};

type LiuyaoAIMessage = {
  role: "user" | "assistant";
  content: string;
};

type LLMChatCompletionRequest = {
  model: string;
  session_id: string;
  stream: true;
  messages: Array<{ role: "system" | LiuyaoAIMessage["role"]; content: string }>;
};

export function loader() {
  return jsonError("仅支持 POST 请求。", 405, { Allow: "POST" });
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return jsonError("仅支持 POST 请求。", 405, { Allow: "POST" });
  }

  const env = context.get(cloudflareContext).env as LiuyaoAIEnv;
  const apiKey = env.liuyao_LLM_KEY?.trim();

  if (!apiKey) {
    return jsonError("服务端未配置 liuyao_LLM_KEY。", 500);
  }

  const clientPayload = await readClientPayload(request);

  if (!clientPayload.ok) {
    return jsonError(clientPayload.error, 400);
  }

  const llmResponse = await fetch(getLlmChatCompletionsUrl(env.liuyao_LLM_BASE), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "text/event-stream",
      "Content-Type": "application/json",
      "HTTP-Referer": new URL(request.url).origin,
      "X-Title": LLM_APP_TITLE,
    },
    body: JSON.stringify(buildLlmRequestBody(env, clientPayload.value)),
  });

  if (!llmResponse.ok) {
    const upstreamError = await readText(llmResponse.body);
    return jsonError(formatUpstreamError(llmResponse.status, upstreamError), 502);
  }

  if (!llmResponse.body) {
    return jsonError("LLM 服务未返回可读取的流。", 502);
  }

  return new Response(streamLlmEvents(llmResponse.body), {
    headers: {
      "Cache-Control": "no-store, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function buildLlmRequestBody(env: LiuyaoAIEnv, payload: LiuyaoAIPayload) {
  return {
    model: getLlmModel(env.liuyao_LLM_MODEL),
    session_id: payload.sessionId,
    stream: true,
    messages: [{ role: "system", content: payload.systemPrompt }, ...payload.messages],
  } satisfies LLMChatCompletionRequest;
}

async function readClientPayload(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return { ok: false, error: "请求体不是有效 JSON。" } as const;
  }

  if (!isRecord(body)) {
    return { ok: false, error: "请求体内容不合法。" } as const;
  }

  const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const messages = Array.isArray(body.messages) ? normalizeLiuyaoAIMessages(body.messages) : [];

  if (!systemPrompt || !sessionId || messages.length === 0) {
    return { ok: false, error: "请求体缺少必要提示词。" } as const;
  }

  if (messages[messages.length - 1]?.role !== "user") {
    return { ok: false, error: "最后一条消息必须是用户提问。" } as const;
  }

  return {
    ok: true,
    value: { systemPrompt, sessionId, messages } satisfies LiuyaoAIPayload,
  } as const;
}

function normalizeLiuyaoAIMessages(messages: unknown[]) {
  return messages
    .flatMap((message): LiuyaoAIMessage[] => {
      if (!isRecord(message)) {
        return [];
      }

      const role = message.role;
      const content = typeof message.content === "string" ? message.content : "";

      if ((role !== "user" && role !== "assistant") || !content) {
        return [];
      }

      return [
        {
          role,
          content,
        },
      ];
    });
}

function streamLlmEvents(body: ReadableStream<Uint8Array>) {
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
          emitLlmSseLine(buffer, controller, encoder);
        }

        controller.close();
      } catch (error) {
        await reader.cancel().catch(() => undefined);
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
    emitLlmSseLine(line, controller, encoder);
  }

  return rest;
}

function emitLlmSseLine(
  line: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder
) {
  const chunk = parseOpenRouterSseLine(line);

  if (!chunk) {
    return;
  }

  for (const delta of parseOpenRouterChunkDeltas(chunk)) {
    for (const event of delta.events) {
      enqueueAIStreamEvent(controller, encoder, event);
    }
  }
}

async function readText(body: ReadableStream<Uint8Array> | null) {
  if (!body) {
    return "";
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";

  try {
    while (true) {
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

  return text;
}

function formatUpstreamError(status: number, errorText: string) {
  const trimmedError = errorText.trim();

  return trimmedError
    ? `LLM 请求失败（${status}）：${trimmedError}`
    : `LLM 请求失败（${status}）。`;
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
