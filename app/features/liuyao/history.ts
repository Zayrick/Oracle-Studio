import {
  createHistoryRecord,
  getHistoryRecord,
  listHistoryRecords,
  updateHistoryRecord,
  type HistoryRecord,
} from "@/lib/history-manager";

import {
  buildLiuyaoPaipan,
  type LiuyaoInputYao,
  type LiuyaoPaipan,
} from "./paipan";

export const LIUYAO_HISTORY_SOURCE = "六爻";

export type LiuyaoCastingMethod = "manual" | "random" | "online" | "time";

export type LiuyaoAIMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  status?: "streaming" | "complete" | "stopped" | "error";
};

export interface LiuyaoAIHistorySession {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: LiuyaoAIMessage[];
}

export interface LiuyaoAIHistoryState {
  activeSessionId: string;
  sessions: LiuyaoAIHistorySession[];
}

export interface LiuyaoHistoryHexagram {
  primary: LiuyaoHistoryHexagramItem;
  changed?: LiuyaoHistoryHexagramItem;
}

export interface LiuyaoHistoryHexagramItem {
  name: string;
  palace: string;
  stage: string;
  pattern: string;
}

export interface LiuyaoHistoryContent {
  schemaVersion: 1;
  question: string;
  divinationDate: string;
  divinationTime: string;
  castingMethod: LiuyaoCastingMethod;
  yaos: LiuyaoInputYao[];
  hexagram: LiuyaoHistoryHexagram;
  ai: LiuyaoAIHistoryState;
}

export type LiuyaoHistoryRecord = HistoryRecord<LiuyaoHistoryContent>;

export interface CreateLiuyaoHistoryRecordInput {
  question: string;
  date: Date;
  time: string;
  castingMethod: LiuyaoCastingMethod;
  yaos: LiuyaoInputYao[];
  result: LiuyaoPaipan;
  ai?: LiuyaoAIHistoryState;
}

export function createEmptyLiuyaoAIHistoryState(
  sessionId = createLiuyaoAISessionId()
): LiuyaoAIHistoryState {
  return {
    activeSessionId: sessionId,
    sessions: [],
  };
}

export function getLiuyaoHistoryRecords() {
  return listHistoryRecords<LiuyaoHistoryContent>(LIUYAO_HISTORY_SOURCE).filter(
    isLiuyaoHistoryRecord
  );
}

export function getLiuyaoHistoryRecord(id: string) {
  const record = getHistoryRecord<LiuyaoHistoryContent>(id);

  return record && isLiuyaoHistoryRecord(record) ? record : undefined;
}

export function createLiuyaoHistoryRecord(input: CreateLiuyaoHistoryRecordInput) {
  const content = createLiuyaoHistoryContent(input);
  const record = createHistoryRecord({
    source: LIUYAO_HISTORY_SOURCE,
    title: content.question,
    content,
  });

  return record && isLiuyaoHistoryRecord(record) ? record : undefined;
}

export function updateLiuyaoHistoryRecordAI(
  id: string,
  ai: LiuyaoAIHistoryState,
  options?: { touch?: boolean }
) {
  const record = getHistoryRecord<LiuyaoHistoryContent>(id);

  if (!record || !isLiuyaoHistoryRecord(record)) {
    return undefined;
  }

  const nextRecord = updateHistoryRecord<LiuyaoHistoryContent>(
    id,
    {
      content: {
        ...record.content,
        ai,
      },
    },
    options
  );

  return nextRecord && isLiuyaoHistoryRecord(nextRecord)
    ? nextRecord
    : undefined;
}

export function restoreLiuyaoHistoryRecord(record: LiuyaoHistoryRecord) {
  const date = parseLiuyaoHistoryDate(record.content.divinationDate);
  const result = buildLiuyaoPaipan({
    question: record.content.question,
    date,
    time: record.content.divinationTime,
    yaos: record.content.yaos,
  });

  return {
    question: record.content.question,
    date,
    time: record.content.divinationTime,
    castingMethod: record.content.castingMethod,
    yaos: record.content.yaos,
    ai: normalizeLiuyaoAIHistory(record.content.ai),
    result,
  };
}

