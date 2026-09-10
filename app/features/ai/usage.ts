import { z } from "zod";

const tokenCount = z.number().int().nonnegative();
const amount = z.string().max(400).regex(/^\d+(?:\.\d+)?$/);

export const aiUsageSummarySchema = z.object({
  turnId: z.string().min(1).max(200),
  revision: tokenCount,
  status: z.enum(["pending", "complete", "unavailable"]),
  modelCalls: tokenCount,
  toolCalls: tokenCount,
  resolvedCalls: tokenCount,
  promptTokens: tokenCount,
  completionTokens: tokenCount,
  totalTokens: tokenCount,
  reasoningTokens: tokenCount,
  cachedTokens: tokenCount,
  cost: amount.nullable(),
});
export type AIUsageSummary = z.infer<typeof aiUsageSummarySchema>;
export type AIUsageStatus = AIUsageSummary["status"];

export type NormalizedAIUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  reasoningTokens: number | null;
  cachedTokens: number | null;
  cost: string | null;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tokens(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value : null;
}

export function costAmount(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const [mantissa, exponent = "0"] = String(value).toLowerCase().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);
  const plain = point <= 0
    ? `0.${"0".repeat(-point)}${digits}`
    : point >= digits.length
      ? digits + "0".repeat(point - digits.length)
      : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return plain;
}

/** Add credit amounts at their original decimal precision. */
export function sumCostAmounts(values: string[]) {
  if (!values.length) return null;
  const scale = Math.max(...values.map((value) => value.split(".")[1]?.length ?? 0));
  const total = values.reduce((sum, value) => {
    const [whole, fraction = ""] = value.split(".");
    return sum + BigInt(whole + fraction.padEnd(scale, "0"));
  }, 0n).toString().padStart(scale + 1, "0");
  return scale
    ? `${total.slice(0, -scale)}.${total.slice(-scale)}`.replace(/\.?0+$/, "") || "0"
    : total;
}

export function normalizeStreamUsage(value: Record<string, unknown>): NormalizedAIUsage {
  const prompt = tokens(value.prompt_tokens);
  const completion = tokens(value.completion_tokens);
  const inputDetails = isRecord(value.prompt_tokens_details) ? value.prompt_tokens_details : {};
  const outputDetails = isRecord(value.completion_tokens_details) ? value.completion_tokens_details : {};
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: tokens(value.total_tokens) ?? (prompt !== null && completion !== null ? prompt + completion : null),
    reasoningTokens: tokens(outputDetails.reasoning_tokens),
    cachedTokens: tokens(inputDetails.cached_tokens),
    cost: costAmount(value.cost),
  };
}

export function normalizeGenerationUsage(value: Record<string, unknown>): NormalizedAIUsage {
  const prompt = tokens(value.native_tokens_prompt);
  const completion = tokens(value.native_tokens_completion);
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: prompt !== null && completion !== null ? prompt + completion : null,
    reasoningTokens: tokens(value.native_tokens_reasoning),
    cachedTokens: tokens(value.native_tokens_cached),
    cost: costAmount(value.total_cost),
  };
}

export function summarizeAIUsage(
  turnId: string,
  revision: number,
  calls: Array<{ usageStatus: AIUsageStatus; usage: NormalizedAIUsage | null }>,
  toolCalls: number,
): AIUsageSummary {
  const usages = calls.flatMap((call) => call.usage ? [call.usage] : []);
  const sum = (field: keyof Omit<NormalizedAIUsage, "cost">) =>
    usages.reduce((total, usage) => total + (usage[field] ?? 0), 0);
  return {
    turnId, revision, toolCalls,
    status: calls.some((call) => call.usageStatus === "unavailable") ? "unavailable"
      : calls.length && calls.every((call) => call.usageStatus === "complete") ? "complete" : "pending",
    modelCalls: calls.length,
    resolvedCalls: calls.filter((call) => call.usageStatus === "complete").length,
    promptTokens: sum("promptTokens"), completionTokens: sum("completionTokens"),
    totalTokens: sum("totalTokens"), reasoningTokens: sum("reasoningTokens"), cachedTokens: sum("cachedTokens"),
    cost: sumCostAmounts(usages.flatMap((usage) => typeof usage.cost === "string" ? [usage.cost] : [])),
  };
}
