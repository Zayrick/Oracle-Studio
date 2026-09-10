import { AIRequestError, requestAICompletion, type AIConnection } from "@/features/ai/request.server";
import { OpenRouterToolCallAccumulator, parseOpenRouterChunkDeltas, parseOpenRouterSseLine } from "@/features/ai/openrouter-stream";
import { serializeAIStreamEvent, type AIStreamEvent } from "@/features/ai/timeline";
import { recoverUsage } from "@/features/ai/usage-recovery.server";

export type AIEventSink = (event: AIStreamEvent) => void;

/** waitUntil lets accounting finish after the client disconnects. */
export function createAIResponseStream(
  connection: AIConnection,
  run: (emit: AIEventSink, signal: AbortSignal) => Promise<void>,
) {
  const abort = new AbortController();
  const signal = AbortSignal.any([connection.signal, abort.signal]);
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const emit: AIEventSink = (event) => {
        if (!signal.aborted) controller.enqueue(encoder.encode(serializeAIStreamEvent(event)));
      };
      connection.usage.onUsage = (usage) => emit({ type: "usage", usage });
      const task = (async () => {
        let state: "complete" | "stopped" | "error" = "complete";
        try {
          signal.throwIfAborted();
          await run(emit, signal);
        } catch (error) {
          state = signal.aborted ? "stopped" : "error";
          emit({ type: "error", message: error instanceof AIRequestError ? error.message : "AI 解读失败，请稍后重试。" });
        } finally {
          if (signal.aborted) state = "stopped";
          try {
            await connection.usage.finish(state);
            await recoverUsage({
              db: connection.usage.db, apiKey: connection.apiKey, userId: connection.userId,
              scope: { turnId: connection.usage.trace.turnId },
            });
            await connection.usage.publish();
          } catch {
            console.error(JSON.stringify({ event: "ai_usage_finalize_failed", turnId: connection.usage.trace.turnId }));
          }
          if (!signal.aborted) controller.close();
          connection.usage.onUsage = undefined;
        }
      })();
      connection.ctx.waitUntil(task);
    },
    cancel() { abort.abort(); },
  });
}

export async function streamAICompletion(
  connection: AIConnection, payload: Record<string, unknown>,
  emit: AIEventSink, signal: AbortSignal,
) {
  const { body, call } = await requestAICompletion(connection, payload, signal);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const tools = new OpenRouterToolCallAccumulator();
  let content = "";
  let reasoning = "";
  let buffer = "";
  const consume = async (line: string) => {
    const chunk = parseOpenRouterSseLine(line);
    if (!chunk) return;
    // Persist the generation ID and usage before forwarding any visible output.
    await connection.usage.chunk(call, chunk);
    if (chunk.error) throw new AIRequestError(502, "AI 服务返回错误，请稍后重试。");
    for (const delta of parseOpenRouterChunkDeltas(chunk)) {
      content += delta.content;
      reasoning += delta.reasoning;
      tools.append(delta.toolCallDeltas);
      for (const event of delta.events) emit(event);
    }
  };
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) await consume(line);
    }
    buffer += decoder.decode();
    if (buffer.trim()) await consume(buffer);
    signal.throwIfAborted();
    await connection.usage.finishCall(call, "complete");
    return { call, content, reasoning, toolCalls: tools.toToolCalls() };
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    await connection.usage.finishCall(call, signal.aborted ? "stopped" : "error");
    throw error;
  } finally {
    reader.releaseLock();
  }
}
