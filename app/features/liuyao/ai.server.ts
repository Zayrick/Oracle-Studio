import { AIRequestError, type AIConnection } from "@/features/ai/request.server";
import { createAIResponseStream, streamAICompletion } from "@/features/ai/completion.server";

type LiuyaoAIPayload = {
  systemPrompt: string;
  messages: LiuyaoAIMessage[];
};

type LiuyaoAIMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function handleLiuyaoAI(
  payload: unknown,
  connection: AIConnection,
) {
  const clientPayload = readClientPayload(payload);
  if (!clientPayload.ok) throw new AIRequestError(400, clientPayload.error);
  return createAIResponseStream(connection, async (emit, signal) => {
    await streamAICompletion(connection, {
      messages: [
        { role: "system", content: clientPayload.value.systemPrompt },
        ...clientPayload.value.messages,
      ],
    }, emit, signal);
  });
}

function readClientPayload(body: unknown) {
  if (!isRecord(body)) {
    return { ok: false, error: "请求体内容不合法。" } as const;
  }

  const systemPrompt =
    typeof body.systemPrompt === "string" ? body.systemPrompt : "";
  const messages = Array.isArray(body.messages)
    ? normalizeLiuyaoAIMessages(body.messages)
    : [];

  if (!systemPrompt || messages.length === 0) {
    return { ok: false, error: "请求体缺少必要提示词。" } as const;
  }

  if (messages[messages.length - 1]?.role !== "user") {
    return { ok: false, error: "最后一条消息必须是用户提问。" } as const;
  }

  return {
    ok: true,
    value: { systemPrompt, messages } satisfies LiuyaoAIPayload,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
