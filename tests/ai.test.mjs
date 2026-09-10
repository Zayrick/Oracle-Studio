import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, beforeEach, mock, test } from "node:test";
import { hashPassword } from "better-auth/crypto";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

import { createAuth } from "../app/features/auth/auth.server.ts";
import { getOpenRouterAPIBase } from "../app/features/ai/config.server.ts";
import {
  bindExistingAccountAI,
  createAICredential,
  discardAICredential,
  getUserAIKey,
} from "../app/features/ai/credentials.server.ts";
import { handleAIRequest } from "../app/features/ai/request.server.ts";
import { handleAIUsageRequest, recoverUsage } from "../app/features/ai/usage-recovery.server.ts";
import { AIUsageRecorder } from "../app/features/ai/usage-store.server.ts";
import { handleBaziAI } from "../app/features/bazi/ai.server.ts";
import { buildBaziPaipan } from "../app/features/bazi/paipan.ts";
import { handleLiuyaoAI } from "../app/features/liuyao/ai.server.ts";
import { migrateTestDatabase } from "./helpers/migrations.mjs";
import {
  aiTestEnvironment,
  openRouterMock,
  sse,
} from "./helpers/openrouter.mjs";

const runtime = new Miniflare(
  convertV4MiniflareOptions({
    name: "ai-tests",
    modules: true,
    script:
      "export default { fetch() { return new Response(null, { status: 404 }); } }",
    compatibilityDate: "2026-08-14",
    d1Databases: ["AUTH_DB"],
  }),
);
const background = [];
const ctx = { waitUntil: (promise) => background.push(promise) };
const password = "ai-test-password-1234";
const chart = buildBaziPaipan({
  name: "测试",
  gender: "male",
  date: new Date(2000, 0, 1),
  time: "12:00",
});
let env;
let openrouter;
let passwordHash;
let expectedDomain = "openrouter.ai";

before(async () => {
  env = {
    ...aiTestEnvironment(),
    AUTH_DB: await runtime.getD1Database("AUTH_DB"),
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    BETTER_AUTH_URL: "https://example.com",
    RESEND_API_KEY: "test-email-key",
    AUTH_EMAIL_FROM: "noreply@example.com",
    TURNSTILE_SITE_KEY: "test-sitekey",
    TURNSTILE_SECRET_KEY: "test-secret",
  };
  await migrateTestDatabase(env.AUTH_DB);
  passwordHash = await hashPassword(password);
  openrouter = openRouterMock(env);
  mock.method(globalThis, "fetch", async (input, init) => {
    assert.equal(init.redirect, "manual", "credentials must never follow redirects");
    const url = new URL(input);
    assert.equal(url.hostname, expectedDomain);
    url.hostname = "openrouter.ai";
    const response = await openrouter.fetch(new Request(url, init));
    assert.ok(response, "unexpected external request");
    return response;
  });
});
beforeEach(async () => {
  while (background.length) await Promise.all(background.splice(0));
  await env.AUTH_DB.batch(
    ["session", "account", "user", "rateLimit"].map((table) =>
      env.AUTH_DB.prepare(`DELETE FROM "${table}"`),
    ),
  );
  openrouter.reset();
  expectedDomain = "openrouter.ai";
  delete env.OPENROUTER_DOMAIN;
});
after(async () => {
  while (background.length) await Promise.all(background.splice(0));
  mock.restoreAll();
  await runtime.dispose();
});

async function addUser(userId = "user-a") {
  const date = new Date().toISOString();
  await env.AUTH_DB.batch([
    env.AUTH_DB.prepare(
      'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)',
    ).bind(userId, userId, `${userId}@example.com`, date, date),
    env.AUTH_DB.prepare(
      'INSERT INTO "account" (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      `credential-${userId}`,
      userId,
      "credential",
      userId,
      passwordHash,
      date,
      date,
    ),
  ]);
}

async function login(userId = "user-a", suppliedPassword = password) {
  return createAuth(env, ctx).handler(
    new Request("https://example.com/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        Origin: "https://example.com",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "192.0.2.15",
      },
      body: JSON.stringify({
        email: `${userId}@example.com`,
        password: suppliedPassword,
      }),
    }),
  );
}

async function account(userId = "user-a") {
  await addUser(userId);
  const response = await login(userId);
  assert.equal(response.status, 200, await response.clone().text());
  return {
    userId,
    cookie: response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; "),
  };
}

