import {
  historyPageSchema,
  historySyncResultSchema,
  MAX_SYNC_BATCH,
  MAX_SYNC_BYTES,
  type CloudHistoryEntry,
  type HistoryMutation,
} from "./schema";
import {
  createPendingEntry,
  DATA_STORAGE_PREFIX,
  finishGuestMigration,
  HISTORY_DIRTY_EVENT,
  notifyHistoryChange,
  readLocalEntries,
  readLocalEntry,
  stageGuestMigration,
  writeLocalEntry,
} from "./storage";
import { getHistoryAccount } from "@/lib/history-manager";

export interface HistorySyncStatus {
  userId: string | null;
  phase: "local" | "syncing" | "synced" | "error";
  loaded: boolean;
  error: string;
  remoteVersion: number;
  recordVersions: Record<string, number>;
}
const initialStatus: HistorySyncStatus = {
  userId: null,
  phase: "local",
  loaded: false,
  error: "",
  remoteVersion: 0,
  recordVersions: {},
};
let status = initialStatus;
let retry: (() => void) | undefined;
export function getHistorySyncStatus() {
  return typeof window === "undefined" ? initialStatus : status;
}
export function retryHistorySync() {
  retry?.();
}
function updateStatus(update: Partial<HistorySyncStatus>) {
  status = { ...status, ...update };
  notifyHistoryChange();
}

function ensureAccount(userId: string, signal: AbortSignal) {
  signal.throwIfAborted();
  if (getHistoryAccount() !== userId)
    throw new DOMException("Account changed", "AbortError");
}

