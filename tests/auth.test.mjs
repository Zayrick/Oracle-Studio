import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, beforeEach, mock, test } from "node:test";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { getMigrations } from "better-auth/db/migration";

import {
  createAuth,
  isAuthConfigured,
} from "../app/features/auth/auth.server.ts";
import { safeRedirect } from "../app/features/auth/shared.ts";

import { migrateTestDatabase } from "./helpers/migrations.mjs";
import { aiTestEnvironment, openRouterMock } from "./helpers/openrouter.mjs";
import { getUserAIKey } from "../app/features/ai/credentials.server.ts";

const runtime = new Miniflare(
  convertV4MiniflareOptions({
    name: "auth-tests",
    modules: true,
    script:
      "export default { fetch() { return new Response(null, { status: 404 }); } }",
    compatibilityDate: "2026-08-14",
    d1Databases: ["AUTH_DB"],
  }),
);
const email = "account@example.com";
const password = "test-password-1234";
const messages = [];
const background = [];
const ctx = { waitUntil: (promise) => background.push(promise) };
let env;
let openrouter;
let requestNumber = 0;
let turnstileOverride;
let emailStatus = 200;
const spentTokens = new Set();
const challenges = [];

before(async () => {
  env = {
    ...aiTestEnvironment(),
    AUTH_DB: await runtime.getD1Database("AUTH_DB"),
    RESEND_API_KEY: "re_auth_test_placeholder",
    AUTH_EMAIL_FROM: "noreply@example.com",
    BETTER_AUTH_URL: "https://example.com",
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    TURNSTILE_SITE_KEY: "production-sitekey-placeholder",
    TURNSTILE_SECRET_KEY: "production-secret-placeholder",
  };
  await migrateTestDatabase(env.AUTH_DB);
  openrouter = openRouterMock(env);
  mock.method(globalThis, "fetch", async (input, init) => {
    const request = new Request(input, init);
    const aiResponse = await openrouter.fetch(request);
    if (aiResponse) return aiResponse;
    if (
      request.url ===
      "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    ) {
      assert.equal(request.method, "POST");
      const body = new URLSearchParams(await request.text());
      assert.equal(body.get("secret"), env.TURNSTILE_SECRET_KEY);
      assert.ok(body.get("remoteip"));
      const token = body.get("response");
      challenges.push(token);
      if (turnstileOverride) return turnstileOverride();
      const success = token.startsWith("valid-") && !spentTokens.has(token);
      spentTokens.add(token);
      return Response.json({
        success,
        action: "register_email",
        hostname: "example.com",
      });
    }
    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.method, "POST");
    assert.equal(
      request.headers.get("authorization"),
      `Bearer ${env.RESEND_API_KEY}`,
    );
    if (emailStatus !== 200) return new Response(null, { status: emailStatus });
    messages.push(await request.json());
    return Response.json({ id: "test-email" });
  });
});

beforeEach(async () => {
  while (background.length) await Promise.all(background.splice(0));
  await env.AUTH_DB.batch(
    [
      "session",
      "account",
      "verification",
      "pendingRegistration",
      "rateLimit",
      "user",
    ].map((table) => env.AUTH_DB.prepare(`DELETE FROM "${table}"`)),
  );
  openrouter.reset();
  messages.length = 0;
  challenges.length = 0;
  spentTokens.clear();
  turnstileOverride = undefined;
  emailStatus = 200;
});

after(async () => {
  mock.restoreAll();
  await runtime.dispose();
});

