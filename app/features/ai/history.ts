import {
  aiHistorySchema,
  type AIHistoryMessage,
  type AIHistoryState,
} from "@/features/history/schema";
import { unixNow } from "@/lib/unix-time";

export function createEmptyAIHistoryState(
  sessionId = crypto.randomUUID(),
): AIHistoryState {
  return { activeSessionId: sessionId, sessions: [] };
}

export function normalizeAIHistory(history: AIHistoryState): AIHistoryState {
  const parsed = aiHistorySchema.parse(history);
  return {
    ...parsed,
    sessions: parsed.sessions
      .map((session) => ({
        ...session,
        messages: session.messages.map((message) => ({
          ...message,
          status:
            message.status === "streaming"
              ? ("stopped" as const)
              : message.status,
        })),
      }))
      .sort((left, right) => right.updatedAt - left.updatedAt),
  };
}

export function upsertAIHistorySession(
  history: AIHistoryState,
  session: { sessionId: string; messages: AIHistoryMessage[] },
): AIHistoryState {
  const now = unixNow();
  const existing = history.sessions.find(
    (item) => item.sessionId === session.sessionId,
  );
  const title =
    session.messages
      .find((message) => message.role === "user")
      ?.content.trim()
      .replace(/\s+/g, " ") || "新会话";
  return normalizeAIHistory({
    activeSessionId: session.sessionId,
    sessions: [
      {
        ...session,
        title: title.length > 28 ? `${title.slice(0, 28)}...` : title,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      },
      ...history.sessions.filter(
        (item) => item.sessionId !== session.sessionId,
      ),
    ],
  });
}

export function activateAIHistorySession(
  history: AIHistoryState,
  sessionId: string,
): AIHistoryState {
  return { ...history, activeSessionId: sessionId };
}

export function getAIHistorySession(
  history: AIHistoryState,
  sessionId: string,
) {
  return history.sessions.find((session) => session.sessionId === sessionId);
}
