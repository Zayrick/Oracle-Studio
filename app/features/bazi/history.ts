import {
  activateAIHistorySession,
  createEmptyAIHistoryState,
  getAIHistorySession,
  normalizeAIHistory,
  upsertAIHistorySession,
} from "@/features/ai/history";
import {
  baziHistoryContentSchema,
  type AIHistoryMessage,
  type AIHistorySession,
  type AIHistoryState,
  type BaziHistoryContent,
} from "@/features/history/schema";
import {
  createHistoryRecord,
  getHistoryRecord,
  listHistoryRecords,
  updateHistoryRecord,
  type HistoryRecord,
} from "@/lib/history-manager";
import { restoreRawDateTime, toRawDateTime } from "@/lib/unix-time";
import { BAZI_HISTORY_SOURCE } from "./constants";
import { buildBaziPaipan, type BaziGender } from "./paipan";

export type { BaziHistoryContent };
export type BaziAIMessage = AIHistoryMessage;
export type BaziAIHistorySession = AIHistorySession;
export type BaziAIHistoryState = AIHistoryState;
export type BaziHistoryRecord = HistoryRecord<BaziHistoryContent>;
export const createEmptyBaziAIHistoryState = createEmptyAIHistoryState;
export const upsertBaziAIHistorySession = upsertAIHistorySession;
export const activateBaziAIHistorySession = activateAIHistorySession;
export const getBaziAIHistorySession = getAIHistorySession;
export const createBaziAISessionId = () => `bazi-${crypto.randomUUID()}`;

export function getBaziHistoryRecords() {
  return listHistoryRecords<BaziHistoryContent>(BAZI_HISTORY_SOURCE);
}

export function getBaziHistoryRecord(id: string) {
  const record = getHistoryRecord<BaziHistoryContent>(id);
  return record?.source === BAZI_HISTORY_SOURCE &&
    baziHistoryContentSchema.safeParse(record.content).success
    ? record
    : undefined;
}

export function updateBaziHistoryRecordAI(
  id: string,
  ai: BaziAIHistoryState,
  options?: { touch?: boolean },
) {
  const record = getBaziHistoryRecord(id);
  if (!record) return undefined;
  return updateHistoryRecord<BaziHistoryContent>(
    id,
    { content: { ...record.content, ai: normalizeAIHistory(ai) } },
    options,
  );
}

export function createBaziHistoryRecord(input: {
  name: string;
  gender: BaziGender;
  date: Date;
  time: string;
  ai?: BaziAIHistoryState;
}) {
  const content: BaziHistoryContent = {
    schemaVersion: 2,
    raw: {
      name: input.name.trim(),
      gender: input.gender,
      ...toRawDateTime(input.date, input.time),
    },
    ai: normalizeAIHistory(input.ai ?? createEmptyAIHistoryState()),
  };
  return createHistoryRecord({
    source: BAZI_HISTORY_SOURCE,
    title: content.raw.name ? `${content.raw.name} 的八字` : "八字排盘",
    content,
  });
}

export function restoreBaziHistoryRecord(record: BaziHistoryRecord) {
  const { name, gender } = record.content.raw;
  const { date, time } = restoreRawDateTime(record.content.raw);
  return {
    name,
    gender,
    date,
    time,
    result: buildBaziPaipan({ name, gender, date, time }),
    ai: normalizeAIHistory(record.content.ai),
  };
}
