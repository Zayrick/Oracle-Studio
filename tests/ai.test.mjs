import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, beforeEach, mock, test } from "node:test";
import { hashPassword } from "better-auth/crypto";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

import { createAuth } from "../app/features/auth/auth.server.ts";
import {
  bindExistingAccountAI,
  createAICredential,
  getUserAIKey,
} from "../app/features/ai/credentials.server.ts";
import { handleAIRequest } from "../app/features/ai/request.server.ts";
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
    const response = await openrouter.fetch(new Request(input, init));
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
