import {
  historyRecordSchema,
  MAX_RECORD_BYTES,
  type StoredUserRecord,
} from "@/features/history/schema";
import {
  createPendingEntry,
  DATA_STORAGE_PREFIX,
  HISTORY_CHANGE_EVENT,
  importLegacyHistory,
  notifyHistoryChange,
  readLocalEntries,
  readLocalEntry,
  writeLocalEntry,
} from "@/features/history/storage";
import { unixNow } from "@/lib/unix-time";

export interface HistoryRecord<TContent = unknown> {
  id: string;
  source: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  content: TContent;
}
export interface CreateHistoryRecordInput<TContent> {
  source: string;
  title: string;
  content: TContent;
}
export interface UpdateHistoryRecordInput<TContent> {
  title?: string;
  content?: TContent;
}
export interface UpdateHistoryRecordOptions {
  touch?: boolean;
}

// Client-only scope; SSR neither reads nor mutates these variables.
let activeAccount: string | null | undefined;
let storageError = "";
export function getHistoryAccount() {
  return typeof window === "undefined" ? undefined : activeAccount;
}
export function getHistoryStorageError() {
  return storageError;
}
export function setHistoryAccount(userId: string | null) {
  if (typeof window === "undefined") return;
  activeAccount = userId;
  storageError = "";
  try {
    const invalid = importLegacyHistory();
    if (invalid) storageError = `${invalid} 条旧记录无法转换，已保留原始数据。`;
  } catch {
    storageError = "无法读取本机记录，原始数据已保留。请检查浏览器存储权限。";
  }
  notifyHistoryChange();
}
export function reportHistoryStorageError(
  message = "本机存储失败，修改尚未保存。请释放浏览器空间后重试。",
) {
  storageError = message;
  if (typeof window !== "undefined") notifyHistoryChange();
}
export function listHistoryRecords<TContent = unknown>(
  source?: string,
): HistoryRecord<TContent>[] {
  if (typeof window === "undefined" || activeAccount === undefined) return [];
  try {
    return readLocalEntries(activeAccount)
      .flatMap(({ record, migrationOwner }) =>
        record &&
        "source" in record &&
        !(activeAccount === null && migrationOwner) &&
        (!source || record.source === source)
          ? [record as HistoryRecord<TContent>]
          : [],
      )
      .sort(
        (left, right) =>
          right.updatedAt - left.updatedAt || right.id.localeCompare(left.id),
      );
  } catch {
    return [];
  }
}
export function getHistoryRecord<TContent = unknown>(id: string) {
  if (typeof window === "undefined" || activeAccount === undefined)
    return undefined;
  try {
    const entry = readLocalEntry(activeAccount, id);
    return entry?.record &&
      "source" in entry.record &&
      !(activeAccount === null && entry.migrationOwner)
      ? (entry.record as HistoryRecord<TContent>)
      : undefined;
  } catch {
    return undefined;
  }
}
function persistRecord(record: StoredUserRecord) {
  if (activeAccount === undefined) return false;
  try {
    if (
      new TextEncoder().encode(JSON.stringify(record)).byteLength >
      MAX_RECORD_BYTES
    ) {
      reportHistoryStorageError(
        "这条记录内容过大，最新修改尚未保存。请减少会话内容后重试。",
      );
      return false;
    }
    const previous = readLocalEntry(activeAccount, record.id);
    if (previous?.deletedAt !== undefined && previous.deletedAt !== null)
      return false;
    writeLocalEntry(activeAccount, createPendingEntry(record, previous));
    notifyHistoryChange(true);
    return true;
  } catch {
    reportHistoryStorageError();
    return false;
  }
}
export function createHistoryRecord<TContent>({
  source,
  title,
  content,
}: CreateHistoryRecordInput<TContent>) {
  const record = historyRecordSchema.parse({
    id: `history-${crypto.randomUUID()}`,
    source,
    title: title.trim() || "未命名记录",
    createdAt: unixNow(),
    updatedAt: unixNow(),
    content,
  });
  return persistRecord(record)
    ? (record as HistoryRecord<TContent>)
    : undefined;
}
export function updateHistoryRecord<TContent>(
  id: string,
  updates: UpdateHistoryRecordInput<TContent>,
  options: UpdateHistoryRecordOptions = {},
) {
  const current = getHistoryRecord<TContent>(id);
  if (!current) return undefined;
  const record = historyRecordSchema.parse({
    ...current,
    ...updates,
    title:
      updates.title === undefined
        ? current.title
        : updates.title.trim() || "未命名记录",
    updatedAt: options.touch === false ? current.updatedAt : unixNow(),
  });
  return persistRecord(record)
    ? (record as HistoryRecord<TContent>)
    : undefined;
}
export function deleteHistoryRecord(id: string) {
  if (activeAccount === undefined || !getHistoryRecord(id)) return false;
  try {
    const previous = readLocalEntry(activeAccount, id);
    if (activeAccount === null) {
      // A guest tombstone prevents repeated legacy conversion from resurrecting deletions.
      writeLocalEntry(null, {
        id,
        revision: null,
        deletedAt: unixNow(),
        record: null,
      });
    } else {
      writeLocalEntry(activeAccount, {
        id,
        revision: previous?.revision ?? null,
        deletedAt: unixNow(),
        record: null,
        pending: {
          id,
          mutationId: crypto.randomUUID(),
          baseRevision: previous?.revision ?? null,
          kind: "delete",
          record: null,
        },
      });
    }
    notifyHistoryChange(true);
    return true;
  } catch {
    reportHistoryStorageError();
    return false;
  }
}
export function getAccountTheme(): "light" | "dark" | "system" | undefined {
  if (typeof window === "undefined" || activeAccount === undefined)
    return undefined;
  try {
    const record = readLocalEntry(activeAccount, "preferences")?.record;
    return record && "theme" in record ? record.theme : undefined;
  } catch {
    return undefined;
  }
}
export function saveAccountTheme(theme: "light" | "dark" | "system") {
  if (activeAccount === undefined) return;
  try {
    const now = unixNow();
    const previous = readLocalEntry(activeAccount, "preferences")?.record;
    persistRecord({
      id: "preferences",
      theme,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    });
  } catch {
    reportHistoryStorageError();
  }
}
export function subscribeHistoryRecords(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(DATA_STORAGE_PREFIX))
      listener();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(HISTORY_CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(HISTORY_CHANGE_EVENT, listener);
  };
}