async function request(
  path,
  body,
  { cookie, origin = env.BETTER_AUTH_URL, ip } = {},
) {
  const headers = new Headers({
    Origin: origin,
    "CF-Connecting-IP": ip ?? `192.0.2.${(++requestNumber % 250) + 1}`,
  });
  if (body) headers.set("Content-Type", "application/json");
  if (cookie) headers.set("Cookie", cookie);
  // New auth instance per request, just like the Worker. Limits must survive this.
  const response = await createAuth(env, ctx).handler(
    new Request(`${env.BETTER_AUTH_URL}/api/auth${path}`, {
      method: body ? "POST" : "GET",
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
  while (background.length) await Promise.all(background.splice(0));
  const text = await response.text();
  return {
    response,
    data: text
      ? response.headers.get("content-type")?.includes("application/json")
        ? JSON.parse(text)
        : text
      : null,
  };
}

function latestCode() {
  const code = messages.at(-1)?.text.match(/验证码：(\d{6})/u)?.[1];
  assert.ok(
    code,
    "a six-digit code should be sent through the mocked Resend API",
  );
  return code;
}

function cookieFrom(response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function sendCode(address = email, options = {}) {
  return request("/registration/send-code", {
    name: "测试账户",
    email: address,
    turnstileToken: `valid-${++requestNumber}`,
    ...options,
  });
}

async function allowResend(address = email) {
  await env.AUTH_DB.prepare(
    'UPDATE "pendingRegistration" SET "resendAfter" = 0 WHERE "email" = ?',
  )
    .bind(address)
    .run();
}

async function verifyCode(otp = latestCode(), options = {}) {
  return request("/registration/verify-email", {
    email,
    name: "测试账户",
    otp,
    ...options,
  });
}

async function startRegistration() {
  const sent = await sendCode();
  assert.equal(sent.response.status, 200);
  const verified = await verifyCode();
  assert.equal(verified.response.status, 200);
  return verified.data.token;
}

async function complete(token, options = {}) {
  return request("/registration/complete", {
    email,
    password,
    token,
    ...options,
  });
}

async function verifiedAccount() {
  const token = await startRegistration();
  const result = await complete(token);
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  return cookieFrom(result.response);
}

async function count(table) {
  return (
    await env.AUTH_DB.prepare(
      `SELECT COUNT(*) AS count FROM "${table}"`,
    ).first()
  ).count;
}

async function noAccount() {
  for (const table of ["user", "account", "session"])
    assert.equal(await count(table), 0, table);
}

test("committed migration matches the configured Better Auth schema", async () => {
  const migration = await getMigrations(createAuth(env).options);
  assert.deepEqual(migration.toBeCreated, []);
  assert.deepEqual(migration.toBeAdded, []);
  assert.deepEqual(migration.toBeAddedIndexes, []);
  assert.deepEqual(migration.schemaProblems, []);
});

test("email verification only creates a temporary proof; login and password reset cannot complete registration", async () => {
  const sent = await sendCode(`  ${email.toUpperCase()}  `);
  assert.equal(sent.response.status, 200);
  assert.equal(cookieFrom(sent.response), "");
  assert.equal(challenges.length, 1);
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].to, [email]);
  await noAccount();
  const pending = await env.AUTH_DB.prepare(
    'SELECT * FROM "pendingRegistration"',
  ).first();
  assert.notEqual(pending.otpHash, latestCode());
  assert.equal(pending.tokenHash, null);
  assert.equal(
    (await request("/sign-in/email", { email, password })).response.status,
    401,
  );
  const verified = await verifyCode(latestCode(), { name: "  新昵称  " });
  assert.equal(verified.response.status, 200);
  assert.equal(verified.data.token.length, 48);
  assert.equal(cookieFrom(verified.response), "");
  await noAccount();
  assert.equal((await request("/get-session")).data, null);
  assert.equal(
    (await request("/sign-in/email", { email, password })).response.status,
    401,
  );
  assert.equal(
    (await request("/email-otp/request-password-reset", { email })).response
      .status,
    200,
  );
  assert.equal(
    messages.length,
    1,
    "an unfinished registration cannot receive password reset mail",
  );
  assert.equal(
    (
      await request("/email-otp/reset-password", {
        email,
        otp: latestCode(),
        password,
      })
    ).response.status,
    400,
  );
  const proof = await env.AUTH_DB.prepare(
    'SELECT * FROM "pendingRegistration"',
  ).first();
  assert.equal(proof.name, "新昵称");
  assert.notEqual(proof.tokenHash, verified.data.token);
  assert.ok(proof.tokenExpiresAt > Date.now());
  await noAccount();
});

test("only the password step creates a verified account, hashes credentials and issues a secure session", async () => {
  const token = await startRegistration();
  const result = await complete(token);
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(await count("pendingRegistration"), 0);
  assert.equal(await count("user"), 1);
  assert.equal(await count("account"), 1);
  assert.equal(openrouter.created.length, 1);
  const user = await env.AUTH_DB.prepare('SELECT id FROM "user"').first();
  const binding = await env.AUTH_DB.prepare('SELECT * FROM user_ai_credentials').first();
  assert.equal(binding.user_id, user.id);
  assert.equal(binding.key_hash, openrouter.created[0].hash);
  assert.ok(!JSON.stringify(binding).includes(openrouter.created[0].key));
  assert.equal(await getUserAIKey(env, user.id), openrouter.created[0].key);
  assert.ok(!JSON.stringify(result.data).includes(openrouter.created[0].key));
  const stored = await env.AUTH_DB.prepare(
    'SELECT password FROM "account"',
  ).first();
  assert.ok(stored.password);
  assert.notEqual(stored.password, password);
  const cookies = result.response.headers.getSetCookie().join("; ");
  assert.match(cookies, /HttpOnly/i);
  assert.match(cookies, /Secure/i);
  assert.match(cookies, /SameSite=Lax/i);
  const cookie = cookieFrom(result.response);
  const session = await request("/get-session", undefined, { cookie });
  assert.equal(session.data.user.email, email);
  assert.equal(session.data.user.emailVerified, true);
  assert.equal(session.data.user.name, "测试账户");
  assert.equal((await complete(token)).response.status, 400);
  const login = await request("/sign-in/email", { email, password });
  assert.equal(login.response.status, 200);
  assert.equal(messages.length, 1);
  const loginCookie = cookieFrom(login.response);
  assert.equal(
    (await request("/sign-out", {}, { cookie: loginCookie })).response.status,
    200,
  );
  assert.equal(
    (await request("/get-session", undefined, { cookie: loginCookie })).data,
    null,
  );
});

test("old signup, registration verification and passwordless endpoints cannot bypass the two steps", async () => {
  for (const path of [
    "/sign-up/email",
    "/sign-in/email-otp",
    "/email-otp/send-verification-otp",
    "/email-otp/verify-email",
    "/send-verification-email",
    "/verify-email",
  ]) {
    for (const suffix of ["", "/"]) {
      const result = await request(path + suffix, {
        email,
        name: "测试",
        password,
        otp: "123456",
        type: "email-verification",
      });
      assert.equal(result.response.status, 404, path + suffix);
      assert.equal(cookieFrom(result.response), "");
    }
  }
  assert.equal(messages.length, 0);
  await noAccount();
});

test("a verified email proof is single-use under concurrent verification and completion", async () => {
  await sendCode();
  const otp = latestCode();
  const verified = await Promise.all([verifyCode(otp), verifyCode(otp)]);
  assert.deepEqual(verified.map((v) => v.response.status).sort(), [200, 400]);
  await noAccount();
  const token = verified.find((v) => v.response.status === 200).data.token;
  const completed = await Promise.all([complete(token), complete(token)]);
  assert.equal(completed.filter((v) => v.response.status === 200).length, 1);
  assert.ok(completed.some((v) => [400, 409].includes(v.response.status)));
  assert.equal(openrouter.created.length, 1, "concurrent completion must provision only one key");
  assert.equal(await count("user"), 1);
  assert.equal(await count("account"), 1);
  assert.equal(await count("session"), 1);
});

test("registration proof is bound to the verified email and cannot be forged or used after expiry", async () => {
  const token = await startRegistration();
  assert.equal(
    (await complete(token, { email: "different@example.com" })).response.status,
    400,
  );
  assert.equal((await complete("x".repeat(48))).response.status, 400);
  for (const invalidPassword of ["short", "x".repeat(129)]) {
    assert.equal(
      (await complete(token, { password: invalidPassword })).response.status,
      400,
    );
  }
  await noAccount();
  await env.AUTH_DB.prepare(
    'UPDATE "pendingRegistration" SET "tokenExpiresAt" = 0',
  ).run();
  const expired = await complete(token);
  assert.equal(expired.response.status, 400);
  assert.equal(expired.data.code, "REGISTRATION_EXPIRED");
  await noAccount();
});

test("failed credential creation rolls back the user and preserves the proof for retry", async () => {
  const token = await startRegistration();
  await env.AUTH_DB.prepare(
    `CREATE TRIGGER reject_test_credential BEFORE INSERT ON "account"
    BEGIN SELECT RAISE(ABORT, 'test credential failure'); END`,
  ).run();
  try {
    assert.equal((await complete(token)).response.status, 500);
    await noAccount();
    assert.equal(await count("pendingRegistration"), 1);
    assert.equal(openrouter.keys.size, 0, "failed D1 commits must revoke the newly created key");
    assert.equal(openrouter.deleted.length, 1);
  } finally {
    await env.AUTH_DB.prepare("DROP TRIGGER reject_test_credential").run();
  }
  assert.equal((await complete(token)).response.status, 200);
});

test("OpenRouter failure leaves no account or session and the same proof can retry", async () => {
  const token = await startRegistration();
  openrouter.createOverride = () => Response.json({ error: { message: env.OPENROUTER_MANAGEMENT_KEY } }, { status: 503 });
  const failed = await complete(token);
  assert.equal(failed.response.status, 503);
  assert.equal(failed.data.code, "AI_SETUP_FAILED");
  assert.ok(!JSON.stringify(failed.data).includes(env.OPENROUTER_MANAGEMENT_KEY));
  assert.equal(cookieFrom(failed.response), "");
  await noAccount();
  assert.equal(await count("user_ai_credentials"), 0);
  assert.equal((await env.AUTH_DB.prepare('SELECT "completionId" FROM "pendingRegistration"').first()).completionId, null);
  openrouter.createOverride = null;
  assert.equal((await complete(token)).response.status, 200);
  assert.equal(openrouter.created.length, 1);
});

test("a session failure keeps the committed account key and allows a normal login", async () => {
  const token = await startRegistration();
  await env.AUTH_DB.prepare(`CREATE TRIGGER reject_test_session BEFORE INSERT ON "session"
    BEGIN SELECT RAISE(ABORT, 'test session failure'); END`).run();
  try {
    const result = await complete(token);
    assert.equal(result.response.status, 500);
    assert.equal(result.data.code, "REGISTRATION_LOGIN_FAILED");
    assert.equal(await count("user"), 1);
    assert.equal(await count("user_ai_credentials"), 1);
    assert.equal(openrouter.keys.size, 1);
    assert.equal(openrouter.deleted.length, 0);
  } finally {
    await env.AUTH_DB.prepare("DROP TRIGGER reject_test_session").run();
  }
  assert.equal((await request("/sign-in/email", { email, password })).response.status, 200);
  assert.equal(openrouter.created.length, 1);
});

test("invalid key encryption configuration stops registration before provisioning", async () => {
  const token = await startRegistration();
  const secret = env.AI_KEY_ENCRYPTION_SECRET;
  env.AI_KEY_ENCRYPTION_SECRET = "too-short";
  try {
    assert.equal((await complete(token)).response.status, 503);
    assert.equal(openrouter.created.length, 0);
    await noAccount();
  } finally {
    env.AI_KEY_ENCRYPTION_SECRET = secret;
  }
  assert.equal((await complete(token)).response.status, 200);
});

test("registration awaits provisioning and concurrent resends cannot replace a claimed proof", async () => {
  const token = await startRegistration();
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  openrouter.createOverride = async (upstream, body) => {
    started.resolve();
    await release.promise;
    openrouter.createOverride = null;
    return openrouter.fetch(new Request(upstream.url, { method: "POST", headers: upstream.headers, redirect: upstream.redirect, body: JSON.stringify(body) }));
  };
  const completing = complete(token);
  try {
    await started.promise;
    await noAccount();
    assert.equal((await complete(token)).response.status, 409);
    await allowResend();
    assert.equal((await sendCode()).response.status, 429);
    assert.equal(messages.length, 1);
  } finally {
    release.resolve();
  }
  assert.equal((await completing).response.status, 200);
  assert.equal(openrouter.created.length, 1);
  assert.equal(await count("user_ai_credentials"), 1);
});

test("expired OTPs and codes exceeding the attempt limit cannot verify", async () => {
  await sendCode();
  const expired = latestCode();
  await env.AUTH_DB.prepare(
    'UPDATE "pendingRegistration" SET "otpExpiresAt" = 0',
  ).run();
  assert.equal((await verifyCode(expired)).response.status, 400);
  await sendCode();
  const otp = latestCode();
  const wrong = otp === "000000" ? "111111" : "000000";
  const attempts = await Promise.all(
    Array.from({ length: 4 }, () => verifyCode(wrong)),
  );
  assert.ok(attempts.every((a) => a.response.status === 400));
  assert.equal((await verifyCode(otp)).response.status, 400);
  assert.equal(
    (
      await env.AUTH_DB.prepare(
        'SELECT attempts FROM "pendingRegistration"',
      ).first()
    ).attempts,
    3,
  );
  await noAccount();
});

test("resends enforce a per-email cooldown, replace the code and invalidate an earlier proof", async () => {
  await sendCode();
  const previous = latestCode();
  assert.equal((await sendCode()).response.status, 429);
  assert.equal(messages.length, 1);
  await allowResend();
  assert.equal((await sendCode()).response.status, 200);
  const current = latestCode();
  if (previous !== current)
    assert.equal((await verifyCode(previous)).response.status, 400);
  const verified = await verifyCode(current);
  assert.equal(verified.response.status, 200);
  await allowResend();
  await sendCode();
  assert.equal((await complete(verified.data.token)).response.status, 400);
  const fresh = await verifyCode();
  assert.equal(fresh.response.status, 200);
  assert.equal((await complete(fresh.data.token)).response.status, 200);
});

test("Turnstile rejects missing, failed, reused and wrong-site challenges before any email or pending registration", async () => {
  for (const turnstileToken of ["", "invalid-token"]) {
    assert.equal(
      (await sendCode(email, { turnstileToken })).response.status,
      403,
    );
  }
  const cases = [
    () => Response.json({ success: false }),
    () =>
      Response.json({
        success: true,
        hostname: "evil.example",
        action: "register_email",
      }),
    () =>
      Response.json({
        success: true,
        hostname: "example.com",
        action: "login",
      }),
    () => new Response("unavailable", { status: 503 }),
    () => new Response("invalid JSON"),
    () => {
      throw new Error("network failure");
    },
  ];
  for (const response of cases) {
    turnstileOverride = response;
    const denied = await sendCode();
    assert.equal(denied.response.status, 403);
    assert.equal(denied.data.code, "TURNSTILE_FAILED");
    assert.equal(messages.length, 0);
    assert.equal(await count("pendingRegistration"), 0);
  }
  turnstileOverride = undefined;
  const turnstileToken = "valid-single-use";
  assert.equal(
    (await sendCode(email, { turnstileToken })).response.status,
    200,
  );
  assert.equal(
    (await sendCode("other@example.com", { turnstileToken })).response.status,
    403,
  );
  assert.equal(messages.length, 1);
  await noAccount();
});

test("official test keys support Cloudflare dummy metadata without weakening real-key validation", async () => {
  const original = {
    site: env.TURNSTILE_SITE_KEY,
    secret: env.TURNSTILE_SECRET_KEY,
  };
  turnstileOverride = () =>
    Response.json({ success: true, hostname: "localhost", action: "test" });
  try {
    assert.equal((await sendCode()).response.status, 403);
    env.TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
    env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
    assert.equal(
      (await sendCode(email, { turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" }))
        .response.status,
      200,
    );
  } finally {
    env.TURNSTILE_SITE_KEY = original.site;
    env.TURNSTILE_SECRET_KEY = original.secret;
  }
});

test("email delivery failure leaves no account and permits a fresh challenge retry", async () => {
  emailStatus = 503;
  const failure = await sendCode();
  assert.equal(failure.response.status, 503);
  assert.equal(failure.data.code, "EMAIL_DELIVERY_FAILED");
  assert.equal(await count("pendingRegistration"), 0);
  await noAccount();
  emailStatus = 200;
  assert.equal((await sendCode()).response.status, 200);
});

test("existing accounts cannot request new registration credentials or replace their password", async () => {
  await verifiedAccount();
  const sent = await sendCode(email.toUpperCase());
  assert.equal(sent.response.status, 200);
  assert.equal(messages.length, 1);
  assert.equal(await count("pendingRegistration"), 0);
  assert.equal((await verifyCode()).response.status, 400);
  assert.equal(
    (await request("/sign-in/email", { email, password })).response.status,
    200,
  );
  assert.equal(await count("user"), 1);
});

test("password reset rejects an incorrect code and invalidates the old password and every session", async () => {
  const oldCookie = await verifiedAccount();
  assert.equal(
    (await request("/email-otp/request-password-reset", { email })).response
      .status,
    200,
  );
  const otp = latestCode();
  const newPassword = "replacement-password-5678";
  const wrong = otp === "000000" ? "111111" : "000000";
  assert.equal(
    (
      await request("/email-otp/reset-password", {
        email,
        otp: wrong,
        password: newPassword,
      })
    ).response.status,
    400,
  );
  assert.equal(
    (
      await request("/email-otp/reset-password", {
        email,
        otp,
        password: newPassword,
      })
    ).response.status,
    200,
  );
  assert.equal(
    (await request("/get-session", undefined, { cookie: oldCookie })).data,
    null,
  );
  assert.equal(
    (await request("/sign-in/email", { email, password })).response.status,
    401,
  );
  assert.equal(
    (await request("/sign-in/email", { email, password: newPassword })).response
      .status,
    200,
  );
  assert.equal(
    (await request("/email-otp/reset-password", { email, otp, password }))
      .response.status,
    400,
  );
});

test("unknown password reset requests do not send mail or create accounts", async () => {
  const reset = await request("/email-otp/request-password-reset", { email });
  assert.equal(reset.response.status, 200);
  assert.equal(messages.length, 0);
  await noAccount();
  await verifiedAccount();
  const known = await request("/email-otp/request-password-reset", { email });
  assert.deepEqual(reset.data, known.data);
});

test("profile names are trimmed and validated on the server without changing login credentials", async () => {
  const cookie = await verifiedAccount();
  const before = (await request("/get-session", undefined, { cookie })).data
    .user;
  const updated = await request(
    "/update-user",
    { name: "  新名字  " },
    { cookie },
  );
  assert.equal(updated.response.status, 200, JSON.stringify(updated.data));
  assert.ok(updated.response.headers.getSetCookie().length > 0);
  const after = (await request("/get-session", undefined, { cookie })).data
    .user;
  assert.equal(after.name, "新名字");
  assert.equal(after.id, before.id);
  assert.equal(after.email, email);
  for (const name of ["", "   ", "x".repeat(51), null, 42, {}]) {
    const invalid = await request("/update-user", { name }, { cookie });
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.data.code, "INVALID_NAME");
  }
  assert.equal(
    (
      await request(
        "/update-user",
        { email: "unverified@example.com" },
        { cookie },
      )
    ).response.status,
    400,
  );
  assert.equal(
    (await request("/get-session", undefined, { cookie })).data.user.name,
    "新名字",
  );
  assert.equal(
    (await request("/sign-in/email", { email, password })).response.status,
    200,
  );
});

test("email changes require a code for the new email and preserve the account, password and session", async () => {
  const cookie = await verifiedAccount();
  const original = (await request("/get-session", undefined, { cookie })).data
    .user;
  const newEmail = "replacement@example.com";
  const sent = await request(
    "/email-otp/request-email-change",
    { newEmail: `  ${newEmail.toUpperCase()}  ` },
    { cookie },
  );
  assert.equal(sent.response.status, 200, JSON.stringify(sent.data));
  assert.deepEqual(messages.at(-1).to, [newEmail]);
  assert.equal(messages.at(-1).subject, "云占 · 修改邮箱验证码");
  assert.equal(
    (await request("/get-session", undefined, { cookie })).data.user.email,
    email,
  );
  assert.equal(
    (await request("/sign-in/email", { email, password })).response.status,
    200,
  );
  assert.equal(
    (await request("/sign-in/email", { email: newEmail, password })).response
      .status,
    401,
  );
  const otp = latestCode();
  const wrong = otp === "000000" ? "111111" : "000000";
  assert.equal(
    (
      await request(
        "/email-otp/change-email",
        { newEmail, otp: wrong },
        { cookie },
      )
    ).response.status,
    400,
  );
  const updated = await request(
    "/email-otp/change-email",
    { newEmail: newEmail.toUpperCase(), otp },
    { cookie },
  );
  assert.equal(updated.response.status, 200, JSON.stringify(updated.data));
  const user = (await request("/get-session", undefined, { cookie })).data.user;
  assert.equal(user.id, original.id);
  assert.equal(user.name, original.name);
  assert.equal(user.email, newEmail);
  assert.equal(user.emailVerified, true);
  assert.equal(await count("user"), 1);
  assert.equal(await count("account"), 1);
  assert.equal(
    (await request("/sign-in/email", { email, password })).response.status,
    401,
  );
  assert.equal(
    (await request("/sign-in/email", { email: newEmail, password })).response
      .status,
    200,
  );
  assert.equal(
    (await request("/email-otp/change-email", { newEmail, otp }, { cookie }))
      .response.status,
    400,
  );
});

test("profile mutations require a session and reject cross-origin requests", async () => {
  const cookie = await verifiedAccount();
  for (const [path, body] of [
    ["/update-user", { name: "未经授权" }],
    ["/email-otp/request-email-change", { newEmail: "other@example.com" }],
    [
      "/email-otp/change-email",
      { newEmail: "other@example.com", otp: "123456" },
    ],
  ]) {
    assert.equal((await request(path, body)).response.status, 401, path);
    assert.equal(
      (
        await request(path, body, {
          cookie,
          origin: "https://untrusted.example",
        })
      ).response.status,
      403,
      path,
    );
  }
  const user = (await request("/get-session", undefined, { cookie })).data.user;
  assert.equal(user.name, "测试账户");
  assert.equal(user.email, email);
  assert.equal(messages.length, 1);
});

test("email change codes cannot be used by another account or for another address", async () => {
  const cookie = await verifiedAccount();
  const otherEmail = "second-account@example.com";
  await sendCode(otherEmail);
  const verified = await verifyCode(latestCode(), { email: otherEmail });
  const other = await complete(verified.data.token, { email: otherEmail });
  const otherCookie = cookieFrom(other.response);
  const newEmail = "replacement@example.com";
  await request("/email-otp/request-email-change", { newEmail }, { cookie });
  const otp = latestCode();
  assert.equal(
    (
      await request(
        "/email-otp/change-email",
        { newEmail, otp },
        { cookie: otherCookie },
      )
    ).response.status,
    400,
  );
  assert.equal(
    (
      await request(
        "/email-otp/change-email",
        { newEmail: "different@example.com", otp },
        { cookie },
      )
    ).response.status,
    400,
  );
  assert.equal(
    (await request("/email-otp/change-email", { newEmail, otp }, { cookie }))
      .response.status,
    200,
  );
  assert.equal(
    (await request("/get-session", undefined, { cookie: otherCookie })).data
      .user.email,
    otherEmail,
  );
});

test("expired and exhausted email change codes leave the current email intact", async () => {
  const cookie = await verifiedAccount();
  const newEmail = "replacement@example.com";
  await request("/email-otp/request-email-change", { newEmail }, { cookie });
  const expiredCode = latestCode();
  await env.AUTH_DB.prepare('UPDATE "verification" SET "expiresAt" = ?')
    .bind(new Date(0).toISOString())
    .run();
  const expired = await request(
    "/email-otp/change-email",
    { newEmail, otp: expiredCode },
    { cookie },
  );
  assert.equal(expired.response.status, 400);
  assert.equal(expired.data.code, "OTP_EXPIRED");
  await request("/email-otp/request-email-change", { newEmail }, { cookie });
  const otp = latestCode();
  const wrong = otp === "000000" ? "111111" : "000000";
  for (let i = 0; i < 3; i++) {
    assert.equal(
      (
        await request(
          "/email-otp/change-email",
          { newEmail, otp: wrong },
          { cookie },
        )
      ).response.status,
      400,
    );
  }
  const exhausted = await request(
    "/email-otp/change-email",
    { newEmail, otp },
    { cookie },
  );
  assert.equal(exhausted.response.status, 403);
  assert.equal(exhausted.data.code, "TOO_MANY_ATTEMPTS");
  assert.equal(
    (await request("/get-session", undefined, { cookie })).data.user.email,
    email,
  );
});

test("invalid, unchanged and occupied email addresses cannot replace the current email", async () => {
  const cookie = await verifiedAccount();
  for (const newEmail of [
    "invalid",
    "",
    "x".repeat(255) + "@example.com",
    email.toUpperCase(),
  ]) {
    assert.equal(
      (
        await request(
          "/email-otp/request-email-change",
          { newEmail },
          { cookie },
        )
      ).response.status,
      400,
    );
  }
  const occupied = "occupied@example.com";
  await sendCode(occupied);
  const verified = await verifyCode(latestCode(), { email: occupied });
  await complete(verified.data.token, { email: occupied });
  const messageCount = messages.length;
  const sent = await request(
    "/email-otp/request-email-change",
    { newEmail: occupied },
    { cookie },
  );
  assert.equal(
    sent.response.status,
    200,
    "occupied addresses use a generic response",
  );
  assert.equal(messages.length, messageCount);
  assert.equal(
    (
      await request(
        "/email-otp/change-email",
        { newEmail: occupied, otp: latestCode() },
        { cookie },
      )
    ).response.status,
    400,
  );
  assert.equal(
    (await request("/get-session", undefined, { cookie })).data.user.email,
    email,
  );
  assert.equal(await count("user"), 2);
});

test("email change requests are rate limited across request-scoped auth instances", async () => {
  const cookie = await verifiedAccount();
  const ip = "198.51.100.22";
  for (let i = 0; i < 3; i++) {
    assert.equal(
      (
        await request(
          "/email-otp/request-email-change",
          { newEmail: `replacement${i}@example.com` },
          { cookie, ip },
        )
      ).response.status,
      200,
    );
  }
  const limited = await request(
    "/email-otp/request-email-change",
    { newEmail: "replacement4@example.com" },
    { cookie, ip },
  );
  assert.equal(limited.response.status, 429);
  assert.equal(messages.length, 4);
});

test("D1 rate limits persist across auth instances", async () => {
  const ip = "198.51.100.10";
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.equal(
      (
        await request(
          "/registration/send-code",
          {
            email: `rate${attempt}@example.com`,
            name: "测试",
            turnstileToken: `valid-rate-${attempt}`,
          },
          { ip },
        )
      ).response.status,
      200,
    );
  }
  assert.equal(
    (
      await request(
        "/registration/send-code",
        {
          email,
          name: "测试",
          turnstileToken: "valid-blocked",
        },
        { ip },
      )
    ).response.status,
    429,
  );
  assert.equal(
    challenges.length,
    3,
    "rate limiting runs before external verification",
  );
});

test("cross-origin requests to every registration step are rejected", async () => {
  for (const [path, body] of [
    [
      "/registration/send-code",
      { email, name: "测试", turnstileToken: "valid-origin" },
    ],
    ["/registration/verify-email", { email, name: "测试", otp: "123456" }],
    ["/registration/complete", { email, password, token: "x".repeat(48) }],
  ]) {
    assert.equal(
      (await request(path, body, { origin: "https://untrusted.example" }))
        .response.status,
      403,
    );
  }
  assert.equal(challenges.length, 0);
  assert.equal(messages.length, 0);
  await noAccount();
});

test("invalid registration details do not trigger external calls", async () => {
  for (const patch of [
    { name: "   " },
    { name: "x".repeat(51) },
    { email: "invalid" },
  ]) {
    assert.equal((await sendCode(email, patch)).response.status, 400);
  }
  assert.equal(challenges.length, 0);
  assert.equal(messages.length, 0);
});

test("configuration fails closed and redirects stay inside the app", () => {
  assert.equal(isAuthConfigured(env), true);
  for (const patch of [
    { BETTER_AUTH_SECRET: "short" },
    { BETTER_AUTH_URL: "http://example.com" },
    { BETTER_AUTH_URL: "https://example.com/path" },
    { AUTH_EMAIL_FROM: "" },
    { RESEND_API_KEY: "" },
    { RESEND_API_KEY: "   " },
    { RESEND_API_KEY: undefined },
    { TURNSTILE_SITE_KEY: "" },
    { TURNSTILE_SECRET_KEY: "" },
  ])
    assert.equal(isAuthConfigured({ ...env, ...patch }), false);
  for (const path of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\nevil.example",
    "/api/auth/sign-out",
    "/account/login",
  ]) {
    assert.equal(safeRedirect(path), "/settings");
  }
  assert.equal(safeRedirect("/history?view=recent"), "/history?view=recent");
});
