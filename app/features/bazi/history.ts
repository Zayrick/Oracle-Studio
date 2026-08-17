import type { AIMessagePart, AIMessageStatus } from "@/features/ai/timeline";
import {
  createHistoryRecord,
  getHistoryRecord,
  listHistoryRecords,
  updateHistoryRecord,
  type HistoryRecord,
} from "@/lib/history-manager";

import {
  buildBaziPaipan,
  type BaziGender,
  type BaziPaipan,
} from "./paipan";
import { BAZI_HISTORY_SOURCE } from "./constants";

export type BaziAIMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  parts?: AIMessagePart[];
  status?: AIMessageStatus;
};

export interface BaziAIHistorySession {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: BaziAIMessage[];
}

export interface BaziAIHistoryState {
  activeSessionId: string;
  sessions: BaziAIHistorySession[];
}

export interface BaziHistoryContent {
  schemaVersion: 1;
  name: string;
  gender: BaziGender;
  birthDate: string;
  birthTime: string;
  chart: {
    solarText: string;
    tymeEightChar: string;
  };
  ai: BaziAIHistoryState;
}

export type BaziHistoryRecord = HistoryRecord<BaziHistoryContent>;

export function createEmptyBaziAIHistoryState(
  sessionId = createBaziAISessionId()
): BaziAIHistoryState {
  return { activeSessionId: sessionId, sessions: [] };
}

export function getBaziHistoryRecords() {
  return listHistoryRecords<BaziHistoryContent>(BAZI_HISTORY_SOURCE).filter(
    isBaziHistoryRecord
  );
}

export function getBaziHistoryRecord(id: string) {
  const record = getHistoryRecord<BaziHistoryContent>(id);

  return record && isBaziHistoryRecord(record) ? record : undefined;
}

export function createBaziHistoryRecord(input: {
  name: string;
  gender: BaziGender;
  date: Date;
  time: string;
  result: BaziPaipan;
  ai?: BaziAIHistoryState;
}) {
  const content: BaziHistoryContent = {
    schemaVersion: 1,
    name: input.name.trim(),
    gender: input.gender,
    birthDate: formatBaziHistoryDate(input.date),
    birthTime: input.time,
    chart: {
      solarText: input.result.solarText,
      tymeEightChar: input.result.tymeEightChar,
    },
    ai: normalizeBaziAIHistory(
      input.ai ?? createEmptyBaziAIHistoryState()
    ),
  };
  const record = createHistoryRecord({
    source: BAZI_HISTORY_SOURCE,
    title: formatBaziHistoryTitle(content.name, content.chart.tymeEightChar),
    content,
  });

  return record && isBaziHistoryRecord(record) ? record : undefined;
}

export function updateBaziHistoryRecordAI(
  id: string,
  ai: BaziAIHistoryState,
  options?: { touch?: boolean }
) {
  const record = getBaziHistoryRecord(id);

  if (!record) {
    return undefined;
  }

  const nextRecord = updateHistoryRecord<BaziHistoryContent>(
    id,
    { content: { ...record.content, ai: normalizeBaziAIHistory(ai) } },
    options
  );

  return nextRecord && isBaziHistoryRecord(nextRecord)
    ? nextRecord
    : undefined;
}

export function restoreBaziHistoryRecord(record: BaziHistoryRecord) {
  const date = parseBaziHistoryDate(record.content.birthDate);
  const result = buildBaziPaipan({
    name: record.content.name,
    gender: record.content.gender,
    date,
    time: record.content.birthTime,
  });

  if (result.tymeEightChar !== record.content.chart.tymeEightChar) {
    throw new Error("历史记录的八字排盘校验失败。");
  }

  return {
    name: record.content.name,
    gender: record.content.gender,
    date,
    time: record.content.birthTime,
    result,
    ai: normalizeBaziAIHistory(record.content.ai),
  };
}

