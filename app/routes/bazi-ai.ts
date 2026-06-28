import type { Route } from "./+types/bazi-ai";

import {
  OpenRouterToolCallAccumulator,
  buildOpenRouterReasoningConfig,
  enqueueAIStreamEvent,
  parseOpenRouterChunkDeltas,
  parseOpenRouterSseLine,
  type OpenRouterReasoningConfig,
  type OpenRouterReasoningDetail,
  type OpenRouterToolCall,
} from "@/features/ai/openrouter-stream";
import type { BaziPaipan } from "@/features/bazi/paipan";
import { cloudflareContext } from "@/lib/cloudflare-context";

const OPENROUTER_CHAT_COMPLETIONS_URL = "https://us.oxio.uno/fetch/openrouter.ai/api/v1/chat/completions";
const DEFAULT_BAZI_OPENROUTER_MODEL = "deepseek/deepseek-chat-v3.1";
const DEFAULT_BAZI_OPENROUTER_APP_NAME = "Oracle Studio";

type BaziAIEnv = Env & {
  bazi_OPENROUTER_API_KEY?: string;
  bazi_OPENROUTER_MODEL?: string;
  bazi_OPENROUTER_APP_NAME?: string;
  bazi_OPENROUTER_PROVIDER_SORT?: string;
  bazi_OPENROUTER_REASONING_EFFORT?: string;
};

type BaziAIPayload = {
  systemPrompt: string;
  sessionId: string;
  messages: BaziAIMessage[];
  chart: BaziPaipan;
};

type BaziAIMessage = {
  role: "user" | "assistant";
  content: string;
};

type OpenRouterMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: OpenRouterToolCall[];
      reasoning?: string;
      reasoning_details?: OpenRouterReasoningDetail[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

type OpenRouterToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type OpenRouterChatCompletionRequest = {
  model: string;
  session_id: string;
  stream: true;
  messages: OpenRouterMessage[];
  tools?: readonly OpenRouterToolDefinition[];
  tool_choice?: "auto" | "none";
  parallel_tool_calls?: boolean;
  provider?: {
    sort: string;
  };
  reasoning?: OpenRouterReasoningConfig;
};

export function loader() {
  return jsonError("仅支持 POST 请求。", 405, { Allow: "POST" });
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return jsonError("仅支持 POST 请求。", 405, { Allow: "POST" });
  }

  const env = context.get(cloudflareContext).env as BaziAIEnv;
  const apiKey = env.bazi_OPENROUTER_API_KEY;

  if (!apiKey) {
    return jsonError("服务端未配置 bazi_OPENROUTER_API_KEY。", 500);
  }

  const clientPayload = await readClientPayload(request);

  if (!clientPayload.ok) {
    return jsonError(clientPayload.error, 400);
  }

  const { BAZI_AI_TOOL_DEFINITIONS, executeBaziAITool } = await import("@/features/bazi/ai-tools");

  return new Response(
    streamBaziAgent({
      apiKey,
      env,
      origin: new URL(request.url).origin,
      payload: clientPayload.value,
      toolDefinitions: BAZI_AI_TOOL_DEFINITIONS,
      executeTool: executeBaziAITool,
    }),
    {
      headers: {
        "Cache-Control": "no-store, no-transform",
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}

function streamBaziAgent(args: {
  apiKey: string;
  env: BaziAIEnv;
  origin: string;
  payload: BaziAIPayload;
  toolDefinitions: readonly OpenRouterToolDefinition[];
  executeTool: (name: string, args: Record<string, unknown>, chart: BaziPaipan) => string;
}) {
  const encoder = new TextEncoder();
  const abortController = new AbortController();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await runBaziAgent({
          ...args,
          controller,
          encoder,
          signal: abortController.signal,
        });
      } catch (error) {
        if (!abortController.signal.aborted) {
          enqueueAIStreamEvent(controller, encoder, {
            type: "error",
            message: error instanceof Error ? error.message : "AI 解盘失败，请稍后再试。",
          });
        }
      } finally {
        if (!abortController.signal.aborted) {
          controller.close();
        }
      }
    },
    cancel() {
      abortController.abort();
    },
  });
}

