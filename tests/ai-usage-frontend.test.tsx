import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AIUsageFooter } from "@/components/ai-usage-footer";
import type { AIUsageSummary } from "@/features/ai/usage";

const usage: AIUsageSummary = {
  turnId: "turn-1", revision: 3, status: "complete",
  modelCalls: 2, toolCalls: 1, resolvedCalls: 2,
  promptTokens: 1200, completionTokens: 345, totalTokens: 1545,
  reasoningTokens: 120, cachedTokens: 400, cost: "0.00123456789",
};

test("footer reserves a blank line and displays rounded-up yuan before tokens", () => {
  const empty = renderToStaticMarkup(<AIUsageFooter />);
  assert.match(empty, /h-5/);
  assert.doesNotMatch(empty, /tokens|credits|统计/);
  const complete = renderToStaticMarkup(<AIUsageFooter usage={usage} />);
  assert.ok(complete.includes("¥0.01 · 1,545 tokens"));
  assert.match(complete, /输入 1,200；输出 345/);
  assert.match(complete, /模型调用 2（已结算 2）；工具调用 1/);
  for (const [cost, amount] of [["0.011", "¥0.08"], ["0.0015", "¥0.02"], ["0.07", "¥0.49"]]) {
    const html = renderToStaticMarkup(<AIUsageFooter usage={{ ...usage, cost }} />);
    assert.ok(html.includes(`${amount} · 1,545 tokens`));
  }
});

test("footer shows unavailable costs while preserving known amounts, including zero", () => {
  const missing = renderToStaticMarkup(<AIUsageFooter unavailable />);
  assert.match(missing, /无法获取费用/);
  const partial = renderToStaticMarkup(<AIUsageFooter usage={{ ...usage, status: "unavailable", resolvedCalls: 1 }} />);
  assert.ok(partial.includes("¥0.01 · 1,545 tokens · 部分费用无法获取"));
  const free = renderToStaticMarkup(<AIUsageFooter usage={{ ...usage, cost: "0" }} />);
  assert.ok(free.includes("¥0.00 · 1,545 tokens"));
});