async function fetchSync(
  userId: string,
  signal: AbortSignal,
  init?: RequestInit,
  cursor?: string,
) {
  ensureAccount(userId, signal);
  const response = await fetch(
    `/api/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    {
      ...init,
      signal,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "X-Account-Id": userId },
    },
  );
  ensureAccount(userId, signal);
  if (!response.ok) {
    if (response.status === 401)
      throw new Error("登录已过期，请重新登录；本机待同步数据已保留。");
    if (response.status === 409)
      throw new Error("账户已在其他页面切换，请刷新页面后同步。");
    if (response.status === 413)
      throw new Error("记录内容过大，已保留本机数据，请减少会话内容后重试。");
    throw new Error("云端同步暂时失败，本机待同步数据已保留，将自动重试。");
  }
  return response.json() as Promise<unknown>;
}

function equalRecord(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** A late acknowledgement cannot discard edits made while its request was in flight. */
export function acknowledgeHistoryMutation(
  userId: string,
  sent: HistoryMutation,
  cloud: CloudHistoryEntry,
) {
  const local = readLocalEntry(userId, sent.id);
  if (!local?.pending) return false;
  const newerEdit = local.pending.mutationId !== sent.mutationId;
  const accepted = cloud.revision === sent.mutationId;
  if (cloud.deletedAt !== null) {
    writeLocalEntry(userId, cloud);
    finishGuestMigration(userId, cloud.id);
    return !equalRecord(local.record, cloud.record);
  }
  if (
    (accepted && newerEdit) ||
    (newerEdit && equalRecord(sent.record, cloud.record))
  ) {
    writeLocalEntry(userId, {
      ...local,
      revision: cloud.revision,
      pending: {
        ...local.pending,
        baseRevision: cloud.revision,
        kind: local.pending.kind === "delete" ? "delete" : "upsert",
      },
    });
    return false;
  }
  if (!accepted && !equalRecord(local.record, cloud.record)) {
    if (
      local.pending.kind === "delete" ||
      (local.id === "preferences" && local.pending.kind !== "import")
    ) {
      writeLocalEntry(userId, {
        ...local,
        revision: cloud.revision,
        pending: { ...local.pending, baseRevision: cloud.revision },
      });
      return false;
    }
    if (local.record && "source" in local.record) {
      // Preserve concurrent edits as a deterministic copy, so retries never multiply copies.
      const copy = {
        ...local.record,
        id: `history-conflict-${local.pending.mutationId}`,
        title: `${local.record.title.slice(0, 980)}（同步副本）`,
      };
      if (!readLocalEntry(userId, copy.id))
        writeLocalEntry(userId, createPendingEntry(copy));
      const guest = readLocalEntry(null, local.id);
      if (guest?.migrationOwner === userId)
        writeLocalEntry(null, { ...guest, migrationTarget: copy.id });
    }
  }
  writeLocalEntry(userId, cloud);
  finishGuestMigration(userId, cloud.id);
  return !equalRecord(local.record, cloud.record);
}

function nextBatch(userId: string) {
  const batch: HistoryMutation[] = [];
  for (const { pending } of readLocalEntries(userId)) {
    if (!pending) continue;
    const candidate = [...batch, pending];
    if (
      new TextEncoder().encode(JSON.stringify({ changes: candidate }))
        .byteLength > MAX_SYNC_BYTES
    ) {
      if (!batch.length)
        throw new Error("单条记录过大，已保留本机数据，请减少会话内容后重试。");
      break;
    }
    batch.push(pending);
    if (batch.length === MAX_SYNC_BATCH) break;
  }
  return batch;
}

/** Exposed separately from scheduling for deterministic migration and offline tests. */
export async function synchronizeHistory(
  userId: string,
  signal = new AbortController().signal,
) {
  const sync = async () => {
    ensureAccount(userId, signal);
    stageGuestMigration(userId);
    notifyHistoryChange();
    const changedIds = new Set<string>();
    const publishChanges = () => {
      if (!changedIds.size) return;
      const recordVersions = { ...status.recordVersions };
      for (const id of changedIds)
        recordVersions[id] = (recordVersions[id] ?? 0) + 1;
      changedIds.clear();
      updateStatus({ remoteVersion: status.remoteVersion + 1, recordVersions });
    };
    // Bounded work per pass; streaming AI edits can continue without keeping this loop alive.
    for (let round = 0; round < 10; round++) {
      const changes = nextBatch(userId);
      if (!changes.length) break;
      const response = historySyncResultSchema.parse(
        await fetchSync(userId, signal, {
          method: "POST",
          body: JSON.stringify({ changes }),
        }),
      );
      ensureAccount(userId, signal);
      if (response.results.length !== changes.length)
        throw new Error("同步确认不完整，待同步数据已保留。");
      for (const change of changes) {
        const result = response.results.find(
          (item) =>
            item.mutationId === change.mutationId &&
            item.entry.id === change.id,
        );
        if (!result) throw new Error("同步确认不完整，待同步数据已保留。");
        if (acknowledgeHistoryMutation(userId, change, result.entry))
          changedIds.add(change.id);
      }
      publishChanges();
    }
    let cursor: string | null = null;
    do {
      const page = historyPageSchema.parse(
        await fetchSync(userId, signal, undefined, cursor ?? undefined),
      );
      ensureAccount(userId, signal);
      for (const cloud of page.entries) {
        const local = readLocalEntry(userId, cloud.id);
        if (local?.pending) continue;
        if (!equalRecord(local?.record, cloud.record)) changedIds.add(cloud.id);
        writeLocalEntry(userId, cloud);
        finishGuestMigration(userId, cloud.id);
      }
      publishChanges();
      if (page.cursor !== null && page.cursor <= (cursor ?? ""))
        throw new Error("同步分页异常，待同步数据已保留。");
      cursor = page.cursor;
    } while (cursor !== null);
    updateStatus({ loaded: true });
    return nextBatch(userId).length > 0;
  };
  // One origin-wide lock also serializes claiming guest records across account tabs.
  return navigator.locks
    ? navigator.locks.request("oracle-studio:user-data-sync", { signal }, sync)
    : sync();
}

export function startHistorySync(userId: string | null) {
  const controller = new AbortController();
  status = {
    userId,
    phase: userId ? "syncing" : "local",
    loaded: !userId,
    error: "",
    remoteVersion: status.remoteVersion + 1,
    recordVersions: {},
  };
  notifyHistoryChange();
  if (!userId) {
    retry = undefined;
    return () => undefined;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let queued = false;
  let failures = 0;
  const schedule = (delay = 800) => {
    if (controller.signal.aborted) return;
    if (busy) {
      queued = true;
      return;
    }
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void run();
    }, delay);
  };
  const run = async () => {
    if (busy || controller.signal.aborted) return;
    busy = true;
    updateStatus({ phase: "syncing", error: "" });
    try {
      const pending = await synchronizeHistory(userId, controller.signal);
      if (controller.signal.aborted) return;
      failures = 0;
      queued ||= pending;
      updateStatus({ phase: pending ? "syncing" : "synced" });
    } catch (error) {
      if (controller.signal.aborted) return;
      failures++;
      updateStatus({
        phase: "error",
        error:
          error instanceof Error ? error.message : "同步失败，将自动重试。",
      });
    } finally {
      busy = false;
      if (!controller.signal.aborted && (queued || failures)) {
        queued = false;
        schedule(
          failures
            ? Math.min(60_000, 2000 * 2 ** Math.min(failures - 1, 5))
            : 800,
        );
      }
    }
  };
  const refresh = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    schedule(0);
  };
  const dirty = () => schedule();
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(DATA_STORAGE_PREFIX))
      schedule();
  };
  const visible = () => {
    if (document.visibilityState === "visible") refresh();
  };
  const interval = setInterval(() => {
    if (document.visibilityState === "visible") schedule(0);
  }, 60_000);
  retry = refresh;
  window.addEventListener(HISTORY_DIRTY_EVENT, dirty);
  window.addEventListener("storage", storage);
  window.addEventListener("online", refresh);
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", visible);
  schedule(0);
  return () => {
    controller.abort();
    if (timer) clearTimeout(timer);
    clearInterval(interval);
    window.removeEventListener(HISTORY_DIRTY_EVENT, dirty);
    window.removeEventListener("storage", storage);
    window.removeEventListener("online", refresh);
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", visible);
    if (retry === refresh) retry = undefined;
  };
}
