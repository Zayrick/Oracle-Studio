import { serializeAIStreamEvent, type AIStreamEvent } from "./timeline";

export type OpenRouterReasoningConfig = {
  effort?: string;
  max_tokens?: number;
  enabled?: boolean;
  exclude?: boolean;
};

export type OpenRouterReasoningDetail = Record<string, unknown> & {
  text?: unknown;
  summary?: unknown;
};

export type OpenRouterToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type OpenRouterToolCallDelta = {
  index: number;
  id?: string;
  name?: string;
  argumentsFragment: string;
};

type OpenRouterStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: unknown;
      reasoning?: unknown;
      reasoning_content?: unknown;
      reasoning_details?: unknown;
      tool_calls?: unknown;
    };
  }>;
  error?: {
    message?: unknown;
  };
};

export type OpenRouterParsedDelta = {
  events: AIStreamEvent[];
  content: string;
  reasoning: string;
  reasoningDetails: OpenRouterReasoningDetail[];
  toolCallDeltas: OpenRouterToolCallDelta[];
};

export function buildOpenRouterReasoningConfig(effort: string | undefined) {
  const trimmedEffort = effort?.trim();

  if (trimmedEffort) {
    return {
      effort: trimmedEffort,
      exclude: false,
    } satisfies OpenRouterReasoningConfig;
  }

  return {
    enabled: true,
    exclude: false,
  } satisfies OpenRouterReasoningConfig;
}

export function enqueueAIStreamEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: AIStreamEvent
) {
  controller.enqueue(encoder.encode(serializeAIStreamEvent(event)));
}

export function parseOpenRouterSseLine(line: string) {
  const trimmed = line.trim();

  if (!trimmed.startsWith("data:")) {
    return null;
  }

  const data = trimmed.slice("data:".length).trim();

  if (!data || data === "[DONE]") {
    return null;
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

  return chunk;
}

export function parseOpenRouterChunkDeltas(chunk: OpenRouterStreamChunk) {
  return chunk.choices?.flatMap((choice) => {
    if (!choice.delta) {
      return [];
    }

    return [parseOpenRouterDelta(choice.delta)];
  }) ?? [];
}

export function parseOpenRouterDelta(
  delta: NonNullable<NonNullable<OpenRouterStreamChunk["choices"]>[number]["delta"]>
): OpenRouterParsedDelta {
  const content = typeof delta.content === "string" ? delta.content : "";
  const reasoningDetails = normalizeReasoningDetails(delta.reasoning_details);
  const reasoningFromDetails = reasoningDetails
    .flatMap((detail) => {
      const text = typeof detail.text === "string" ? detail.text : "";
      const summary = typeof detail.summary === "string" ? detail.summary : "";

      return text || summary ? [text || summary] : [];
    })
    .join("");
  const reasoningFromStringFields = [delta.reasoning, delta.reasoning_content]
    .flatMap((value) => (typeof value === "string" && value ? [value] : []))
    .join("");
  const reasoning = reasoningFromDetails || reasoningFromStringFields;
  const toolCallDeltas = normalizeToolCallDeltas(delta.tool_calls);
  const events: AIStreamEvent[] = [];

  if (reasoning) {
    events.push({ type: "reasoning", text: reasoning });
  }

  if (content) {
    events.push({ type: "text", text: content });
  }

  return {
    events,
    content,
    reasoning,
    reasoningDetails,
    toolCallDeltas,
  };
}

export class OpenRouterToolCallAccumulator {
  private readonly calls = new Map<number, OpenRouterToolCall>();

  append(deltas: OpenRouterToolCallDelta[]) {
    for (const delta of deltas) {
      const existing = this.calls.get(delta.index);
      const nextCall: OpenRouterToolCall = existing ?? {
        id: delta.id || `tool-call-${delta.index}`,
        type: "function",
        function: {
          name: delta.name || "",
          arguments: "",
        },
      };

      if (delta.id) {
        nextCall.id = delta.id;
      }

      if (delta.name) {
        nextCall.function.name = delta.name;
      }

      nextCall.function.arguments += delta.argumentsFragment;
      this.calls.set(delta.index, nextCall);
    }
  }

  toToolCalls() {
    return [...this.calls.entries()]
      .sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)
      .flatMap(([index, call]) => {
        if (!call.function.name) {
          return [];
        }

        return [
          {
            id: call.id || `tool-call-${index}`,
            type: "function",
            function: {
              name: call.function.name,
              arguments: call.function.arguments || "{}",
            },
          } satisfies OpenRouterToolCall,
        ];
      });
  }
}

function normalizeReasoningDetails(value: unknown): OpenRouterReasoningDetail[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): OpenRouterReasoningDetail[] =>
    isRecord(item) ? [item as OpenRouterReasoningDetail] : []
  );
}

function normalizeToolCallDeltas(value: unknown): OpenRouterToolCallDelta[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): OpenRouterToolCallDelta[] => {
    if (!isRecord(item)) {
      return [];
    }

    const index = typeof item.index === "number" ? item.index : undefined;

    if (index === undefined || !isRecord(item.function)) {
      return [];
    }

    const name = item.function.name;
    const args = item.function.arguments;

    return [
      {
        index,
        id: typeof item.id === "string" && item.id ? item.id : undefined,
        name: typeof name === "string" && name ? name : undefined,
        argumentsFragment: typeof args === "string" ? args : "",
      },
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
