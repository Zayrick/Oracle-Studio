import type { OpenRouterToolCall } from "@/features/ai/openrouter-stream";
import { AIRequestError, type AIConnection } from "@/features/ai/request.server";
import { createAIResponseStream, streamAICompletion, type AIEventSink } from "@/features/ai/completion.server";
import type { BaziPaipan } from "@/features/bazi/paipan";

type BaziAIPayload = {
  systemPrompt: string;
  messages: BaziAIMessage[];
  chart: BaziPaipan;
};

type BaziAIMessage = {
  role: "user" | "assistant";
  content: string;
};

type LLMMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: OpenRouterToolCall[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export async function handleBaziAI(payload: unknown, connection: AIConnection) {
  const clientPayload = readClientPayload(payload);
  if (!clientPayload.ok) throw new AIRequestError(400, clientPayload.error);
  return createAIResponseStream(connection, (emit, signal) =>
    runBaziAgent(connection, clientPayload.value, emit, signal)
  );
}

async function runBaziAgent(
  connection: AIConnection,
  payload: BaziAIPayload,
  emit: AIEventSink,
  signal: AbortSignal,
) {
  const { BAZI_AI_TOOL_DEFINITIONS, executeBaziAITool } =
    await import("@/features/bazi/ai-tools");
  const messages: LLMMessage[] = [
    { role: "system", content: payload.systemPrompt }, ...payload.messages,
  ];
  while (true) {
    const assistant = await streamAICompletion(
      connection, {
        messages,
        tools: BAZI_AI_TOOL_DEFINITIONS,
        tool_choice: "auto",
        parallel_tool_calls: false,
      }, emit, signal,
    );
    if (!assistant.toolCalls.length) {
      if (!assistant.content && !assistant.reasoning) emit({ type: "text", text: "AI 未返回内容。" });
      return;
    }
    messages.push({ role: "assistant", content: assistant.content || null, tool_calls: assistant.toolCalls });
    for (const tool of assistant.toolCalls) {
      signal.throwIfAborted();
      const displayName = formatBaziAIToolDisplayName(tool.function.name);
      const toolId = await connection.usage.startTool(assistant.call, tool);
      emit({ type: "tool_call", callId: tool.id, name: tool.function.name, displayName, arguments: tool.function.arguments });
      const result = executeBaziAITool(
        tool.function.name, parseToolArguments(tool.function.arguments), payload.chart,
      );
      const failed = result.startsWith("工具错误:");
      await connection.usage.finishTool(toolId, result, failed);
      emit({ type: "tool_result", callId: tool.id, name: tool.function.name, displayName, result, error: failed ? result : undefined });
      messages.push({ role: "tool", tool_call_id: tool.id, content: result });
    }
  }
}

function readClientPayload(body: unknown) {
  if (!isRecord(body)) {
    return { ok: false, error: "请求体内容不合法。" } as const;
  }

  const systemPrompt =
    typeof body.systemPrompt === "string" ? body.systemPrompt : "";
  const messages = Array.isArray(body.messages)
    ? normalizeBaziAIMessages(body.messages)
    : [];
  const chart = body.chart;

  if (
    !systemPrompt ||
    messages.length === 0 ||
    !isBaziPaipanPayload(chart)
  ) {
    return { ok: false, error: "请求体缺少必要八字提示词。" } as const;
  }

  if (messages[messages.length - 1]?.role !== "user") {
    return { ok: false, error: "最后一条消息必须是用户提问。" } as const;
  }

  return {
    ok: true,
    value: { systemPrompt, messages, chart } satisfies BaziAIPayload,
  } as const;
}

function normalizeBaziAIMessages(messages: unknown[]) {
  return messages.flatMap((message): BaziAIMessage[] => {
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
