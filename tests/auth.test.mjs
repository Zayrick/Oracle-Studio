import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, mock, test } from "node:test";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { getMigrations } from "better-auth/db/migration";

import {
  createAuth,
  isAuthConfigured,
} from "../app/features/auth/auth.server.ts";
import { safeRedirect } from "../app/features/auth/shared.ts";

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
let requestNumber = 0;

before(async () => {
  env = {
    AUTH_DB: await runtime.getD1Database("AUTH_DB"),
    RESEND_API_KEY: "re_auth_test_placeholder",
    AUTH_EMAIL_FROM: "noreply@example.com",
    BETTER_AUTH_URL: "https://example.com",
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  };
  const sql = await readFile(
    new URL("../migrations/0001_auth.sql", import.meta.url),
    "utf8",
  );
  const statements = sql
    .replace(/^--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  await env.AUTH_DB.batch(
    statements.map((statement) => env.AUTH_DB.prepare(statement)),
  );
  mock.method(globalThis, "fetch", async (input, init) => {
    const request = new Request(input, init);
    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.method, "POST");
    assert.equal(
      request.headers.get("authorization"),
      `Bearer ${env.RESEND_API_KEY}`,
    );
    messages.push(await request.json());
    return Response.json({ id: "test-email" });
  });
});

