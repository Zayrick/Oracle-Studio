import {
  enqueueAIStreamEvent,
  parseOpenRouterChunkDeltas,
  parseOpenRouterSseLine,
} from "@/features/ai/openrouter-stream";
import {
  AIRequestError,
  requestAICompletion,
  type AIConnection,
} from "@/features/ai/request.server";

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
  messages: Array<{
    role: "system" | LiuyaoAIMessage["role"];
    content: string;
  }>;
};

export async function handleLiuyaoAI(
  request: Request,
  connection: AIConnection,
) {
  const clientPayload = await readClientPayload(request);
  if (!clientPayload.ok) throw new AIRequestError(400, clientPayload.error);
  const abortController = new AbortController();
  const body = await requestAICompletion(
    connection,
    clientPayload.value.sessionId,
    buildLlmRequestBody(clientPayload.value),
    abortController.signal,
  );
  return streamLlmEvents(body, abortController);
}

function buildLlmRequestBody(payload: LiuyaoAIPayload) {
  return {
    messages: [
      { role: "system", content: payload.systemPrompt },
      ...payload.messages,
    ],
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

  const systemPrompt =
    typeof body.systemPrompt === "string" ? body.systemPrompt : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const messages = Array.isArray(body.messages)
    ? normalizeLiuyaoAIMessages(body.messages)
    : [];

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
  return messages.flatMap((message): LiuyaoAIMessage[] => {
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

function streamLlmEvents(
  body: ReadableStream<Uint8Array>,
  abortController: AbortController,
) {
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

        if (!abortController.signal.aborted) controller.close();
      } catch {
        await reader.cancel().catch(() => undefined);
        if (!abortController.signal.aborted) {
          enqueueAIStreamEvent(controller, encoder, {
            type: "error",
            message: "AI 解卦失败，请稍后重试。",
          });
          controller.close();
        }
      } finally {
        reader.releaseLock();
      }
    },
    async cancel() {
      abortController.abort();
      await reader?.cancel().catch(() => undefined);
    },
  });
}

function emitCompleteSseLines(
  buffer: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
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
  encoder: TextEncoder,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