function request(feature, identity, options = {}) {
  const {
    method = "POST",
    origin = "https://example.com",
    accountId = identity?.userId,
    body = {},
  } = options;
  const headers = new Headers({
    Origin: origin,
    "Content-Type": "application/json",
  });
  if (identity?.cookie) headers.set("Cookie", identity.cookie);
  if (accountId) headers.set("X-Account-Id", accountId);
  return handleAIRequest(
    new Request(`https://example.com/api/${feature}/ai`, {
      method,
      headers,
      ...(method !== "GET"
        ? {
            body: JSON.stringify({
              systemPrompt: "测试排盘上下文",
              sessionId: "same-chat",
              messages: [{ role: "user", content: "请解读" }],
              chart,
              ...body,
            }),
          }
        : {}),
    }),
    env,
    ctx,
    feature,
    feature === "bazi" ? handleBaziAI : handleLiuyaoAI,
  );
}

test("AI endpoints reject anonymous, cross-origin and switched-account requests before inference", async () => {
  for (const feature of ["bazi", "liuyao"]) {
    assert.equal((await request(feature, null)).status, 401);
    assert.equal((await request(feature, null, { method: "GET" })).status, 405);
  }
  const identity = await account();
  for (const feature of ["bazi", "liuyao"]) {
    assert.equal(
      (await request(feature, identity, { origin: "https://other.example" }))
        .status,
      403,
    );
    assert.equal(
      (await request(feature, identity, { accountId: "other-user" })).status,
      409,
    );
    assert.equal(
      (await request(feature, identity, { accountId: null })).status,
      409,
    );
    assert.equal(
      (await request(feature, identity, { body: { messages: [] } })).status,
      400,
    );
  }
  assert.equal(openrouter.completions.length, 0);
  assert.equal(openrouter.created.length, 1);
});

test("OpenRouter domain defaults and rejects URL components", () => {
  for (const domain of [undefined, "", "   "]) {
    assert.equal(getOpenRouterAPIBase({ OPENROUTER_DOMAIN: domain }), "https://openrouter.ai/api/v1");
  }
  for (const domain of ["https://router.example.com", "router.example.com/path", "router.example.com:443", "user@router.example.com", "router.example.com?x=1", "router.example.com#x", "bad..example.com"]) {
    assert.throws(() => getOpenRouterAPIBase({ OPENROUTER_DOMAIN: domain }), /Invalid OpenRouter domain/);
  }
});

test("custom OpenRouter domain covers key management, both features and both usage recovery paths", async () => {
  expectedDomain = "router.example.com";
  env.OPENROUTER_DOMAIN = " router.example.com ";
  const identity = await account();
  openrouter.completionOverride = () => sse([
    { id: "gen-custom-domain", choices: [{ delta: { content: "OK" } }] },
  ]);
  for (const feature of ["bazi", "liuyao"]) {
    const response = await request(feature, identity);
    assert.equal(response.status, 200);
    await response.text();
  }
  assert.equal(openrouter.created.length, 1);
  assert.equal(openrouter.completions.length, 2);
  assert.equal(openrouter.generations.length, 2);
  assert.equal((await usageRequest(identity)).status, 200);
  assert.equal(openrouter.generations.length, 3);
  await discardAICredential(env, openrouter.created[0].hash);
  assert.equal(openrouter.deleted.length, 1);
});

