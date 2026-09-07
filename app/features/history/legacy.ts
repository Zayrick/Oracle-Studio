import { z } from "zod";
import { historyRecordSchema, type StoredHistoryRecord } from "./schema";
import { migrateLegacyDateTime, migrateLegacyTimestamp } from "@/lib/unix-time";

const legacyRecordSchema = z.object({
  id: z.string(),
  source: z.string(),
  title: z.string(),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
  content: z.object({ schemaVersion: z.literal(1) }).passthrough(),
});

/** Convert records separately: an invalid record must not discard its valid neighbors. */
export function migrateLegacyHistoryRecord(
  value: unknown,
): StoredHistoryRecord | null {
  try {
    const current = historyRecordSchema.safeParse(value);
    if (current.success) return current.data;
    const legacy = legacyRecordSchema.parse(value);
    const content = legacy.content;
    const ai = z
      .object({
        activeSessionId: z.string(),
        sessions: z.array(
          z
            .object({
              createdAt: z.unknown(),
              updatedAt: z.unknown(),
            })
            .passthrough(),
        ),
      })
      .parse(content.ai);
    const nextAI = {
      ...ai,
      activeSessionId: ai.activeSessionId || `${legacy.id}-ai`,
      sessions: ai.sessions.map((session) => ({
        ...session,
        createdAt: migrateLegacyTimestamp(session.createdAt),
        updatedAt: migrateLegacyTimestamp(session.updatedAt),
      })),
    };
    let raw;
    if (legacy.source === "八字") {
      raw = {
        name: content.name,
        gender: content.gender,
        ...migrateLegacyDateTime(
          z.string().parse(content.birthDate),
          z.string().parse(content.birthTime),
        ),
      };
    } else if (legacy.source === "六爻") {
      const yaos = z
        .array(z.object({ type: z.enum(["阴", "阳"]), moving: z.boolean() }))
        .length(6)
        .parse(content.yaos);
      raw = {
        question: content.question,
        castingMethod: content.castingMethod,
        yaoValues: yaos.map((yao) =>
          yao.type === "阴" ? (yao.moving ? 6 : 8) : yao.moving ? 9 : 7,
        ),
        ...migrateLegacyDateTime(
          z.string().parse(content.divinationDate),
          z.string().parse(content.divinationTime),
        ),
      };
    } else return null;
    return historyRecordSchema.parse({
      ...legacy,
      createdAt: migrateLegacyTimestamp(legacy.createdAt),
      updatedAt: migrateLegacyTimestamp(legacy.updatedAt),
      content: { schemaVersion: 2, raw, ai: nextAI },
    });
  } catch {
    return null;
  }
}
