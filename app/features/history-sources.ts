import { BAZI_HISTORY_SOURCE } from "@/features/bazi/constants";
import { LIUYAO_HISTORY_SOURCE } from "@/features/liuyao/constants";
import type { HistoryRecord } from "@/lib/history-manager";

export interface HistorySourceConfig {
  source: string;
  baseHref: string;
  getRecordHref: (record: HistoryRecord) => string;
}

const historySourceConfigs = [
  {
    source: BAZI_HISTORY_SOURCE,
    baseHref: "/bazi",
    getRecordHref: (record) => `/bazi?history=${encodeURIComponent(record.id)}`,
  },
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
