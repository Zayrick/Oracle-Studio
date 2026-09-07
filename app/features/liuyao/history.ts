import {
  activateAIHistorySession,
  createEmptyAIHistoryState,
  getAIHistorySession,
  normalizeAIHistory,
  upsertAIHistorySession,
} from "@/features/ai/history";
import {
  liuyaoHistoryContentSchema,
  type AIHistoryMessage,
  type AIHistorySession,
  type AIHistoryState,
  type LiuyaoHistoryContent,
} from "@/features/history/schema";
import {
  createHistoryRecord,
  getHistoryRecord,
  listHistoryRecords,
  updateHistoryRecord,
  type HistoryRecord,
} from "@/lib/history-manager";
import { restoreRawDateTime, toRawDateTime } from "@/lib/unix-time";
import { LIUYAO_HISTORY_SOURCE } from "./constants";
import { buildLiuyaoPaipan, type LiuyaoInputYao } from "./paipan";

export type { LiuyaoHistoryContent };
export type LiuyaoAIMessage = AIHistoryMessage;
export type LiuyaoAIHistorySession = AIHistorySession;
export type LiuyaoAIHistoryState = AIHistoryState;
export type LiuyaoHistoryRecord = HistoryRecord<LiuyaoHistoryContent>;
export const createEmptyLiuyaoAIHistoryState = createEmptyAIHistoryState;
export const upsertLiuyaoAIHistorySession = upsertAIHistorySession;
export const activateLiuyaoAIHistorySession = activateAIHistorySession;
export const getLiuyaoAIHistorySession = getAIHistorySession;
export const createLiuyaoAISessionId = () => `liuyao-${crypto.randomUUID()}`;

export function getLiuyaoHistoryRecords() {
  return listHistoryRecords<LiuyaoHistoryContent>(LIUYAO_HISTORY_SOURCE);
}

export function getLiuyaoHistoryRecord(id: string) {
  const record = getHistoryRecord<LiuyaoHistoryContent>(id);
  return record?.source === LIUYAO_HISTORY_SOURCE &&
    liuyaoHistoryContentSchema.safeParse(record.content).success
    ? record
    : undefined;
}

export function updateLiuyaoHistoryRecordAI(
  id: string,
  ai: LiuyaoAIHistoryState,
  options?: { touch?: boolean },
) {
  const record = getLiuyaoHistoryRecord(id);
  if (!record) return undefined;
  return updateHistoryRecord<LiuyaoHistoryContent>(
    id,
    { content: { ...record.content, ai: normalizeAIHistory(ai) } },
    options,
  );
}

export type LiuyaoCastingMethod = LiuyaoHistoryContent["raw"]["castingMethod"];
export interface CreateLiuyaoHistoryRecordInput {
  question: string;
  date: Date;
  time: string;
  castingMethod: LiuyaoCastingMethod;
  yaos: LiuyaoInputYao[];
  ai?: LiuyaoAIHistoryState;
}

export function createLiuyaoHistoryRecord(
  input: CreateLiuyaoHistoryRecordInput,
) {
  const content: LiuyaoHistoryContent = {
    schemaVersion: 2,
    raw: {
      question: input.question.trim(),
      castingMethod: input.castingMethod,
      yaoValues: input.yaos.map((yao) =>
        yao.type === "阴" ? (yao.moving ? 6 : 8) : yao.moving ? 9 : 7,
      ),
      ...toRawDateTime(input.date, input.time),
    },
    ai: normalizeAIHistory(input.ai ?? createEmptyAIHistoryState()),
  };
  return createHistoryRecord({
    source: LIUYAO_HISTORY_SOURCE,
    title: content.raw.question,
    content,
  });
}

export function restoreLiuyaoHistoryRecord(record: LiuyaoHistoryRecord) {
  const { question, castingMethod, yaoValues } = record.content.raw;
  const { date, time } = restoreRawDateTime(record.content.raw);
  const yaos: LiuyaoInputYao[] = yaoValues.map((value) => ({
    type: value === 6 || value === 8 ? "阴" : "阳",
    moving: value === 6 || value === 9,
  }));
  return {
    question,
    castingMethod,
    date,
    time,
    yaos,
    result: buildLiuyaoPaipan({ question, date, time, yaos }),
    ai: normalizeAIHistory(record.content.ai),
  };
}