beforeEach(async () => {
  while (background.length) await Promise.all(background.splice(0));
  await env.AUTH_DB.batch(
    ["session", "account", "verification", "rateLimit", "user"].map((table) =>
      env.AUTH_DB.prepare(`DELETE FROM "${table}"`),
    ),
  );
  messages.length = 0;
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

async function register() {
  const result = await request("/sign-up/email", {
    name: "测试账户",
    email,
    password,
  });
  assert.equal(result.response.status, 200);
  return result;
}

async function verifiedAccount() {
  await register();
  const result = await request("/email-otp/verify-email", {
    email,
    otp: latestCode(),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.user.emailVerified, true);
  return cookieFrom(result.response);
}

test("committed migration matches the configured Better Auth schema", async () => {
  const migration = await getMigrations(createAuth(env).options);
  assert.deepEqual(migration.toBeCreated, []);
  assert.deepEqual(migration.toBeAdded, []);
  assert.deepEqual(migration.toBeAddedIndexes, []);
  assert.deepEqual(migration.schemaProblems, []);
});

test("registration requires verification, hashes credentials, and issues a secure session", async () => {
  const registration = await register();
  assert.equal(registration.data.user.emailVerified, false);
  assert.equal(registration.data.token, null);
  assert.equal(messages.length, 1);
  const stored = await env.AUTH_DB.prepare(
    'SELECT password FROM "account"',
  ).first();
  assert.ok(stored.password);
  assert.notEqual(stored.password, password);
  const verification = await env.AUTH_DB.prepare(
    'SELECT value FROM "verification"',
  ).first();
  assert.ok(!verification.value.includes(latestCode()));

  const rejected = await request("/sign-in/email", { email, password });
  assert.equal(rejected.response.status, 403);
  assert.equal(rejected.data.code, "EMAIL_NOT_VERIFIED");
  assert.equal(messages.length, 1, "password login must not send a code");
  const otp = latestCode();
  const verified = await request("/email-otp/verify-email", { email, otp });
  assert.equal(verified.response.status, 200);
  const cookies = verified.response.headers.getSetCookie().join("; ");
  assert.match(cookies, /HttpOnly/i);
  assert.match(cookies, /Secure/i);
  assert.match(cookies, /SameSite=Lax/i);
  const cookie = cookieFrom(verified.response);
  const session = await request("/get-session", undefined, { cookie });
  assert.equal(session.data.user.email, email);
  assert.equal(session.data.user.emailVerified, true);
  assert.equal(
    (await request("/email-otp/verify-email", { email, otp })).response.status,
    400,
  );

  const login = await request("/sign-in/email", { email, password });
  assert.equal(login.response.status, 200);
  assert.equal(messages.length, 1, "password login must not send a code");
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

test("OTP login is disabled even for previously issued codes and never sends login mail", async () => {
  await verifiedAccount();
  for (const address of [email, "unknown@example.com"]) {
    const sent = await request("/email-otp/send-verification-otp", {
      email: address,
      type: "sign-in",
    });
    assert.equal(sent.response.status, 400);
    assert.equal(sent.data.code, "OTP_TYPE_NOT_ALLOWED");
  }
  assert.equal(messages.length, 1);
  assert.equal(
    (await env.AUTH_DB.prepare('SELECT COUNT(*) AS count FROM "verification"').first())
      .count,
    0,
  );

  // Simulate an unexpired code issued before passwordless login was removed.
  const otp = await createAuth(env).api.createVerificationOTP({
    body: { email, type: "sign-in" },
  });
  for (const path of ["/sign-in/email-otp", "/sign-in/email-otp/"]) {
    const result = await request(path, { email, otp });
    assert.equal(result.response.status, 404);
    assert.equal(cookieFrom(result.response), "");
  }
  assert.equal(
    (await env.AUTH_DB.prepare('SELECT COUNT(*) AS count FROM "session"').first())
      .count,
    1,
  );
  assert.equal(
    (await env.AUTH_DB.prepare('SELECT COUNT(*) AS count FROM "user"').first())
      .count,
    1,
  );
});

test("verified accounts cannot request registration mail or use verification as passwordless login", async () => {
  await verifiedAccount();
  const sent = await request("/email-otp/send-verification-otp", {
    email: email.toUpperCase(),
    type: "email-verification",
  });
  const unknown = await request("/email-otp/send-verification-otp", {
    email: "unknown@example.com",
    type: "email-verification",
  });
  assert.equal(sent.response.status, 200);
  assert.deepEqual(sent.data, unknown.data);
  assert.equal(messages.length, 1);
  assert.equal(
    (await env.AUTH_DB.prepare('SELECT COUNT(*) AS count FROM "verification"').first())
      .count,
    0,
  );

  // Previously issued registration codes must not create sessions for verified users.
  const otp = await createAuth(env).api.createVerificationOTP({
    body: { email, type: "email-verification" },
  });
  const result = await request("/email-otp/verify-email", { email, otp });
  assert.equal(result.response.status, 400);
  assert.equal(result.data.code, "EMAIL_ALREADY_VERIFIED");
  assert.equal(cookieFrom(result.response), "");
  assert.equal(
    (await env.AUTH_DB.prepare('SELECT COUNT(*) AS count FROM "session"').first())
      .count,
    1,
  );
});

test("registration verification consumes the code atomically", async () => {
  await register();
  const otp = latestCode();
  const results = await Promise.all([
    request("/email-otp/verify-email", { email, otp }),
    request("/email-otp/verify-email", { email, otp }),
  ]);
  assert.deepEqual(
    results.map((result) => result.response.status).sort(),
    [200, 400],
  );
  const loggedIn = results.find((result) => result.response.status === 200);
  assert.equal(loggedIn.data.user.emailVerified, true);
  assert.equal(
    (
      await request("/get-session", undefined, {
        cookie: cookieFrom(loggedIn.response),
      })
    ).data.user.email,
    email,
  );
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

test("unknown email requests use generic responses, do not send mail or auto-register", async () => {
  const unknown = "unknown@example.com";
  const sent = await request("/email-otp/send-verification-otp", {
    email: unknown,
    type: "email-verification",
  });
  assert.equal(sent.response.status, 200);
  const reset = await request("/email-otp/request-password-reset", {
    email: unknown,
  });
  assert.equal(reset.response.status, 200);
  assert.equal(messages.length, 0);
  assert.equal(
    (await env.AUTH_DB.prepare('SELECT COUNT(*) AS count FROM "user"').first())
      .count,
    0,
  );
  await verifiedAccount();
  const known = await request("/email-otp/request-password-reset", { email });
  assert.deepEqual(reset.data, known.data);
});

test("expired codes and codes that exceed the attempt limit cannot complete registration", async () => {
  await register();
  const expiredCode = latestCode();
  await env.AUTH_DB.prepare('UPDATE "verification" SET "expiresAt" = ?')
    .bind(new Date(Date.now() - 60_000).toISOString())
    .run();
  assert.equal(
    (await request("/email-otp/verify-email", { email, otp: expiredCode })).response
      .status,
    400,
  );

  await request("/email-otp/send-verification-otp", {
    email,
    type: "email-verification",
  });
  const otp = latestCode();
  const wrong = otp === "000000" ? "111111" : "000000";
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.equal(
      (await request("/email-otp/verify-email", { email, otp: wrong })).response
        .status,
      400,
    );
  }
  assert.equal(
    (await request("/email-otp/verify-email", { email, otp })).response.status,
    403,
  );
});

test("resending registration mail replaces the previous code", async () => {
  await register();
  const previous = latestCode();
  await request("/email-otp/send-verification-otp", {
    email,
    type: "email-verification",
  });
  const current = latestCode();
  // A fresh random code can coincidentally match; do not make the test probabilistic.
  if (previous !== current)
    assert.equal(
      (await request("/email-otp/verify-email", { email, otp: previous })).response
        .status,
      400,
    );
  assert.equal(
    (await request("/email-otp/verify-email", { email, otp: current })).response
      .status,
    200,
  );
});

test("D1 rate limits persist across auth instances", async () => {
  const ip = "198.51.100.10";
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await request(
      "/email-otp/request-password-reset",
      { email },
      { ip },
    );
    assert.equal(result.response.status, 200);
  }
  assert.equal(
    (await request("/email-otp/request-password-reset", { email }, { ip }))
      .response.status,
    429,
  );
});

test("cross-origin auth requests are rejected", async () => {
  const result = await request(
    "/sign-up/email",
    { name: "测试", email, password },
    { origin: "https://untrusted.example" },
  );
  assert.equal(result.response.status, 403);
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