export function upsertLiuyaoAIHistorySession(
  history: LiuyaoAIHistoryState,
  session: {
    sessionId: string;
    messages: LiuyaoAIMessage[];
  }
) {
  const now = new Date().toISOString();
  const normalizedMessages = normalizeLiuyaoAIMessages(session.messages);
  const existingSession = history.sessions.find(
    (item) => item.sessionId === session.sessionId
  );
  const nextSession: LiuyaoAIHistorySession = {
    sessionId: session.sessionId,
    title: formatLiuyaoAISessionTitle(normalizedMessages),
    createdAt: existingSession?.createdAt ?? now,
    updatedAt: now,
    messages: normalizedMessages,
  };
  const sessions = [
    nextSession,
    ...history.sessions.filter((item) => item.sessionId !== session.sessionId),
  ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return {
    activeSessionId: session.sessionId,
    sessions,
  } satisfies LiuyaoAIHistoryState;
}

export function activateLiuyaoAIHistorySession(
  history: LiuyaoAIHistoryState,
  sessionId: string
) {
  return {
    ...history,
    activeSessionId: sessionId,
  } satisfies LiuyaoAIHistoryState;
}

export function getLiuyaoAIHistorySession(
  history: LiuyaoAIHistoryState,
  sessionId: string
) {
  return history.sessions.find((session) => session.sessionId === sessionId);
}

export function createLiuyaoAISessionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `liuyao-${globalThis.crypto.randomUUID()}`;
  }

  return `liuyao-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function createLiuyaoHistoryContent({
  question,
  date,
  time,
  castingMethod,
  yaos,
  result,
  ai,
}: CreateLiuyaoHistoryRecordInput): LiuyaoHistoryContent {
  return {
    schemaVersion: 1,
    question: question.trim(),
    divinationDate: formatLiuyaoHistoryDate(date),
    divinationTime: time,
    castingMethod,
    yaos: yaos.map((yao) => ({ ...yao })),
    hexagram: createLiuyaoHistoryHexagram(result),
    ai: normalizeLiuyaoAIHistory(ai ?? createEmptyLiuyaoAIHistoryState()),
  };
}

function createLiuyaoHistoryHexagram(result: LiuyaoPaipan): LiuyaoHistoryHexagram {
  return {
    primary: createLiuyaoHistoryHexagramItem(result.primary),
    changed: result.changed
      ? createLiuyaoHistoryHexagramItem(result.changed)
      : undefined,
  };
}

function createLiuyaoHistoryHexagramItem(
  hexagram: LiuyaoPaipan["primary"]
): LiuyaoHistoryHexagramItem {
  return {
    name: hexagram.name,
    palace: hexagram.palace,
    stage: hexagram.stage,
    pattern: hexagram.pattern,
  };
}

function isLiuyaoHistoryRecord(
  record: HistoryRecord<LiuyaoHistoryContent>
): record is LiuyaoHistoryRecord {
  return (
    record.source === LIUYAO_HISTORY_SOURCE &&
    isLiuyaoHistoryContent(record.content)
  );
}

function isLiuyaoHistoryContent(
  content: unknown
): content is LiuyaoHistoryContent {
  if (!isRecord(content)) {
    return false;
  }

  return (
    content.schemaVersion === 1 &&
    typeof content.question === "string" &&
    typeof content.divinationDate === "string" &&
    typeof content.divinationTime === "string" &&
    isLiuyaoCastingMethod(content.castingMethod) &&
    Array.isArray(content.yaos) &&
    content.yaos.length === 6 &&
    content.yaos.every(isLiuyaoInputYao) &&
    isLiuyaoHistoryHexagram(content.hexagram) &&
    isLiuyaoAIHistoryState(content.ai)
  );
}

function isLiuyaoHistoryHexagram(
  value: unknown
): value is LiuyaoHistoryHexagram {
  return (
    isRecord(value) &&
    isLiuyaoHistoryHexagramItem(value.primary) &&
    (value.changed === undefined ||
      isLiuyaoHistoryHexagramItem(value.changed))
  );
}

function isLiuyaoHistoryHexagramItem(
  value: unknown
): value is LiuyaoHistoryHexagramItem {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.palace === "string" &&
    typeof value.stage === "string" &&
    typeof value.pattern === "string"
  );
}

function isLiuyaoCastingMethod(value: unknown): value is LiuyaoCastingMethod {
  return (
    value === "manual" ||
    value === "random" ||
    value === "online" ||
    value === "time"
  );
}

function isLiuyaoInputYao(value: unknown): value is LiuyaoInputYao {
  return (
    isRecord(value) &&
    (value.type === "阴" || value.type === "阳") &&
    typeof value.moving === "boolean"
  );
}

function normalizeLiuyaoAIHistory(history: unknown) {
  if (!isLiuyaoAIHistoryState(history)) {
    return createEmptyLiuyaoAIHistoryState();
  }

  return {
    activeSessionId: history.activeSessionId || createLiuyaoAISessionId(),
    sessions: history.sessions
      .map((session) => ({
        ...session,
        messages: normalizeLiuyaoAIMessages(session.messages),
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  } satisfies LiuyaoAIHistoryState;
}

function normalizeLiuyaoAIMessages(messages: LiuyaoAIMessage[]) {
  return messages.flatMap((message): LiuyaoAIMessage[] => {
    if (!isLiuyaoAIMessage(message)) {
      return [];
    }

    return [
      {
        id: message.id,
        role: message.role,
        content: message.content,
        status: message.status === "streaming" ? "stopped" : message.status,
      },
    ];
  });
}

function isLiuyaoAIHistoryState(
  value: unknown
): value is LiuyaoAIHistoryState {
  return (
    isRecord(value) &&
    typeof value.activeSessionId === "string" &&
    Array.isArray(value.sessions) &&
    value.sessions.every(isLiuyaoAIHistorySession)
  );
}

function isLiuyaoAIHistorySession(
  value: unknown
): value is LiuyaoAIHistorySession {
  return (
    isRecord(value) &&
    typeof value.sessionId === "string" &&
    typeof value.title === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.messages) &&
    value.messages.every(isLiuyaoAIMessage)
  );
}

function isLiuyaoAIMessage(value: unknown): value is LiuyaoAIMessage {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    (value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string" &&
    (value.status === undefined ||
      value.status === "streaming" ||
      value.status === "complete" ||
      value.status === "stopped" ||
      value.status === "error")
  );
}

function formatLiuyaoAISessionTitle(messages: LiuyaoAIMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const title = firstUserMessage?.content.trim().replace(/\s+/g, " ");

  if (!title) {
    return "新会话";
  }

  return title.length > 28 ? `${title.slice(0, 28)}...` : title;
}

function formatLiuyaoHistoryDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseLiuyaoHistoryDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error("历史记录中的占问日期不合法。");
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