test("both features use the same account key, independent presets and trusted user attribution", async () => {
  const alice = await account();
  const bob = await account("user-b");
  for (const identity of [alice, bob]) {
    for (const feature of ["bazi", "liuyao"]) {
      const response = await request(feature, identity, {
        body: { user: "spoofed", model: "spoofed", apiKey: "spoofed" },
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control"), /private, no-store/);
      assert.match(response.headers.get("content-type"), /ndjson/);
      assert.match(await response.text(), /测试解读/);
      const upstream = openrouter.completions.at(-1).body;
      assert.equal(upstream.model, `@preset/${feature}`);
      assert.equal(upstream.user, identity.userId);
      assert.equal(upstream.session_id, `${identity.userId}:same-chat`);
      assert.ok(!("apiKey" in upstream));
    }
  }
  assert.equal(openrouter.created.length, 2);
  assert.equal(
    openrouter.completions[0].authorization,
    openrouter.completions[1].authorization,
  );
  assert.notEqual(
    openrouter.completions[0].authorization,
    openrouter.completions[2].authorization,
  );
});

test("legacy users bind on authenticated sign-in, reuse the binding and never provision in AI requests", async () => {
  await addUser();
  assert.equal((await login("user-a", "wrong-password")).status, 401);
  assert.equal(openrouter.created.length, 0);
  const signedIn = await login();
  assert.equal(signedIn.status, 200);
  assert.equal(openrouter.created.length, 1);
  assert.equal((await login()).status, 200);
  assert.equal(openrouter.created.length, 1);
  const identity = {
    userId: "user-a",
    cookie: signedIn.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; "),
  };
  await env.AUTH_DB.prepare("DELETE FROM user_ai_credentials").run();
  const denied = await request("liuyao", identity);
  assert.equal(denied.status, 503);
  assert.match(await denied.text(), /重新登录/);
  assert.equal(
    openrouter.created.length,
    1,
    "AI requests only read existing bindings",
  );
  assert.equal((await login()).status, 200);
  assert.equal(openrouter.created.length, 2);
});

test("D1 leases serialize legacy binding and recover an interrupted attempt", async () => {
  await addUser();
  const results = await Promise.allSettled([
    bindExistingAccountAI(env, "user-a"),
    bindExistingAccountAI(env, "user-a"),
  ]);
  assert.ok(results.some((result) => result.status === "fulfilled"));
  assert.equal(openrouter.created.length, 1);
  await addUser("user-b");
  await env.AUTH_DB.prepare(
    `INSERT INTO user_ai_credentials
    (user_id, workspace_id, updated_at, provisioning_id, provisioning_expires_at) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      "user-b",
      env.OPENROUTER_WORKSPACE_ID,
      Date.now(),
      "interrupted",
      Date.now() + 60_000,
    )
    .run();
  await assert.rejects(bindExistingAccountAI(env, "user-b"), {
    code: "AI_SETUP_IN_PROGRESS",
  });
  await env.AUTH_DB.prepare(
    "UPDATE user_ai_credentials SET provisioning_expires_at = 0 WHERE user_id = 'user-b'",
  ).run();
  await bindExistingAccountAI(env, "user-b");
  assert.equal(openrouter.created.length, 2);
});

test("encrypted keys reject ciphertext swaps, tampering and incorrect encryption secrets", async () => {
  const alice = await account();
  await account("user-b");
  const bobRow = await env.AUTH_DB.prepare(
    "SELECT encrypted_key FROM user_ai_credentials WHERE user_id = 'user-b'",
  ).first();
  const aliceRow = await env.AUTH_DB.prepare(
    "SELECT encrypted_key FROM user_ai_credentials WHERE user_id = 'user-a'",
  ).first();
  await env.AUTH_DB.prepare(
    "UPDATE user_ai_credentials SET encrypted_key = ? WHERE user_id = 'user-a'",
  )
    .bind(bobRow.encrypted_key)
    .run();
  assert.equal((await request("liuyao", alice)).status, 503);
  await env.AUTH_DB.prepare(
    "UPDATE user_ai_credentials SET encrypted_key = ? WHERE user_id = 'user-a'",
  )
    .bind(aliceRow.encrypted_key)
    .run();
  await assert.rejects(
    getUserAIKey(
      { ...env, AI_KEY_ENCRYPTION_SECRET: randomBytes(32).toString("base64") },
      "user-a",
    ),
    { code: "AI_SETUP_FAILED" },
  );
  await assert.rejects(
    getUserAIKey({ ...env, OPENROUTER_WORKSPACE_ID: "other" }, "user-a"),
    { code: "AI_SETUP_FAILED" },
  );
  const parts = aliceRow.encrypted_key.split(".");
  const bytes = Buffer.from(parts[2], "base64");
  bytes[0] ^= 1;
  parts[2] = bytes.toString("base64");
  await env.AUTH_DB.prepare(
    "UPDATE user_ai_credentials SET encrypted_key = ? WHERE user_id = 'user-a'",
  )
    .bind(parts.join("."))
    .run();
  await assert.rejects(getUserAIKey(env, "user-a"), {
    code: "AI_SETUP_FAILED",
  });
  assert.equal(openrouter.completions.length, 0);
});

test("malformed provisioning responses are redacted and known orphan keys are revoked", async () => {
  openrouter.createOverride = () =>
    Response.json({
      data: { hash: "orphan-hash", workspace_id: env.OPENROUTER_WORKSPACE_ID },
    });
  await assert.rejects(createAICredential(env, "user-a"), {
    code: "AI_SETUP_FAILED",
  });
  assert.deepEqual(openrouter.deleted, ["orphan-hash"]);
  openrouter.createOverride = () =>
    Response.json({
      key: "private-key",
      data: { hash: "wrong-workspace", workspace_id: "wrong" },
    });
  await assert.rejects(createAICredential(env, "user-a"), {
    code: "AI_SETUP_FAILED",
  });
  assert.deepEqual(openrouter.deleted, ["orphan-hash", "wrong-workspace"]);
});

test("every Bazi tool round keeps the user's key, preset and session", async () => {
  const identity = await account();
  openrouter.completionOverride = (_request, body) => {
    if (body.messages.at(-1).role === "tool") {
      assert.equal(body.messages.at(-1).tool_call_id, "call-1");
      assert.ok(!body.messages.at(-1).content.startsWith("工具错误:"));
      return sse([{ choices: [{ delta: { content: "工具完成后的解读" } }] }]);
    }
    return sse([
      {
        choices: [
          {
            delta: {
              reasoning: "正在分析",
              tool_calls: [
                {
                  index: 0,
                  id: "call-1",
                  type: "function",
                  function: { name: "bazi_shensha", arguments: "{}" },
                },
              ],
            },
          },
        ],
      },
    ]);
  };
  const response = await request("bazi", identity);
  const events = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.ok(
    events.some(
      (event) => event.type === "tool_call" && event.callId === "call-1",
    ),
  );
  assert.ok(
    events.some((event) => event.type === "tool_result" && !event.error),
  );
  assert.ok(
    events.some(
      (event) => event.type === "text" && event.text === "工具完成后的解读",
    ),
  );
  assert.equal(openrouter.completions.length, 2);
  for (const call of openrouter.completions) {
    assert.equal(call.body.model, "@preset/bazi");
    assert.equal(call.body.user, identity.userId);
    assert.equal(call.body.session_id, `${identity.userId}:same-chat`);
    assert.equal(call.authorization, `Bearer ${openrouter.created[0].key}`);
  }
});

test("upstream HTTP and streaming errors do not disclose credentials", async () => {
  const identity = await account();
  const privateText = `${env.OPENROUTER_MANAGEMENT_KEY} ${openrouter.created[0].key}`;
  openrouter.completionOverride = () =>
    Response.json({ error: { message: privateText } }, { status: 401 });
  for (const feature of ["bazi", "liuyao"]) {
    const response = await request(feature, identity);
    const body = await response.text();
    assert.ok(body.includes("error"));
    assert.ok(!body.includes("sk-or-"));
  }
  openrouter.completionOverride = () =>
    sse([{ error: { message: privateText } }]);
  for (const feature of ["bazi", "liuyao"]) {
    const response = await request(feature, identity);
    const body = await response.text();
    assert.ok(body.includes("error"));
    assert.ok(!body.includes("sk-or-"));
  }
});

test(
  "canceling either downstream stream aborts the upstream request",
  { timeout: 10_000 },
  async () => {
    const identity = await account();
    for (const feature of ["bazi", "liuyao"]) {
      const canceled = Promise.withResolvers();
      openrouter.completionOverride = (upstream) =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  'data: {"choices":[{"delta":{"content":"start"}}]}\n\n',
                ),
              );
              upstream.signal.addEventListener(
                "abort",
                () => {
                  canceled.resolve();
                  controller.error(new DOMException("Aborted", "AbortError"));
                },
                { once: true },
              );
            },
          }),
        );
      const response = await request(feature, identity);
      const reader = response.body.getReader();
      await reader.read();
      await reader.cancel();
      await canceled.promise;
    }
  },
);

test("usage accounting keeps the final chunk and persists full provider costs", async () => {
  const identity = await account();
  const usage = {
    prompt_tokens: 5,
    completion_tokens: 94,
    total_tokens: 99,
    cost: 0.0003526875,
    is_byok: false,
    cost_details: { upstream_inference_cost: 0.00035625, vendor_detail: 0.0001 },
    completion_tokens_details: { reasoning_tokens: 93 },
    prompt_tokens_details: { cached_tokens: 2, cache_write_tokens: 1 },
  };
  openrouter.completionOverride = () => sse([
    { id: "gen-usage", model: "google/gemini-3.8-flash", provider: "Google", choices: [{ delta: { content: "OK" }, finish_reason: null }] },
    { id: "gen-usage", choices: [{ delta: {}, finish_reason: "stop" }] },
    { id: "gen-usage", choices: [], usage },
  ]);
  const response = await request("liuyao", identity, {
    body: { turnId: "usage-turn", messageId: 2, historyRecordId: "chart-1" },
  });
  const events = (await response.text()).trim().split("\n").map(JSON.parse);
  const summary = events.filter((event) => event.type === "usage").at(-1)?.usage;
  assert.ok(summary, "the final usage chunk must reach the client");
  assert.equal(summary.cost, "0.0003526875");
  assert.equal(summary.totalTokens, 99);
  assert.equal(summary.reasoningTokens, 93);
  assert.equal(summary.status, "complete");
  const call = await env.AUTH_DB.prepare("SELECT * FROM ai_model_calls WHERE user_id = ? AND turn_id = ?")
    .bind(identity.userId, "usage-turn").first();
  assert.equal(call.generation_id, "gen-usage");
  assert.equal(call.model, "google/gemini-3.8-flash");
  assert.equal(call.provider, "Google");
  assert.equal(call.cost, "0.0003526875");
  assert.deepEqual(JSON.parse(call.usage_json), usage);
  assert.ok(!JSON.stringify(call).includes(openrouter.created[0].key));
  const turn = await env.AUTH_DB.prepare("SELECT * FROM ai_usage_turns WHERE user_id = ? AND id = ?")
    .bind(identity.userId, "usage-turn").first();
  assert.equal(turn.history_record_id, "chart-1");
  assert.equal(turn.message_id, 2);
});

function usageRequest(identity, overrides = {}) {
  return handleAIUsageRequest(new Request("https://example.com/api/ai/usage", {
    method: "POST",
    headers: { Origin: "https://example.com", "Content-Type": "application/json",
      Cookie: identity?.cookie ?? "", "X-Account-Id": identity?.userId ?? "" },
    body: JSON.stringify({ feature: "liuyao", sessionId: "same-chat", ...overrides }),
  }), env, ctx);
}

test("usage accounting accumulates agent rounds once and traces tool arguments and results", async () => {
  const identity = await account();
  const firstUsage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.00000001 };
  openrouter.completionOverride = (_req, body) => body.messages.at(-1).role === "tool"
    ? sse([
      { id: "gen-second", model: "resolved-model", choices: [{ delta: { content: "最终回答" } }] },
      { id: "gen-second", choices: [], usage: { prompt_tokens: 30, completion_tokens: 4, total_tokens: 34, cost: 0 } },
    ])
    : sse([
      { id: "gen-first", choices: [{ delta: { tool_calls: [{ index: 0, id: "tool-1", type: "function",
        function: { name: "bazi_shensha", arguments: "{}" } }] }, finish_reason: "tool_calls" }] },
      { id: "gen-first", choices: [], usage: firstUsage },
      { id: "gen-first", choices: [], usage: firstUsage },
    ]);
  const response = await request("bazi", identity, { body: { turnId: "agent-turn" } });
  const events = (await response.text()).trim().split("\n").map(JSON.parse);
  const summaries = events.filter((event) => event.type === "usage").map((event) => event.usage);
  const final = summaries.at(-1);
  assert.equal(final.modelCalls, 2);
  assert.equal(final.resolvedCalls, 2, "a free model round is still accounted for");
  assert.equal(final.toolCalls, 1);
  assert.equal(final.totalTokens, 64);
  assert.equal(final.cost, "0.00000001");
  assert.equal(final.status, "complete");
  assert.ok(summaries.some((s) => s.modelCalls === 1 && s.toolCalls === 1 && s.cost === "0.00000001"));
  const { results: calls } = await env.AUTH_DB.prepare("SELECT * FROM ai_model_calls WHERE turn_id = ? ORDER BY sequence")
    .bind("agent-turn").all();
  assert.equal(calls[1].parent_call_id, calls[0].id);
  assert.equal(JSON.parse(calls[1].request_json).messages.at(-1).tool_call_id, "tool-1");
  const tool = await env.AUTH_DB.prepare("SELECT * FROM ai_tool_calls WHERE model_call_id = ?").bind(calls[0].id).first();
  assert.equal(tool.name, "bazi_shensha");
  assert.equal(tool.arguments, "{}");
  assert.ok(tool.result.length > 0);
  assert.equal(tool.state, "complete");
});

test("interrupted usage is recorded, then recovered when the owner reopens the session", async () => {
  const alice = await account();
  const bob = await account("user-b");
  openrouter.completionOverride = (upstream) => new Response(new ReadableStream({
    start(controller) {
      upstream.signal.addEventListener("abort", () => {
        controller.error(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    },
  }), { headers: { "X-Generation-Id": "gen-stopped" } });
  const response = await request("liuyao", alice, { body: { turnId: "stopped-turn" } });
  const reader = response.body.getReader();
  await reader.read();
  await reader.cancel();
  while (background.length) await Promise.all(background.splice(0));
  const call = await env.AUTH_DB.prepare("SELECT * FROM ai_model_calls WHERE turn_id = ?")
    .bind("stopped-turn").first();
  assert.equal(call.state, "stopped");
  assert.equal(call.generation_id, "gen-stopped");
  assert.equal(call.usage_status, "unavailable");
  assert.equal(openrouter.generations.length, 1);
  assert.equal((await usageRequest(null)).status, 401);
  assert.deepEqual((await (await usageRequest(bob)).json()).usages, []);
  assert.deepEqual((await (await usageRequest(alice, { sessionId: "other-session" })).json()).usages, []);
  assert.equal(openrouter.generations.length, 1);

  const metadata = { id: "gen-stopped", total_cost: 0.00000003, native_tokens_prompt: 5,
    native_tokens_completion: 6, native_tokens_reasoning: 2, native_tokens_cached: 1,
    model: "resolved", provider_name: "Google", cancelled: true, custom_provider_cost: { extra: 1 } };
  openrouter.generationOverride = (lookup) => {
    assert.equal(lookup.signal.aborted, false);
    return Response.json({ data: metadata });
  };
  const result = await usageRequest(alice);
  const usage = (await result.json()).usages[0];
  assert.equal(usage.status, "complete");
  assert.equal(usage.cost, "0.00000003");
  assert.equal(usage.totalTokens, 11);
  await usageRequest(alice);
  assert.equal(openrouter.generations.length, 2);
  const { results: observations } = await env.AUTH_DB.prepare(`SELECT * FROM ai_usage_observations
    WHERE model_call_id = ? ORDER BY rowid`).bind(call.id).all();
  assert.equal(observations[0].error_code, "http_404");
  assert.deepEqual(JSON.parse(observations[0].payload_json), { error: { message: "Not found" } });
  assert.deepEqual(JSON.parse(observations[1].payload_json), { data: metadata });
});

test("usage accounting preserves final stream costs against a delayed generation lookup", async () => {
  const identity = await account();
  for (const delayedCost of [0.001, null]) {
    const turnId = `race-${delayedCost}`;
    const recorder = new AIUsageRecorder(env.AUTH_DB, identity.userId, "liuyao", {
      turnId, sessionId: "same-chat", historyRecordId: null, messageId: 1,
    }, env.OPENROUTER_WORKSPACE_ID);
    await recorder.initialize();
    const call = await recorder.startCall({ model: "@preset/liuyao" }, "@preset/liuyao");
    await recorder.response(call, new Response(null, { headers: { "X-Generation-Id": turnId } }));
    const started = Promise.withResolvers();
    const release = Promise.withResolvers();
    const delayedPayload = { data: { id: turnId, model: "stale-model", provider_name: "stale-provider",
      total_cost: delayedCost, native_tokens_prompt: 1, native_tokens_completion: 5 } };
    openrouter.generationOverride = async () => {
      started.resolve();
      await release.promise;
      return Response.json(delayedPayload);
    };
    const recovery = recoverUsage({ db: env.AUTH_DB, userId: identity.userId,
      apiKey: openrouter.created[0].key, scope: { turnId } });
    await started.promise;
    await recorder.chunk(call, { id: turnId, model: "final-model", provider: "final-provider",
      choices: [], usage: { cost: 0.013, prompt_tokens: 10, completion_tokens: 100, total_tokens: 110 } });
    release.resolve();
    await recovery;
    const stored = await env.AUTH_DB.prepare("SELECT * FROM ai_model_calls WHERE id = ?").bind(call.id).first();
    assert.equal(stored.cost, "0.013");
    assert.equal(JSON.parse(stored.normalized_json).totalTokens, 110);
    assert.equal(stored.model, "final-model");
    assert.equal(stored.provider, "final-provider");
    assert.equal(stored.usage_status, "complete");
    const observation = await env.AUTH_DB.prepare("SELECT payload_json FROM ai_usage_observations WHERE model_call_id = ? AND source = 'generation'")
      .bind(call.id).first();
    assert.deepEqual(JSON.parse(observation.payload_json), delayedPayload, "late observations remain available for audit");
  }
});
