import { useEffect, useRef, useState } from "react";
import type { AIChatMessage } from "@/features/ai/chat";
import type { AIUsageSummary } from "@/features/ai/usage";

type UsageRecoveryOptions = {
  enabled: boolean;
  isStreaming: boolean;
  accountId: string | null | undefined;
  feature: "bazi" | "liuyao";
  historyRecordId: string | null;
  sessionId: string;
  messages: AIChatMessage[];
  onRecovered: (usages: AIUsageSummary[]) => void;
};

export function useUsageRecovery({
  enabled, isStreaming, accountId, feature, historyRecordId, sessionId,
  messages, onRecovered,
}: UsageRecoveryOptions) {
  const latest = useRef({ messages, onRecovered });
  latest.current = { messages, onRecovered };
  const [finished, setFinished] = useState(false);
  const turns = messages
    .filter((message) => message.role === "assistant" && message.turnId && message.status !== "streaming")
    .map((message) => `${message.turnId}:${message.status}`)
    .join(",");

  useEffect(() => {
    setFinished(false);
    if (!enabled || isStreaming || !accountId || !turns) return;
    const needsRecovery = latest.current.messages.some((message) =>
      message.role === "assistant" && message.turnId && (
        message.status === "stopped" || message.status === "error" ||
        message.usage?.status !== "complete"
      )
    );
    if (!needsRecovery) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/ai/usage", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Account-Id": accountId },
          body: JSON.stringify({ feature, sessionId }),
          signal: controller.signal,
        });
        if (response.ok) {
          const { usages } = await response.json() as { usages: AIUsageSummary[] };
          if (!controller.signal.aborted) latest.current.onRecovered(usages);
        }
      } catch {
        // A failed lookup leaves the saved summary available for the next opening.
      } finally {
        if (!controller.signal.aborted) setFinished(true);
      }
    })();
    return () => controller.abort();
  }, [enabled, isStreaming, accountId, feature, historyRecordId, sessionId, turns]);

  return finished;
}

export function mergeRecoveredAIUsage<Message extends AIChatMessage>(
  messages: Message[], usages: AIUsageSummary[],
) {
  const byTurn = new Map(usages.map((usage) => [usage.turnId, usage]));
  let changed = false;
  const next = messages.map((message) => {
    if (!message.turnId || message.status === "streaming") return message;
    const usage = byTurn.get(message.turnId);
    if (!usage || (message.usage && message.usage.revision >= usage.revision)) return message;
    changed = true;
    return { ...message, usage };
  });
  return changed ? next : messages;
}
