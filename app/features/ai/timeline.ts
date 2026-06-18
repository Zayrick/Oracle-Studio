export type AIMessageStatus = "streaming" | "complete" | "stopped" | "error";

export type AIMessagePart =
  | {
      id: string;
      type: "reasoning";
      text: string;
    }
  | {
      id: string;
      type: "text";
      text: string;
    }
  | {
      id: string;
      type: "tool";
      callId: string;
      name: string;
      displayName?: string;
      arguments: string;
      result?: string;
      status: "running" | "complete" | "error";
    };

export type AIStreamEvent =
  | {
      type: "reasoning";
      text: string;
    }
  | {
      type: "text";
      text: string;
    }
  | {
      type: "tool_call";
      callId: string;
      name: string;
      displayName?: string;
      arguments: string;
    }
  | {
      type: "tool_result";
      callId: string;
      name: string;
      displayName?: string;
      result: string;
      error?: string;
    }
  | {
      type: "error";
      message: string;
    };

export type AIMessageWithParts = {
  content: string;
  parts?: AIMessagePart[];
};

export function serializeAIStreamEvent(event: AIStreamEvent) {
  return `${JSON.stringify(event)}\n`;
}

export function parseAIStreamEventLine(line: string): AIStreamEvent | null {
  const trimmed = line.trim();

  if (!trimmed) {
    return null;
  }

  let value: unknown;

  try {
    value = JSON.parse(trimmed);
  } catch {
    throw new Error("AI 流式响应解析失败。");
  }

  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }

  switch (value.type) {
    case "reasoning":
      return typeof value.text === "string" && value.text
        ? { type: "reasoning", text: value.text }
        : null;
    case "text":
      return typeof value.text === "string" && value.text
        ? { type: "text", text: value.text }
        : null;
    case "tool_call":
      if (typeof value.callId !== "string" || typeof value.name !== "string") {
        return null;
      }

      return {
        type: "tool_call",
        callId: value.callId,
        name: value.name,
        displayName: typeof value.displayName === "string" ? value.displayName : undefined,
        arguments: typeof value.arguments === "string" ? value.arguments : "",
      };
    case "tool_result":
      if (
        typeof value.callId !== "string" ||
        typeof value.name !== "string" ||
        typeof value.result !== "string"
      ) {
        return null;
      }

      return {
        type: "tool_result",
        callId: value.callId,
        name: value.name,
        displayName: typeof value.displayName === "string" ? value.displayName : undefined,
        result: value.result,
        error: typeof value.error === "string" ? value.error : undefined,
      };
    case "error":
      return typeof value.message === "string" && value.message
        ? { type: "error", message: value.message }
        : null;
    default:
      return null;
  }
}

export function appendAIStreamEventToMessage<T extends AIMessageWithParts>(
  message: T,
  event: AIStreamEvent
): T {
  if (event.type === "error") {
    return message;
  }

  const parts = message.parts ? [...message.parts] : [];
  const nextContent = event.type === "text" ? message.content + event.text : message.content;

  switch (event.type) {
    case "reasoning":
      appendTextualPart(parts, "reasoning", event.text);
      break;
    case "text":
      appendTextualPart(parts, "text", event.text);
      break;
    case "tool_call":
      upsertToolPart(parts, {
        callId: event.callId,
        name: event.name,
        displayName: event.displayName,
        arguments: event.arguments,
        status: "running",
      });
      break;
    case "tool_result":
      upsertToolPart(parts, {
        callId: event.callId,
        name: event.name,
        displayName: event.displayName,
        arguments: "",
        result: event.result,
        status: event.error ? "error" : "complete",
      });
      break;
  }

  return {
    ...message,
    content: nextContent,
    parts,
  };
}

export function getAIMessageTextFromParts(parts: AIMessagePart[] | undefined) {
  return parts
    ?.flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("") ?? "";
}

export async function readAIStreamEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AIStreamEvent) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      buffer = parseCompleteEventLines(buffer, onEvent);
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      const event = parseAIStreamEventLine(buffer);

      if (event) {
        onEvent(event);
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function parseCompleteEventLines(
  buffer: string,
  onEvent: (event: AIStreamEvent) => void
) {
  const lines = buffer.split(/\r?\n/);
  const rest = lines.pop() ?? "";

  for (const line of lines) {
    const event = parseAIStreamEventLine(line);

    if (event) {
      onEvent(event);
    }
  }

  return rest;
}

function appendTextualPart(
  parts: AIMessagePart[],
  type: "reasoning" | "text",
  text: string
) {
  if (!text) {
    return;
  }

  const lastPart = parts[parts.length - 1];

  if (lastPart?.type === type) {
    lastPart.text += text;
    return;
  }

  parts.push({
    id: createPartId(parts),
    type,
    text,
  });
}

function upsertToolPart(
  parts: AIMessagePart[],
  tool: {
    callId: string;
    name: string;
    displayName?: string;
    arguments: string;
    result?: string;
    status: "running" | "complete" | "error";
  }
) {
  const existing = parts.find(
    (part): part is Extract<AIMessagePart, { type: "tool" }> =>
      part.type === "tool" && part.callId === tool.callId
  );

  if (existing) {
    existing.name = tool.name || existing.name;
    existing.displayName = tool.displayName || existing.displayName;
    existing.arguments = tool.arguments || existing.arguments;
    existing.result = tool.result ?? existing.result;
    existing.status = tool.status;
    return;
  }

  parts.push({
    id: createPartId(parts),
    type: "tool",
    callId: tool.callId,
    name: tool.name,
    displayName: tool.displayName,
    arguments: tool.arguments,
    result: tool.result,
    status: tool.status,
  });
}

function createPartId(parts: AIMessagePart[]) {
  return `part-${parts.length + 1}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
