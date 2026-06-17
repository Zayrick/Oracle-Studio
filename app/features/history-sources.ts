import { LIUYAO_HISTORY_SOURCE } from "@/features/liuyao/history";
import type { HistoryRecord } from "@/lib/history-manager";

export interface HistorySourceConfig {
  source: string;
  baseHref: string;
  getRecordHref: (record: HistoryRecord) => string;
}

const historySourceConfigs = [
  {
    source: LIUYAO_HISTORY_SOURCE,
    baseHref: "/liuyao",
    getRecordHref: (record) => `/liuyao?history=${encodeURIComponent(record.id)}`,
  },
] satisfies HistorySourceConfig[];

export function getHistorySourceConfig(record: HistoryRecord) {
  return historySourceConfigs.find((config) => config.source === record.source);
}

export function getHistoryRecordHref(record: HistoryRecord) {
  return getHistorySourceConfig(record)?.getRecordHref(record) ?? "/";
}

export function getHistoryRecordBaseHref(record: HistoryRecord) {
  return getHistorySourceConfig(record)?.baseHref ?? "/";
}