async function runBaziAgent({
  apiKey,
  env,
  origin,
  payload,
  toolDefinitions,
  executeTool,
  controller,
  encoder,
  signal,
}: {
  apiKey: string;
  env: BaziAIEnv;
  origin: string;
  payload: BaziAIPayload;
  toolDefinitions: readonly OpenRouterToolDefinition[];
  executeTool: (name: string, args: Record<string, unknown>, chart: BaziPaipan) => string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
  signal: AbortSignal;
}) {
  const messages: OpenRouterMessage[] = [
    { role: "system", content: payload.systemPrompt },
    ...payload.messages,
  ];

  while (true) {
    const openRouterResponse = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        "HTTP-Referer": origin,
        "X-Title": env.bazi_OPENROUTER_APP_NAME || DEFAULT_BAZI_OPENROUTER_APP_NAME,
      },
      body: JSON.stringify(buildOpenRouterRequestBody(env, payload, messages, toolDefinitions)),
      signal,
    });

    if (!openRouterResponse.ok) {
      const upstreamError = await readText(openRouterResponse.body);
      throw new Error(formatUpstreamError(openRouterResponse.status, upstreamError));
    }

    if (!openRouterResponse.body) {
      throw new Error("OpenRouter 未返回可读取的流。");
    }

    const assistantMessage = await streamOpenRouterAssistantMessage(
      openRouterResponse.body,
      controller,
      encoder
    );
    const toolCalls = assistantMessage.toolCalls;

    if (toolCalls.length === 0) {
      if (!assistantMessage.content && !assistantMessage.reasoning) {
        enqueueAIStreamEvent(controller, encoder, {
          type: "text",
          text: "AI 未返回内容。",
        });
      }

      return;
    }

    messages.push({
      role: "assistant",
      content: assistantMessage.content || null,
      tool_calls: toolCalls,
      reasoning: assistantMessage.reasoning || undefined,
      reasoning_details: assistantMessage.reasoningDetails.length > 0
        ? assistantMessage.reasoningDetails
        : undefined,
    });

    for (const toolCall of toolCalls) {
      const displayName = formatBaziAIToolDisplayName(toolCall.function.name);
      enqueueAIStreamEvent(controller, encoder, {
        type: "tool_call",
        callId: toolCall.id,
        name: toolCall.function.name,
        displayName,
        arguments: toolCall.function.arguments,
      });
      const toolResult = executeTool(
        toolCall.function.name,
        parseToolArguments(toolCall.function.arguments),
        payload.chart
      );

      enqueueAIStreamEvent(controller, encoder, {
        type: "tool_result",
        callId: toolCall.id,
        name: toolCall.function.name,
        displayName,
        result: toolResult,
        error: toolResult.startsWith("工具错误:") ? toolResult : undefined,
      });
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult,
      });
    }
  }
}

async function streamOpenRouterAssistantMessage(
  body: ReadableStream<Uint8Array>,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const toolCallAccumulator = new OpenRouterToolCallAccumulator();
  const reasoningDetails: OpenRouterReasoningDetail[] = [];
  let buffer = "";
  let content = "";
  let reasoning = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      buffer = handleCompleteOpenRouterSseLines(
        buffer,
        controller,
        encoder,
        toolCallAccumulator,
        reasoningDetails,
        (deltaContent, deltaReasoning) => {
          content += deltaContent;
          reasoning += deltaReasoning;
        }
      );
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      handleOpenRouterSseLine(
        buffer,
        controller,
        encoder,
        toolCallAccumulator,
        reasoningDetails,
        (deltaContent, deltaReasoning) => {
          content += deltaContent;
          reasoning += deltaReasoning;
        }
      );
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  return {
    content,
    reasoning,
    reasoningDetails,
    toolCalls: toolCallAccumulator.toToolCalls(),
  };
}