export function upsertBaziAIHistorySession(
  history: BaziAIHistoryState,
  session: { sessionId: string; messages: BaziAIMessage[] }
) {
  const now = new Date().toISOString();
  const messages = normalizeBaziAIMessages(session.messages);
  const existing = history.sessions.find(
    (item) => item.sessionId === session.sessionId
  );
  const nextSession: BaziAIHistorySession = {
    sessionId: session.sessionId,
    title: formatBaziAISessionTitle(messages),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    messages,
  };

  return {
    activeSessionId: session.sessionId,
    sessions: [
      nextSession,
      ...history.sessions.filter(
        (item) => item.sessionId !== session.sessionId
      ),
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  } satisfies BaziAIHistoryState;
}

export function activateBaziAIHistorySession(
  history: BaziAIHistoryState,
  sessionId: string
) {
  return { ...history, activeSessionId: sessionId } satisfies BaziAIHistoryState;
}

export function getBaziAIHistorySession(
  history: BaziAIHistoryState,
  sessionId: string
) {
  return history.sessions.find((session) => session.sessionId === sessionId);
}

export function createBaziAISessionId() {
  return `bazi-${globalThis.crypto.randomUUID()}`;
}

function normalizeBaziAIHistory(history: unknown): BaziAIHistoryState {
  if (!isBaziAIHistoryState(history)) {
    return createEmptyBaziAIHistoryState();
  }

  return {
    activeSessionId: history.activeSessionId || createBaziAISessionId(),
    sessions: history.sessions
      .map((session) => ({
        ...session,
        messages: normalizeBaziAIMessages(session.messages),
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  };
}

function normalizeBaziAIMessages(messages: BaziAIMessage[]) {
  return messages.flatMap((message): BaziAIMessage[] => {
    if (!isBaziAIMessage(message)) {
      return [];
    }

    return [{
      ...message,
      parts: normalizeBaziAIMessageParts(message.parts),
      status: message.status === "streaming" ? "stopped" : message.status,
    }];
  });
}

function normalizeBaziAIMessageParts(parts: BaziAIMessage["parts"]) {
  if (!Array.isArray(parts)) {
    return undefined;
  }

  const normalized = parts.filter(isBaziAIMessagePart);
  return normalized.length > 0 ? normalized : undefined;
}

function isBaziHistoryRecord(
  record: HistoryRecord<BaziHistoryContent>
): record is BaziHistoryRecord {
  return record.source === BAZI_HISTORY_SOURCE && isBaziHistoryContent(record.content);
}

function isBaziHistoryContent(value: unknown): value is BaziHistoryContent {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    typeof value.name === "string" &&
    (value.gender === "male" || value.gender === "female") &&
    typeof value.birthDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.birthDate) &&
    typeof value.birthTime === "string" &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(value.birthTime) &&
    isRecord(value.chart) &&
    typeof value.chart.solarText === "string" &&
    typeof value.chart.tymeEightChar === "string" &&
    isBaziAIHistoryState(value.ai)
  );
}

function isBaziAIHistoryState(value: unknown): value is BaziAIHistoryState {
  return (
    isRecord(value) &&
    typeof value.activeSessionId === "string" &&
    Array.isArray(value.sessions) &&
    value.sessions.every(isBaziAIHistorySession)
  );
}

function isBaziAIHistorySession(value: unknown): value is BaziAIHistorySession {
  return (
    isRecord(value) &&
    typeof value.sessionId === "string" &&
    typeof value.title === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.messages) &&
    value.messages.every(isBaziAIMessage)
  );
}

function isBaziAIMessage(value: unknown): value is BaziAIMessage {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    (value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string" &&
    (value.parts === undefined ||
      (Array.isArray(value.parts) && value.parts.every(isBaziAIMessagePart))) &&
    (value.status === undefined ||
      value.status === "streaming" ||
      value.status === "complete" ||
      value.status === "stopped" ||
      value.status === "error")
  );
}

function isBaziAIMessagePart(value: unknown): value is AIMessagePart {
  if (!isRecord(value) || typeof value.id !== "string") {
    return false;
  }

  if ((value.type === "reasoning" || value.type === "text") && typeof value.text === "string") {
    return true;
  }

  return (
    value.type === "tool" &&
    typeof value.callId === "string" &&
    typeof value.name === "string" &&
    (value.displayName === undefined || typeof value.displayName === "string") &&
    typeof value.arguments === "string" &&
    (value.result === undefined || typeof value.result === "string") &&
    (value.status === "running" || value.status === "complete" || value.status === "error")
  );
}

function formatBaziHistoryTitle(name: string, eightChar: string) {
  return name ? `${name} · ${eightChar}` : eightChar;
}

function formatBaziAISessionTitle(messages: BaziAIMessage[]) {
  const title = messages
    .find((message) => message.role === "user")
    ?.content.trim()
    .replace(/\s+/g, " ");

  if (!title) {
    return "新会话";
  }

  return title.length > 28 ? `${title.slice(0, 28)}...` : title;
}

function formatBaziHistoryDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseBaziHistoryDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error("历史记录中的出生日期不合法。");
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (formatBaziHistoryDate(date) !== value) {
    throw new Error("历史记录中的出生日期不合法。");
  }

  return date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
