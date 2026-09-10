import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

import { migrateTestDatabase } from "./helpers/migrations.mjs";
import { aiTestEnvironment, openRouterMock } from "./helpers/openrouter.mjs";

// Exercise the production bundle inside workerd, without a dev/preview server.
test("production Worker serves account dialog links and persists profile changes", async () => {
  const aiEnv = aiTestEnvironment();
  const openrouter = openRouterMock(aiEnv);
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
        const aiResponse = await openrouter.fetch(request);
        if (aiResponse) return aiResponse;
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
        ...aiEnv,
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
    await migrateTestDatabase(db);

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
    openrouter.createOverride = () => new Response(null, { status: 503 });
    const unavailable = await post("/registration/complete", { email, password, token });
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.getSetCookie().length, 0);
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM "user"').first()).count, 0);
    openrouter.createOverride = null;
    const completed = await post("/registration/complete", {
      email,
      password,
      token,
    });
    assert.equal(completed.status, 200, JSON.stringify({ response: await completed.text(), createdKeys: openrouter.created.length, deletedKeys: openrouter.deleted.length }));
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
    assert.equal(openrouter.created.length, 1, "registration binds a key and login reuses it");
    const credential = await db.prepare("SELECT * FROM user_ai_credentials").first();
    assert.equal(credential.user_id, sessionData.user.id);
    assert.equal(credential.key_hash, openrouter.created[0].hash);
    assert.ok(!JSON.stringify(credential).includes(openrouter.created[0].key));
    assert.ok(!JSON.stringify(sessionData).includes(openrouter.created[0].key));
    for (const feature of ["bazi", "liuyao"]) {
      const aiUrl = `https://example.com/api/${feature}/ai`;
      const aiPayload = {
        systemPrompt: "测试排盘", sessionId: "worker-chat", messages: [{ role: "user", content: "请解读" }],
        chart: { name: "测试", gender: "male", solarText: "2000-01-01", dayMaster: "甲", tymeEightChar: "测试",
          pillars: Array.from({ length: 4 }, () => ({ label: "年", name: "甲子", stem: "甲", branch: "子", hiddenStems: [], shenSha: [] })),
          auxiliaryPillars: [], fortune: { currentYear: 2026, context: {}, periods: [], dayuns: [] } },
      };
      const options = { method: "POST", headers: { Origin: "https://example.com", "Content-Type": "application/json" }, body: JSON.stringify(aiPayload) };
      assert.equal((await runtime.dispatchFetch(aiUrl, options)).status, 401);
      const ai = await runtime.dispatchFetch(aiUrl, { ...options, headers: { ...options.headers, Cookie: cookie, "X-Account-Id": sessionData.user.id } });
      assert.equal(ai.status, 200);
      const output = await ai.text();
      assert.ok(output.includes("测试解读"));
      assert.ok(!output.includes("sk-or-"));
      assert.equal(openrouter.completions.at(-1).body.model, `@preset/${feature}`);
      assert.equal(openrouter.completions.at(-1).body.user, sessionData.user.id);
    }
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
