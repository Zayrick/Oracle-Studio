import { z } from "zod";
import { aiUsageSummarySchema } from "@/features/ai/usage";

export const unixTimestampSchema = z
  .number()
  .int()
  .min(-62_135_596_800)
  .max(253_402_300_799);
const identifier = z.string().min(1).max(200);
const messagePartSchema = z.discriminatedUnion("type", [
  z.object({ id: identifier, type: z.literal("reasoning"), text: z.string() }),
  z.object({ id: identifier, type: z.literal("text"), text: z.string() }),
  z.object({
    id: identifier,
    type: z.literal("tool"),
    callId: identifier,
    name: z.string(),
    displayName: z.string().optional(),
    arguments: z.string(),
    result: z.string().optional(),
    status: z.enum(["running", "complete", "error"]),
  }),
]);

export const aiMessageSchema = z.object({
  id: z.number().int().nonnegative(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  parts: z.array(messagePartSchema).optional(),
  status: z.enum(["streaming", "complete", "stopped", "error"]).optional(),
  turnId: identifier.optional(),
  usage: aiUsageSummarySchema.optional(),
});

export const aiHistorySchema = z.object({
  activeSessionId: identifier,
  sessions: z.array(
    z.object({
      sessionId: identifier,
      title: z.string(),
      createdAt: unixTimestampSchema,
      updatedAt: unixTimestampSchema,
      messages: z.array(aiMessageSchema),
    }),
  ),
});

const rawDateTime = {
  timestamp: unixTimestampSchema,
  utcOffsetMinutes: z.number().int().min(-840).max(840),
};
export const baziHistoryContentSchema = z.object({
  schemaVersion: z.literal(2),
  raw: z.object({
    name: z.string(),
    gender: z.enum(["male", "female"]),
    ...rawDateTime,
  }),
  ai: aiHistorySchema,
});
export const liuyaoHistoryContentSchema = z.object({
  schemaVersion: z.literal(2),
  raw: z.object({
    question: z.string(),
    castingMethod: z.enum(["manual", "random", "online", "time"]),
    /** Bottom line first: 6 old yin, 7 young yang, 8 young yin, 9 old yang. */
    yaoValues: z
      .array(z.union([z.literal(6), z.literal(7), z.literal(8), z.literal(9)]))
      .length(6),
    ...rawDateTime,
  }),
  ai: aiHistorySchema,
});

const recordFields = {
  id: identifier.refine((id) => id !== "preferences"),
  title: z.string().min(1).max(1000),
  createdAt: unixTimestampSchema,
  updatedAt: unixTimestampSchema,
};
export const historyRecordSchema = z.discriminatedUnion("source", [
  z.object({
    ...recordFields,
    source: z.literal("八字"),
    content: baziHistoryContentSchema,
  }),
  z.object({
    ...recordFields,
    source: z.literal("六爻"),
    content: liuyaoHistoryContentSchema,
  }),
]);

export const preferencesRecordSchema = z.object({
  id: z.literal("preferences"),
  theme: z.enum(["light", "dark", "system"]),
  createdAt: unixTimestampSchema,
  updatedAt: unixTimestampSchema,
});
export const userRecordSchema = z.union([
  historyRecordSchema,
  preferencesRecordSchema,
]);

export const cloudHistoryEntrySchema = z
  .object({
    id: identifier,
    revision: identifier,
    deletedAt: unixTimestampSchema.nullable(),
    record: userRecordSchema.nullable(),
  })
  .refine((entry) =>
    entry.deletedAt === null
      ? entry.record?.id === entry.id
      : entry.record === null,
  );

export const historyMutationSchema = z
  .object({
    mutationId: identifier,
    id: identifier,
    baseRevision: identifier.nullable(),
    kind: z.enum(["upsert", "import", "delete"]),
    record: userRecordSchema.nullable(),
  })
  .refine((mutation) =>
    mutation.kind === "delete"
      ? mutation.record === null
      : mutation.record?.id === mutation.id,
  );

export const MAX_SYNC_BYTES = 1_048_576;
export const MAX_RECORD_BYTES = 524_288;
export const MAX_SYNC_BATCH = 20;
export const historySyncRequestSchema = z
  .object({
    changes: z.array(historyMutationSchema).min(1).max(MAX_SYNC_BATCH),
  })
  .refine(
    ({ changes }) =>
      new Set(changes.map(({ id }) => id)).size === changes.length,
  );
export const historySyncResultSchema = z.object({
  results: z.array(
    z.object({ mutationId: identifier, entry: cloudHistoryEntrySchema }),
  ),
});
export const historyPageSchema = z.object({
  entries: z.array(cloudHistoryEntrySchema),
  cursor: identifier.nullable(),
});

export type AIHistoryMessage = z.infer<typeof aiMessageSchema>;
export type AIHistoryState = z.infer<typeof aiHistorySchema>;
export type AIHistorySession = AIHistoryState["sessions"][number];
export type BaziHistoryContent = z.infer<typeof baziHistoryContentSchema>;
export type LiuyaoHistoryContent = z.infer<typeof liuyaoHistoryContentSchema>;
export type StoredHistoryRecord = z.infer<typeof historyRecordSchema>;
export type StoredPreferences = z.infer<typeof preferencesRecordSchema>;
export type StoredUserRecord = z.infer<typeof userRecordSchema>;
export type CloudHistoryEntry = z.infer<typeof cloudHistoryEntrySchema>;
export type HistoryMutation = z.infer<typeof historyMutationSchema>;
