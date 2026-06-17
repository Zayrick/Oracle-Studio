export interface HistoryRecord<TContent = unknown> {
  id: string;
  source: string;
  title: string;
  createdAt: string;
  updatedAt: string;
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

const HISTORY_STORAGE_KEY = "oracle-studio.history.v2";
const HISTORY_STORAGE_EVENT = "oracle-studio:history-change";
const HISTORY_STORAGE_VERSION = 2;

interface StoredHistoryState {
  version: number;
  records: Array<HistoryRecord<unknown>>;
}

export function listHistoryRecords<TContent = unknown>(source?: string) {
  const records = readHistoryState().records;
  const filtered = source
    ? records.filter((record) => record.source === source)
    : records;

  return [...filtered].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  ) as Array<HistoryRecord<TContent>>;
}

export function getHistoryRecord<TContent = unknown>(id: string) {
  return readHistoryState().records.find((record) => record.id === id) as
    | HistoryRecord<TContent>
    | undefined;
}

export function createHistoryRecord<TContent>({
  source,
  title,
  content,
}: CreateHistoryRecordInput<TContent>) {
  const state = readHistoryState();
  const now = new Date().toISOString();
  const record: HistoryRecord<TContent> = {
    id: createHistoryRecordId(),
    source: normalizeHistorySource(source),
    title: normalizeHistoryTitle(title),
    createdAt: now,
    updatedAt: now,
    content,
  };

  const stored = writeHistoryState({
    ...state,
    records: [record as HistoryRecord<unknown>, ...state.records],
  });

  return stored ? record : undefined;
}

export function updateHistoryRecord<TContent>(
  id: string,
  updates: UpdateHistoryRecordInput<TContent>,
  options: UpdateHistoryRecordOptions = {}
) {
  const state = readHistoryState();
  const touch = options.touch ?? true;
  let nextRecord: HistoryRecord<unknown> | undefined;

  const records = state.records.map((record) => {
    if (record.id !== id) {
      return record;
    }

    const updatedRecord: HistoryRecord<unknown> = {
      ...record,
      title:
        updates.title === undefined
          ? record.title
          : normalizeHistoryTitle(updates.title),
      content:
        updates.content === undefined
          ? record.content
          : updates.content,
      updatedAt: touch ? new Date().toISOString() : record.updatedAt,
    };

    nextRecord = updatedRecord;
    return updatedRecord;
  });

  if (!nextRecord) {
    return undefined;
  }

  return writeHistoryState({ ...state, records })
    ? (nextRecord as HistoryRecord<TContent>)
    : undefined;
}

export function deleteHistoryRecord(id: string) {
  const state = readHistoryState();
  const records = state.records.filter((record) => record.id !== id);

  if (records.length === state.records.length) {
    return false;
  }

  return writeHistoryState({ ...state, records });
}

export function subscribeHistoryRecords(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === HISTORY_STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(HISTORY_STORAGE_EVENT, listener);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(HISTORY_STORAGE_EVENT, listener);
  };
}

function readHistoryState(): StoredHistoryState {
  if (typeof window === "undefined") {
    return createEmptyHistoryState();
  }

  try {
    const rawValue = window.localStorage.getItem(HISTORY_STORAGE_KEY);

    if (!rawValue) {
      return createEmptyHistoryState();
    }

    const parsed = JSON.parse(rawValue);

    if (!isStoredHistoryState(parsed)) {
      return createEmptyHistoryState();
    }

    return {
      version: HISTORY_STORAGE_VERSION,
      records: parsed.records,
    };
  } catch {
    return createEmptyHistoryState();
  }
}

function writeHistoryState(state: StoredHistoryState) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    window.localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify({
        version: HISTORY_STORAGE_VERSION,
        records: state.records,
      } satisfies StoredHistoryState)
    );
    window.dispatchEvent(new Event(HISTORY_STORAGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

function createEmptyHistoryState(): StoredHistoryState {
  return {
    version: HISTORY_STORAGE_VERSION,
    records: [],
  };
}

function isStoredHistoryState(value: unknown): value is StoredHistoryState {
  if (
    !isRecord(value) ||
    value.version !== HISTORY_STORAGE_VERSION ||
    !Array.isArray(value.records)
  ) {
    return false;
  }

  return value.records.every(isHistoryRecord);
}

function isHistoryRecord(value: unknown): value is HistoryRecord<unknown> {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.source === "string" &&
    typeof value.title === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    "content" in value
  );
}

function normalizeHistorySource(source: string) {
  return source.trim() || "未知";
}

function normalizeHistoryTitle(title: string) {
  return title.trim() || "未命名记录";
}

function createHistoryRecordId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `history-${globalThis.crypto.randomUUID()}`;
  }

  return `history-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
