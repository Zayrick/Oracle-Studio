import { OTP_EXPIRES_IN } from "./shared";

type VerificationEmail = {
  email: string;
  otp: string;
  type: "email-verification" | "forget-password" | "change-email";
};

const purposes = {
  "email-verification": "验证邮箱",
  "forget-password": "重置密码",
  "change-email": "修改邮箱",
} satisfies Record<VerificationEmail["type"], string>;

export async function sendAuthEmail(
  env: Pick<Env, "RESEND_API_KEY" | "AUTH_EMAIL_FROM">,
  message: VerificationEmail,
) {
  const purpose = purposes[message.type];
  // OTPs are generated on the server, never from user-supplied HTML.
  if (!/^\d{6}$/.test(message.otp))
    throw new Error("Invalid authentication code format");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY.trim()}`,
        "Content-Type": "application/json",
      },
      // Workers supports manual/follow; reject redirects via the status check below.
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        from: `云占 <${env.AUTH_EMAIL_FROM.trim()}>`,
        to: [message.email],
        subject: `云占 · ${purpose}验证码`,
        text: `你正在${purpose}。验证码：${message.otp}。${OTP_EXPIRES_IN / 60} 分钟内有效，请勿向任何人透露。如果不是你本人操作，请忽略此邮件。`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:32px auto;line-height:1.8"><h1 style="font-size:24px">云占</h1><p>你正在${purpose}，请在页面中输入以下验证码：</p><p style="font-size:32px;font-weight:600;letter-spacing:8px">${message.otp}</p><p>验证码 ${OTP_EXPIRES_IN / 60} 分钟内有效，请勿向任何人透露。</p><p>如果不是你本人操作，请忽略此邮件。</p></div>`,
      }),
    });
    // Release the connection without reading or logging provider response details.
    await response.body?.cancel();
    if (!response.ok) throw new Error("Email provider rejected the request");
  } catch {
    // The library logs background errors. Strip provider details containing PII.
    throw new Error("Authentication email delivery failed");
  }
}
