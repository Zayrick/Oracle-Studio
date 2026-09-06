import { APIError } from "better-auth/api";

import { REGISTRATION_TURNSTILE_ACTION } from "./shared";

type TurnstileEnvironment = Pick<
  Env,
  "TURNSTILE_SITE_KEY" | "TURNSTILE_SECRET_KEY" | "BETTER_AUTH_URL"
>;

export async function verifyRegistrationTurnstile(
  env: TurnstileEnvironment,
  token: string,
  headers?: Headers,
) {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret || !token || token.length > 2048) {
    throw new APIError("FORBIDDEN", {
      code: "TURNSTILE_FAILED",
      message: "请重新完成安全验证。",
    });
  }

  try {
    const body = new URLSearchParams({ secret, response: token });
    const ip = headers?.get("cf-connecting-ip");
    if (ip) body.set("remoteip", ip);
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body, signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) throw new Error("Siteverify unavailable");
    const result: { success?: boolean; action?: string; hostname?: string } =
      await response.json();

    // Official dummy keys return fixed test metadata. Real keys must match this app.
    const testing =
      ["1x00000000000000000000AA", "1x00000000000000000000BB"].includes(
        env.TURNSTILE_SITE_KEY,
      ) && secret === "1x0000000000000000000000000000000AA";
    if (
      result.success !== true ||
      (!testing &&
        (result.action !== REGISTRATION_TURNSTILE_ACTION ||
          result.hostname !== new URL(env.BETTER_AUTH_URL).hostname))
    )
      throw new Error("Invalid challenge");
  } catch {
    throw new APIError("FORBIDDEN", {
      code: "TURNSTILE_FAILED",
      message: "安全验证未通过，请重试。",
    });
  }
}