function handleCompleteOpenRouterSseLines(
  buffer: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  toolCallAccumulator: OpenRouterToolCallAccumulator,
  reasoningDetails: OpenRouterReasoningDetail[],
  appendText: (content: string, reasoning: string) => void
) {
  const lines = buffer.split(/\r?\n/);
  const rest = lines.pop() ?? "";

  for (const line of lines) {
    handleOpenRouterSseLine(
      line,
      controller,
      encoder,
      toolCallAccumulator,
      reasoningDetails,
      appendText
    );
  }

  return rest;
}

function handleOpenRouterSseLine(
  line: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  toolCallAccumulator: OpenRouterToolCallAccumulator,
  reasoningDetails: OpenRouterReasoningDetail[],
  appendText: (content: string, reasoning: string) => void
) {
  const chunk = parseOpenRouterSseLine(line);

  if (!chunk) {
    return;
  }

  for (const delta of parseOpenRouterChunkDeltas(chunk)) {
    appendText(delta.content, delta.reasoning);
    reasoningDetails.push(...delta.reasoningDetails);
    toolCallAccumulator.append(delta.toolCallDeltas);

    for (const event of delta.events) {
      enqueueAIStreamEvent(controller, encoder, event);
    }
  }
}

function buildOpenRouterRequestBody(
  env: BaziAIEnv,
  payload: BaziAIPayload,
  messages: OpenRouterMessage[],
  toolDefinitions: readonly OpenRouterToolDefinition[]
) {
  const providerSort = env.bazi_OPENROUTER_PROVIDER_SORT?.trim();
  const reasoningEffort = env.bazi_OPENROUTER_REASONING_EFFORT?.trim();

  const body: OpenRouterChatCompletionRequest = {
    model: env.bazi_OPENROUTER_MODEL || DEFAULT_BAZI_OPENROUTER_MODEL,
    session_id: payload.sessionId,
    stream: true,
    messages,
    tools: toolDefinitions,
    tool_choice: "auto",
    parallel_tool_calls: false,
  };

  if (providerSort) {
    body.provider = {
      sort: providerSort,
    };
  }

  body.reasoning = buildOpenRouterReasoningConfig(reasoningEffort);

  return body;
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
  const messages = Array.isArray(body.messages) ? normalizeBaziAIMessages(body.messages) : [];
  const chart = body.chart;

  if (!systemPrompt || !sessionId || messages.length === 0 || !isBaziPaipanPayload(chart)) {
    return { ok: false, error: "请求体缺少必要八字提示词。" } as const;
  }

  if (messages[messages.length - 1]?.role !== "user") {
    return { ok: false, error: "最后一条消息必须是用户提问。" } as const;
  }

  return {
    ok: true,
    value: { systemPrompt, sessionId, messages, chart } satisfies BaziAIPayload,
  } as const;
}

function normalizeBaziAIMessages(messages: unknown[]) {
  return messages
    .flatMap((message): BaziAIMessage[] => {
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

function parseToolArguments(value: string) {
  try {
    const parsed = JSON.parse(value);

    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
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

function formatBaziAIToolDisplayName(name: string) {
  switch (name) {
    case "bazi_structure":
      return "命局结构";
    case "bazi_timeline":
      return "运限流年";
    case "bazi_period_detail":
      return "周期详盘";
    case "bazi_shensha":
      return "神煞辅助";
    default:
      return name;
  }
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

function isBaziPaipanPayload(value: unknown): value is BaziPaipan {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.name === "string" &&
    (value.gender === "male" || value.gender === "female") &&
    typeof value.solarText === "string" &&
    typeof value.dayMaster === "string" &&
    typeof value.tymeEightChar === "string" &&
    Array.isArray(value.pillars) &&
    value.pillars.length === 4 &&
    value.pillars.every(isBaziPillarPayload) &&
    Array.isArray(value.auxiliaryPillars) &&
    isRecord(value.fortune) &&
    typeof value.fortune.currentYear === "number" &&
    isRecord(value.fortune.context) &&
    Array.isArray(value.fortune.periods) &&
    Array.isArray(value.fortune.dayuns)
  );
}

function isBaziPillarPayload(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.label === "string" &&
    typeof value.name === "string" &&
    typeof value.stem === "string" &&
    typeof value.branch === "string" &&
    Array.isArray(value.hiddenStems) &&
    Array.isArray(value.shenSha)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
