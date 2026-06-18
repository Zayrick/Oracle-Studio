import type { Route } from "./+types/bazi-ai";

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

type BaziAIClientRequest = {
  payload: string;
};

type BaziAIDecodedPayload = {
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
  | { role: "assistant"; content: string; tool_calls?: OpenRouterToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type OpenRouterToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

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
  stream: false;
  messages: OpenRouterMessage[];
  tools?: readonly OpenRouterToolDefinition[];
  tool_choice?: "auto" | "none";
  parallel_tool_calls?: boolean;
  provider?: {
    sort: string;
  };
  reasoning?: {
    effort: string;
  };
};

type OpenRouterChatCompletionResponse = {
  choices?: Array<{
    message?: {
      role?: unknown;
      content?: unknown;
      tool_calls?: unknown;
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

  const env = context.get(cloudflareContext).env as BaziAIEnv;
  const apiKey = env.bazi_OPENROUTER_API_KEY;

  if (!apiKey) {
    return jsonError("服务端未配置 bazi_OPENROUTER_API_KEY。", 500);
  }

  const clientPayload = await readClientPayload(request);

  if (!clientPayload.ok) {
    return jsonError(clientPayload.error, 400);
  }

  const decodedPayload = decodeBaziPayload(clientPayload.value.payload);

  if (!decodedPayload.ok) {
    return jsonError(decodedPayload.error, 400);
  }

  const { BAZI_AI_TOOL_DEFINITIONS, executeBaziAITool } = await import("@/features/bazi/ai-tools");
  const agentResult = await runBaziAgent({
    apiKey,
    env,
    origin: new URL(request.url).origin,
    payload: decodedPayload.value,
    toolDefinitions: BAZI_AI_TOOL_DEFINITIONS,
    executeTool: executeBaziAITool,
  });

  if (!agentResult.ok) {
    return jsonError(agentResult.error, agentResult.status);
  }

  return new Response(streamText(agentResult.content), {
    headers: {
      "Cache-Control": "no-store, no-transform",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
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
}: {
  apiKey: string;
  env: BaziAIEnv;
  origin: string;
  payload: BaziAIDecodedPayload;
  toolDefinitions: readonly OpenRouterToolDefinition[];
  executeTool: (name: string, args: Record<string, unknown>, chart: BaziPaipan) => string;
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
        "Content-Type": "application/json",
        "HTTP-Referer": origin,
        "X-Title": env.bazi_OPENROUTER_APP_NAME || DEFAULT_BAZI_OPENROUTER_APP_NAME,
      },
      body: JSON.stringify(buildOpenRouterRequestBody(env, payload, messages, toolDefinitions)),
    });

    if (!openRouterResponse.ok) {
      const upstreamError = await readText(openRouterResponse.body);
      return {
        ok: false,
        status: 502,
        error: formatUpstreamError(openRouterResponse.status, upstreamError),
      } as const;
    }

    const completion = await readOpenRouterJson(openRouterResponse);

    if (!completion.ok) {
      return {
        ok: false,
        status: 502,
        error: completion.error,
      } as const;
    }

    const assistantMessage = getAssistantMessage(completion.value);

    if (!assistantMessage.ok) {
      return {
        ok: false,
        status: 502,
        error: assistantMessage.error,
      } as const;
    }

    const toolCalls = normalizeToolCalls(assistantMessage.value.tool_calls);
    const content = typeof assistantMessage.value.content === "string"
      ? assistantMessage.value.content
      : "";

    if (toolCalls.length === 0) {
      return {
        ok: true,
        content: content || "AI 未返回内容。",
      } as const;
    }

    messages.push({
      role: "assistant",
      content,
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: executeTool(
          toolCall.function.name,
          parseToolArguments(toolCall.function.arguments),
          payload.chart
        ),
      });
    }
  }
}

function buildOpenRouterRequestBody(
  env: BaziAIEnv,
  payload: BaziAIDecodedPayload,
  messages: OpenRouterMessage[],
  toolDefinitions: readonly OpenRouterToolDefinition[]
) {
  const providerSort = env.bazi_OPENROUTER_PROVIDER_SORT?.trim();
  const reasoningEffort = env.bazi_OPENROUTER_REASONING_EFFORT?.trim();

  const body: OpenRouterChatCompletionRequest = {
    model: env.bazi_OPENROUTER_MODEL || DEFAULT_BAZI_OPENROUTER_MODEL,
    session_id: payload.sessionId,
    stream: false,
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

  return { ok: true, value: body as BaziAIClientRequest } as const;
}

function decodeBaziPayload(payload: string) {
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
  const messages = Array.isArray(decoded.messages) ? normalizeBaziAIMessages(decoded.messages) : [];
  const chart = decoded.chart;

  if (!systemPrompt || !sessionId || messages.length === 0 || !isBaziPaipanPayload(chart)) {
    return { ok: false, error: "payload 缺少必要八字提示词。" } as const;
  }

  if (messages[messages.length - 1]?.role !== "user") {
    return { ok: false, error: "最后一条消息必须是用户提问。" } as const;
  }

  return {
    ok: true,
    value: { systemPrompt, sessionId, messages, chart } satisfies BaziAIDecodedPayload,
  } as const;
}

function normalizeBaziAIMessages(messages: unknown[]) {
  return messages
    .flatMap((message): BaziAIMessage[] => {
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
          content,
        },
      ];
    });
}

async function readOpenRouterJson(response: Response) {
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return { ok: false, error: "OpenRouter 响应不是有效 JSON。" } as const;
  }

  if (!isRecord(body)) {
    return { ok: false, error: "OpenRouter 响应格式不合法。" } as const;
  }

  const error = body.error;

  if (isRecord(error) && typeof error.message === "string" && error.message) {
    return { ok: false, error: error.message } as const;
  }

  return { ok: true, value: body as OpenRouterChatCompletionResponse } as const;
}

function getAssistantMessage(response: OpenRouterChatCompletionResponse) {
  const message = response.choices?.[0]?.message;

  if (!isRecord(message)) {
    return { ok: false, error: "OpenRouter 未返回有效消息。" } as const;
  }

  return { ok: true, value: message } as const;
}

function normalizeToolCalls(value: unknown): OpenRouterToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index): OpenRouterToolCall[] => {
    if (!isRecord(item) || item.type !== "function" || !isRecord(item.function)) {
      return [];
    }

    const name = item.function.name;
    const args = item.function.arguments;

    if (typeof name !== "string") {
      return [];
    }

    return [
      {
        id: typeof item.id === "string" && item.id ? item.id : `tool-call-${index}`,
        type: "function",
        function: {
          name,
          arguments: typeof args === "string" ? args : "{}",
        },
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

function streamText(text: string) {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
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
