import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

// Exercise the production bundle inside workerd, without a dev/preview server.
test("production Worker renders account pages and persists a real login session", async () => {
  const sentEmail = Promise.withResolvers();
  const chunks = (await readdir("build/server/assets")).filter((file) =>
    file.endsWith(".js"),
  );
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      name: "auth-worker-tests",
      modules: ["index.js", ...chunks.map((file) => `assets/${file}`)].map(
        (file) => ({
          type: "ESModule",
          path: resolve("build/server", file),
        }),
      ),
      compatibilityDate: "2026-08-14",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: ["AUTH_DB"],
      // Intercept every outbound request; the production bundle cannot send real mail.
      outboundService: async (request) => {
        sentEmail.resolve({
          url: request.url,
          method: request.method,
          authorization: request.headers.get("authorization"),
          body: await request.json(),
        });
        return Response.json({ id: "worker-test-email" });
      },
      bindings: {
        BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
        BETTER_AUTH_URL: "https://example.com",
        RESEND_API_KEY: "re_worker_test_placeholder",
        AUTH_EMAIL_FROM: "noreply@example.com",
      },
    }),
  );

  try {
    const db = await runtime.getD1Database("AUTH_DB");
    const sql = await readFile(
      new URL("../migrations/0001_auth.sql", import.meta.url),
      "utf8",
    );
    const statements = sql
      .replace(/^--.*$/gm, "")
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    await db.batch(statements.map((statement) => db.prepare(statement)));

    for (const [path, title] of [
      ["/account/login", "登陆帐户"],
      ["/account/register", "创建账户"],
      ["/account/verify-email", "验证邮箱"],
      ["/account/forgot-password", "找回密码"],
      ["/settings", "账户"],
    ]) {
      const response = await runtime.dispatchFetch(
        `https://example.com${path}`,
      );
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get("cache-control"), /no-store/);
      const html = await response.text();
      assert.ok(html.includes(title), path);
      assert.ok(!html.includes("账户服务暂时不可用"), path);
      assert.ok(!html.includes("验证码登录"), path);
      if (path === "/account/login") {
        assert.ok(html.includes('name="password"'));
        assert.ok(html.includes("忘记密码？"));
        assert.ok(!html.includes('name="otp"'));
        assert.ok(!html.includes('role="tablist"'));
      }
      if (["/account/verify-email", "/account/forgot-password"].includes(path)) {
        assert.ok(html.includes('name="otp"'), path);
      }
    }

    const email = "worker-test@example.com";
    const password = "worker-test-password-1234";
    const post = (path, body) =>
      runtime.dispatchFetch(`https://example.com/api/auth${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
          "CF-Connecting-IP": "192.0.2.9",
        },
        body: JSON.stringify(body),
      });
    const registration = await post("/sign-up/email", {
      email,
      password,
      name: "Worker 测试",
    });
    assert.equal(registration.status, 200, await registration.text());
    const delivery = await Promise.race([
      sentEmail.promise,
      delay(5_000, undefined, { ref: false }).then(() => {
        assert.fail(
          "Worker did not send the verification email through Resend",
        );
      }),
    ]);
    assert.equal(delivery.url, "https://api.resend.com/emails");
    assert.equal(delivery.method, "POST");
    assert.equal(delivery.authorization, "Bearer re_worker_test_placeholder");
    assert.equal(delivery.body.from, "云占 <noreply@example.com>");
    assert.deepEqual(delivery.body.to, [email]);
    const blockedSend = await post("/email-otp/send-verification-otp", {
      email,
      type: "sign-in",
    });
    assert.equal(blockedSend.status, 400);
    assert.equal((await blockedSend.json()).code, "OTP_TYPE_NOT_ALLOWED");
    const otp = delivery.body.text.match(/验证码：(\d{6})/u)?.[1];
    assert.ok(otp, "verification email must contain a usable code");
    const blockedLogin = await post("/sign-in/email-otp", { email, otp });
    assert.equal(blockedLogin.status, 404);
    assert.equal(blockedLogin.headers.getSetCookie().length, 0);
    const verification = await post("/email-otp/verify-email", { email, otp });
    assert.equal(verification.status, 200, await verification.text());
    const login = await post("/sign-in/email", { email, password });
    assert.equal(login.status, 200, await login.clone().text());
    assert.match(login.headers.get("cache-control"), /no-store/);
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const session = await runtime.dispatchFetch(
      "https://example.com/api/auth/get-session",
      { headers: { Cookie: cookie } },
    );
    const sessionData = await session.json();
    assert.equal(sessionData.user.email, email);
    await db
      .prepare('UPDATE "session" SET "expiresAt" = ?')
      .bind(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString())
      .run();
    const settings = await runtime.dispatchFetch(
      "https://example.com/settings",
      { headers: { Cookie: cookie } },
    );
    const html = await settings.text();
    assert.equal(settings.status, 200);
    assert.ok(
      settings.headers
        .getSetCookie()
        .some((value) => value.includes("session_token=")),
      "SSR must forward the renewed session cookie",
    );
    assert.ok(html.includes(email));
    assert.ok(html.includes("退出登录"));
    assert.ok(
      !html.includes(sessionData.session.token),
      "SSR must not serialize the session token",
    );
  } finally {
    await runtime.dispose();
  }
});
