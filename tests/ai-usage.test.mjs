import assert from "node:assert/strict";
import { test } from "node:test";
import { costAmount, normalizeStreamUsage, sumCostAmounts, summarizeAIUsage } from "../app/features/ai/usage.ts";
import { appendAIStreamEventToMessage, parseAIStreamEventLine } from "../app/features/ai/timeline.ts";
import { mergeRecoveredAIUsage } from "../app/features/ai/use-usage-recovery.ts";
import { normalizeAIHistory } from "../app/features/ai/history.ts";

test("amounts keep small credits and sum decimal values exactly", () => {
  assert.equal(costAmount(3e-8), "0.00000003");
  assert.equal(costAmount(0), "0");
  assert.equal(sumCostAmounts(["0.1", "0.2"]), "0.3");
  assert.equal(sumCostAmounts(["0.0003526875", "0.0002264625"]), "0.00057915");
  assert.equal(sumCostAmounts([]), null);
});

test("stream summary updates survive history serialization and ignore stale or unrelated turns", () => {
  const usage = summarizeAIUsage("turn-a", 3, [{ usageStatus: "complete", usage:
    normalizeStreamUsage({ prompt_tokens: 5, completion_tokens: 94, total_tokens: 99, cost: 0.0003526875 }) }], 0);
  const event = parseAIStreamEventLine(JSON.stringify({ type: "usage", usage }));
  const message = appendAIStreamEventToMessage({ id: 2, role: "assistant", content: "OK", turnId: "turn-a", status: "stopped" }, event);
  assert.equal(message.usage.cost, "0.0003526875");
  assert.equal(message.content, "OK");
  assert.equal(appendAIStreamEventToMessage(message, { type: "usage", usage: { ...usage, revision: 2, cost: "1" } }), message);
  assert.equal(appendAIStreamEventToMessage(message, { type: "usage", usage: { ...usage, turnId: "turn-b", revision: 4 } }), message);
  const history = normalizeAIHistory({ activeSessionId: "s", sessions: [{ sessionId: "s", title: "test",
    createdAt: 1, updatedAt: 2, messages: [message] }] });
  assert.deepEqual(history.sessions[0].messages[0].usage, usage);
  assert.equal(history.sessions[0].messages[0].turnId, "turn-a");
  const newer = { ...usage, revision: 4, cost: "0.0005" };
  const recovered = mergeRecoveredAIUsage([message], [newer]);
  assert.deepEqual(recovered[0].usage, newer);
  assert.equal(mergeRecoveredAIUsage(recovered, [usage]), recovered);
  const streaming = [{ ...message, status: "streaming" }];
  assert.equal(mergeRecoveredAIUsage(streaming, [newer]), streaming);
});
