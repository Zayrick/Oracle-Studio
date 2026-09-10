import type { AIUsageSummary } from "@/features/ai/usage";

const formatTokens = new Intl.NumberFormat("en-US").format;

function formatCostInYuan(credits: string) {
  const [whole, fraction = ""] = credits.split(".");
  const scale = 10n ** BigInt(fraction.length);
  const cents = (BigInt(whole + fraction) * 700n + scale - 1n) / scale;
  return `¥${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

export function AIUsageFooter({
  unavailable = false, usage,
}: {
  unavailable?: boolean;
  usage?: AIUsageSummary;
}) {
  const parts: string[] = [];
  if (usage?.cost != null) parts.push(formatCostInYuan(usage.cost));
  if (usage?.totalTokens) parts.push(`${formatTokens(usage.totalTokens)} tokens`);
  if (unavailable || usage?.status === "unavailable") {
    parts.push(usage?.cost != null ? "部分费用无法获取" : "无法获取费用");
  } else if (usage?.status === "pending" && parts.length) {
    parts.push("统计中");
  }

  const text = parts.join(" · ");
  const details = usage && text ? [
    `输入 ${formatTokens(usage.promptTokens)}`,
    `输出 ${formatTokens(usage.completionTokens)}`,
    `其中推理 ${formatTokens(usage.reasoningTokens)}`,
    `缓存 ${formatTokens(usage.cachedTokens)}`,
    `模型调用 ${usage.modelCalls}（已结算 ${usage.resolvedCalls}）`,
    `工具调用 ${usage.toolCalls}`,
  ].join("；") : undefined;

  return (
    <div
      className="h-5 min-w-0 truncate text-xs leading-5 text-muted-foreground"
      title={details}
    >
      {text}
    </div>
  );
}
