import { z } from "zod";
import {
  historyMutationSchema,
  userRecordSchema,
  unixTimestampSchema,
  type CloudHistoryEntry,
  type HistoryMutation,
  type StoredUserRecord,
} from "./schema";
import { migrateLegacyHistoryRecord } from "./legacy";
import { unixNow } from "@/lib/unix-time";

export const DATA_STORAGE_PREFIX = "oracle-studio.data.v3:";
export const LEGACY_HISTORY_KEY = "oracle-studio.history.v2";
export const HISTORY_CHANGE_EVENT = "oracle-studio:history-change";
export const HISTORY_DIRTY_EVENT = "oracle-studio:history-dirty";
const localEntrySchema = z.object({
  id: z.string(),
  revision: z.string().nullable(),
  deletedAt: unixTimestampSchema.nullable(),
  record: userRecordSchema.nullable(),
  pending: z
    .object({
      id: z.string(),
      mutationId: z.string(),
      baseRevision: z.string().nullable(),
      kind: z.enum(["upsert", "import", "delete"]),
    })
    .optional(),
  migrationOwner: z.string().optional(),
  migrationTarget: z.string().optional(),
  migrationStaged: z.boolean().optional(),
});
export type LocalHistoryEntry = Omit<
  z.infer<typeof localEntrySchema>,
  "pending"
> & { pending?: HistoryMutation };

function parseLocalEntry(raw: string): LocalHistoryEntry {
  const entry = localEntrySchema.parse(JSON.parse(raw));
  return {
    ...entry,
    pending: entry.pending
      ? historyMutationSchema.parse({ ...entry.pending, record: entry.record })
      : undefined,
  };
}

function scopePrefix(userId: string | null) {
  return `${DATA_STORAGE_PREFIX}${userId === null ? "guest" : `user:${encodeURIComponent(userId)}`}:`;
}
function entryKey(userId: string | null, id: string) {
  return `${scopePrefix(userId)}${encodeURIComponent(id)}`;
}
export function readLocalEntry(
  userId: string | null,
  id: string,
): LocalHistoryEntry | undefined {
  const raw = window.localStorage.getItem(entryKey(userId, id));
  return raw === null ? undefined : parseLocalEntry(raw);
}
export function readLocalEntries(userId: string | null) {
  const prefix = scopePrefix(userId);
  const keys = Object.keys(window.localStorage).filter((key) =>
    key.startsWith(prefix),
  );
  return keys.flatMap((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? [parseLocalEntry(raw)] : [];
  });
}
export function writeLocalEntry(
  userId: string | null,
  entry: LocalHistoryEntry | CloudHistoryEntry,
) {
  window.localStorage.setItem(
    entryKey(userId, entry.id),
    // The outbox references the entry's payload; do not persist every AI conversation twice.
    JSON.stringify({
      ...entry,
      ...("pending" in entry && entry.pending
        ? { pending: { ...entry.pending, record: undefined } }
        : {}),
    }),
  );
}
export function removeLocalEntry(userId: string | null, id: string) {
  window.localStorage.removeItem(entryKey(userId, id));
}
export function createPendingEntry(
  record: StoredUserRecord,
  previous?: LocalHistoryEntry,
  kind: "upsert" | "import" = "upsert",
): LocalHistoryEntry {
  return {
    id: record.id,
    record,
    revision: previous?.revision ?? null,
    deletedAt: null,
    pending: {
      id: record.id,
      mutationId: crypto.randomUUID(),
      baseRevision:
        previous?.pending?.baseRevision ?? previous?.revision ?? null,
      kind,
      record,
    },
  };
}
export function notifyHistoryChange(dirty = false) {
  window.dispatchEvent(new Event(HISTORY_CHANGE_EVENT));
  if (dirty) window.dispatchEvent(new Event(HISTORY_DIRTY_EVENT));
}
function readLegacyState(): { version: number; records: unknown[] } | null {
  const raw = window.localStorage.getItem(LEGACY_HISTORY_KEY);
  if (!raw) return null;
  return z
    .object({ version: z.literal(2), records: z.array(z.unknown()) })
    .parse(JSON.parse(raw));
}
export function importLegacyHistory() {
  const legacy = readLegacyState();
  let invalid = 0;
  for (const value of legacy?.records ?? []) {
    const record = migrateLegacyHistoryRecord(value);
    if (!record) {
      invalid++;
      continue;
    }
    if (!readLocalEntry(null, record.id))
      writeLocalEntry(null, createPendingEntry(record));
  }
  return invalid;
}

/** Claim before uploading; interrupted imports must never move into a different account. */
export function stageGuestMigration(userId: string) {
  for (const guest of readLocalEntries(null)) {
    if (
      !guest.record ||
      (guest.migrationOwner && guest.migrationOwner !== userId)
    )
      continue;
    const claimed = { ...guest, migrationOwner: userId };
    if (!guest.migrationOwner) writeLocalEntry(null, claimed);
    const target = guest.migrationTarget ?? guest.id;
    const existing = readLocalEntry(userId, target);
    if (!existing || (!guest.migrationStaged && !existing.pending)) {
      const record = { ...guest.record, id: target };
      writeLocalEntry(
        userId,
        createPendingEntry(userRecordSchema.parse(record), existing, "import"),
      );
    }
    if (!guest.migrationStaged)
      writeLocalEntry(null, { ...claimed, migrationStaged: true });
  }
  const themeClaimKey = `${DATA_STORAGE_PREFIX}theme-owner`;
  if (!window.localStorage.getItem(themeClaimKey)) {
    const theme = window.localStorage.getItem("oracle-studio-theme");
    if (
      ["light", "dark", "system"].includes(theme ?? "") &&
      !readLocalEntry(userId, "preferences")
    ) {
      const record = userRecordSchema.parse({
        id: "preferences",
        theme,
        createdAt: unixNow(),
        updatedAt: unixNow(),
      });
      writeLocalEntry(userId, createPendingEntry(record, undefined, "import"));
    }
    window.localStorage.setItem(themeClaimKey, userId);
  }
}

/** Only called for cloud-confirmed entries; invalid legacy data remains untouched. */
export function finishGuestMigration(userId: string, id: string) {
  const guest = readLocalEntries(null).find(
    (entry) =>
      entry.migrationOwner === userId &&
      entry.migrationStaged &&
      (entry.migrationTarget ?? entry.id) === id,
  );
  if (!guest) return;
  const legacy = readLegacyState();
  if (legacy) {
    const records = legacy.records.filter(
      (value) => migrateLegacyHistoryRecord(value)?.id !== guest.id,
    );
    if (records.length)
      window.localStorage.setItem(
        LEGACY_HISTORY_KEY,
        JSON.stringify({ ...legacy, records }),
      );
    else window.localStorage.removeItem(LEGACY_HISTORY_KEY);
  }
  removeLocalEntry(null, guest.id);
}
