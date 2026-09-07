import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

// Exercise the production bundle inside workerd, without a dev/preview server.
test("production Worker serves account dialog links and persists profile changes", async () => {
  const sentEmail = Promise.withResolvers();
  const emailChange = Promise.withResolvers();
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
        if (
          request.url ===
          "https://challenges.cloudflare.com/turnstile/v0/siteverify"
        ) {
          const body = new URLSearchParams(await request.text());
          assert.equal(body.get("secret"), "worker-test-turnstile-secret");
          return Response.json({
            success: body.get("response") === "valid-worker-challenge",
            action: "register_email",
            hostname: "example.com",
          });
        }
        assert.equal(request.url, "https://api.resend.com/emails");
        const delivery = {
          url: request.url,
          method: request.method,
          authorization: request.headers.get("authorization"),
          body: await request.json(),
        };
        sentEmail.resolve(delivery);
        if (delivery.body.subject === "云占 · 修改邮箱验证码") {
          emailChange.resolve(delivery);
        }
        return Response.json({ id: "worker-test-email" });
      },
      bindings: {
        BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
        BETTER_AUTH_URL: "https://example.com",
        RESEND_API_KEY: "re_worker_test_placeholder",
        AUTH_EMAIL_FROM: "noreply@example.com",
        TURNSTILE_SITE_KEY: "worker-test-sitekey",
        TURNSTILE_SECRET_KEY: "worker-test-turnstile-secret",
      },
    }),
  );

  try {
    const db = await runtime.getD1Database("AUTH_DB");
    const sql = (await Promise.all(["0001_auth.sql", "0002_user_data.sql"].map((name) =>
      readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"),
    ))).join("\n");
    const statements = sql
      .replace(/^--.*$/gm, "")
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    await db.batch(statements.map((statement) => db.prepare(statement)));

    for (const [path, title] of [
      ["/settings", "账户"],
      ["/settings?auth=login", "账户"],
      ["/settings?auth=register", "账户"],
      ["/settings?auth=forgot-password", "账户"],
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
      assert.ok(html.includes("worker-test-sitekey"));
      assert.ok(!html.includes("worker-test-turnstile-secret"));
    }

    for (const mode of ["login", "register", "forgot-password"]) {
      const response = await runtime.dispatchFetch(
        `https://example.com/account/${mode}?email=legacy%40example.com&redirectTo=%2Fhistory`,
        { redirect: "manual" },
      );
      assert.equal(response.status, 302);
      const location = new URL(
        response.headers.get("location"),
        "https://example.com",
      );
      assert.equal(location.pathname, "/settings");
      assert.equal(location.searchParams.get("auth"), mode);
      assert.equal(location.searchParams.get("email"), "legacy@example.com");
      assert.equal(location.searchParams.get("redirectTo"), "/history");
    }

    const email = "worker-test@example.com";
    const password = "worker-test-password-1234";
    const post = (path, body, cookie) =>
      runtime.dispatchFetch(`https://example.com/api/auth${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
          "CF-Connecting-IP": "192.0.2.9",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify(body),
      });
    const blockedSend = await post("/registration/send-code", {
      email,
      name: "Worker 测试",
      turnstileToken: "invalid-challenge",
    });
    assert.equal(blockedSend.status, 403);
    const registration = await post("/registration/send-code", {
      email,
      name: "Worker 测试",
      turnstileToken: "valid-worker-challenge",
    });
    assert.equal(registration.status, 200, await registration.text());
    assert.equal(registration.headers.getSetCookie().length, 0);
    assert.equal(
      (await db.prepare('SELECT COUNT(*) AS count FROM "user"').first()).count,
      0,
    );
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
    const blockedOtpSend = await post("/email-otp/send-verification-otp", {
      email,
      type: "sign-in",
    });
    assert.equal(blockedOtpSend.status, 404);
    const otp = delivery.body.text.match(/验证码：(\d{6})/u)?.[1];
    assert.ok(otp, "verification email must contain a usable code");
    const blockedLogin = await post("/sign-in/email-otp", { email, otp });
    assert.equal(blockedLogin.status, 404);
    assert.equal(blockedLogin.headers.getSetCookie().length, 0);
    const verification = await post("/registration/verify-email", {
      email,
      otp,
      name: "Worker 测试",
    });
    assert.equal(verification.status, 200, await verification.clone().text());
    assert.equal(verification.headers.getSetCookie().length, 0);
    const { token } = await verification.json();
    assert.equal(
      (await db.prepare('SELECT COUNT(*) AS count FROM "user"').first()).count,
      0,
    );
    assert.equal(
      (await post("/sign-in/email", { email, password })).status,
      401,
    );
    const completed = await post("/registration/complete", {
      email,
      password,
      token,
    });
    assert.equal(completed.status, 200, await completed.text());
    assert.ok(completed.headers.getSetCookie().length > 0);
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
    const historyHeaders = { Cookie: cookie, "X-Account-Id": sessionData.user.id };
    const initialHistory = await runtime.dispatchFetch("https://example.com/api/history", { headers: historyHeaders });
    assert.equal(initialHistory.status, 200);
    assert.deepEqual((await initialHistory.json()).entries, []);
    const preferences = { id: "preferences", theme: "dark", createdAt: 1788265845, updatedAt: 1788265845 };
    const savedPreferences = await runtime.dispatchFetch("https://example.com/api/history", {
      method: "POST",
      headers: { ...historyHeaders, Origin: "https://example.com", "Content-Type": "application/json" },
      body: JSON.stringify({ changes: [{ id: "preferences", mutationId: "worker-test-mutation", baseRevision: null, kind: "upsert", record: preferences }] }),
    });
    assert.equal(savedPreferences.status, 200, await savedPreferences.clone().text());
    assert.match(savedPreferences.headers.get("cache-control"), /no-store/);
    const history = await runtime.dispatchFetch("https://example.com/api/history", { headers: historyHeaders });
    assert.deepEqual((await history.json()).entries[0].record, preferences);
    assert.equal((await runtime.dispatchFetch("https://example.com/api/history")).status, 401);
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
    assert.ok(html.includes("编辑信息"));
    assert.ok(html.includes("更改邮箱"));
    assert.ok(html.includes("重置密码"));
    assert.ok(!html.includes('href="/account/forgot-password'));
    assert.ok(
      !html.includes(sessionData.session.token),
      "SSR must not serialize the session token",
    );

    const update = await post(
      "/update-user",
      { name: "  更新后的名字  " },
      cookie,
    );
    assert.equal(update.status, 200, await update.text());
    const renamed = await runtime.dispatchFetch(
      "https://example.com/settings",
      {
        headers: { Cookie: cookie },
      },
    );
    assert.ok((await renamed.text()).includes("更新后的名字"));

    const newEmail = "worker-new@example.com";
    const changeRequest = await post(
      "/email-otp/request-email-change",
      { newEmail },
      cookie,
    );
    assert.equal(changeRequest.status, 200, await changeRequest.text());
    const changeDelivery = await Promise.race([
      emailChange.promise,
      delay(5_000, undefined, { ref: false }).then(() => {
        assert.fail("Worker did not send the email change verification code");
      }),
    ]);
    assert.deepEqual(changeDelivery.body.to, [newEmail]);
    const changeCode = changeDelivery.body.text.match(/验证码：(\d{6})/u)?.[1];
    assert.ok(changeCode);
    const pendingSettings = await runtime.dispatchFetch(
      "https://example.com/settings",
      {
        headers: { Cookie: cookie },
      },
    );
    assert.ok((await pendingSettings.text()).includes(email));
    const changed = await post(
      "/email-otp/change-email",
      { newEmail, otp: changeCode },
      cookie,
    );
    assert.equal(changed.status, 200, await changed.text());
    const updatedSettings = await runtime.dispatchFetch(
      "https://example.com/settings",
      {
        headers: { Cookie: cookie },
      },
    );
    const updatedHtml = await updatedSettings.text();
    assert.equal(updatedSettings.status, 200);
    assert.ok(updatedHtml.includes(newEmail));
    assert.ok(updatedHtml.includes("更新后的名字"));
    assert.ok(!updatedHtml.includes(email));
    assert.equal(
      (await post("/sign-in/email", { email, password })).status,
      401,
    );
    assert.equal(
      (await post("/sign-in/email", { email: newEmail, password })).status,
      200,
    );
  } finally {
    await runtime.dispose();
  }
});
