import {
  appendAIStreamEventToMessage,
  getAIMessageTextFromParts,
  type AIMessagePart,
  type AIMessageStatus,
  type AIStreamEvent,
} from "@/features/ai/timeline";

export type AIChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  parts?: AIMessagePart[];
  status?: AIMessageStatus;
};

export type AIChatRequestMessage = Pick<AIChatMessage, "role" | "content">;

export function createAIChatSessionId(prefix: string) {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getNextAIChatMessageId(messages: AIChatMessage[]) {
  return messages.reduce((nextId, message) => Math.max(nextId, message.id + 1), 1);
}

export function appendAIChatEventToMessage<Message extends AIChatMessage>(
  messages: Message[],
  messageId: number,
  event: AIStreamEvent
) {
  return messages.map((item) =>
    item.id === messageId
      ? appendAIStreamEventToMessage(item, event)
      : item
  );
}

export function markStreamingAIChatMessagesStopped<Message extends AIChatMessage>(
  messages: Message[]
) {
  let changed = false;
  const nextMessages = messages.map((message) => {
    if (message.status !== "streaming") {
      return message;
    }

    changed = true;
    return {
      ...message,
      content: message.content || "已停止。",
      status: "stopped" as const,
    };
  });

  return changed ? nextMessages : messages;
}

export function buildAIChatRequestMessages<Message extends AIChatMessage>(
  messages: Message[],
  currentContent: string
) {
  const history = messages.flatMap((item): AIChatRequestMessage[] => {
    const content = item.content || getAIMessageTextFromParts(item.parts);

    if (!content || (item.role === "assistant" && item.status === "error")) {
      return [];
    }

    return [
      {
        role: item.role,
        content,
      },
    ];
  });

  return [
    ...history,
    {
      role: "user" as const,
      content: currentContent,
    },
  ];
}

export async function readAIErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json();

    if (isRecord(data) && typeof data.error === "string") {
      return data.error;
    }
  } catch {
    // Fall through to the generic message below.
  }

  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
