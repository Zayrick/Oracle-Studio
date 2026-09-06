import assert from "node:assert/strict";
import { test } from "node:test";

import { sendAuthEmail } from "../app/features/auth/email.server.ts";

const env = {
  RESEND_API_KEY: "re_email_test_placeholder",
  AUTH_EMAIL_FROM: "noreply@example.com",
};
const message = {
  email: "account@example.com",
  otp: "123456",
  type: "email-verification",
};
const deliveryError = { message: "Authentication email delivery failed" };

test("Resend receives authenticated requests with Chinese text and HTML for each email purpose", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const request = new Request(input, init);
    requests.push({ request, body: await request.json() });
    return Response.json({ id: "test-email" });
  });

  for (const [type, purpose] of [
    ["email-verification", "验证邮箱"],
    ["forget-password", "重置密码"],
  ]) {
    await sendAuthEmail(env, { ...message, type });
    const { request, body } = requests.at(-1);
    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.method, "POST");
    assert.equal(
      request.headers.get("authorization"),
      `Bearer ${env.RESEND_API_KEY}`,
    );
    assert.equal(request.headers.get("content-type"), "application/json");
    assert.equal(request.redirect, "manual");
    assert.equal(body.from, "云占 <noreply@example.com>");
    assert.deepEqual(body.to, [message.email]);
    assert.equal(body.subject, `云占 · ${purpose}验证码`);
    assert.ok(body.text.includes(purpose));
    assert.ok(body.text.includes(message.otp));
    assert.ok(body.text.includes("5 分钟"));
    assert.ok(body.html.includes(message.otp));
    assert.ok(body.html.includes("5 分钟"));
    assert.ok(!JSON.stringify(body).includes(env.RESEND_API_KEY));
  }
  assert.equal(requests.length, 2);
});

test("Resend redirects, authentication, quota, and service errors fail without exposing response details", async (t) => {
  let status;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { message: `${message.email} ${message.otp} ${env.RESEND_API_KEY}` },
      { status },
    ),
  );
  for (status of [301, 302, 307, 401, 403, 429, 500, 503]) {
    await assert.rejects(sendAuthEmail(env, message), deliveryError);
  }
});

test("network failures and timeouts produce the same redacted delivery error", async (t) => {
  let failure;
  t.mock.method(globalThis, "fetch", async () => {
    throw failure;
  });
  for (failure of [
    new Error(
      `Network failure for ${message.email} with ${env.RESEND_API_KEY}`,
    ),
    new DOMException("Request timed out", "TimeoutError"),
  ]) {
    await assert.rejects(sendAuthEmail(env, message), deliveryError);
  }
});

test("invalid authentication codes never reach Resend", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ id: "unexpected" }),
  );
  await assert.rejects(sendAuthEmail(env, { ...message, otp: "<script>" }), {
    message: "Invalid authentication code format",
  });
  assert.equal(fetch.mock.callCount(), 0);
});
