import { betterAuth, type BetterAuthOptions } from "better-auth";
import { emailOTP } from "better-auth/plugins/email-otp";

import { sendAuthEmail } from "./email.server";
import {
  OTP_EXPIRES_IN,
  OTP_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "./shared";

export type AuthEnvironment = Pick<
  Env,
  | "AUTH_DB"
  | "RESEND_API_KEY"
  | "AUTH_EMAIL_FROM"
  | "BETTER_AUTH_SECRET"
  | "BETTER_AUTH_URL"
>;
type AuthOptions = BetterAuthOptions & {
  plugins: [ReturnType<typeof emailOTP>];
};
type AuthInstance = ReturnType<typeof betterAuth<AuthOptions>>;

export function isAuthConfigured(env: AuthEnvironment) {
  if (
    !env.AUTH_DB ||
    !env.RESEND_API_KEY?.trim() ||
    !env.AUTH_EMAIL_FROM?.trim() ||
    (env.BETTER_AUTH_SECRET?.length ?? 0) < 32
  )
    return false;
  try {
    const url = new URL(env.BETTER_AUTH_URL);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return (
      (url.protocol === "https:" || (local && url.protocol === "http:")) &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

// Create inside the request: D1 and background work belong to that request's context.
export function createAuth(
  env: AuthEnvironment,
  ctx?: Pick<ExecutionContext, "waitUntil">,
): AuthInstance {
  if (!isAuthConfigured(env))
    throw new Error("Authentication configuration is incomplete");

  return betterAuth<AuthOptions>({
    appName: "云占",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: env.AUTH_DB,
    trustedOrigins: [new URL(env.BETTER_AUTH_URL).origin],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      ...(ctx
        ? {
            backgroundTasks: {
              handler: (promise: Promise<unknown>) => {
                ctx.waitUntil(
                  promise.catch(() => {
                    console.error(
                      JSON.stringify({ event: "auth_background_task_failed" }),
                    );
                  }),
                );
              },
            },
          }
        : {}),
    },
    plugins: [
      emailOTP({
        otpLength: OTP_LENGTH,
        expiresIn: OTP_EXPIRES_IN,
        allowedAttempts: 3,
        storeOTP: "hashed",
        disableSignUp: true,
        overrideDefaultEmailVerification: true,
        sendVerificationOTP: (message) => sendAuthEmail(env, message),
      }),
    ],
  });
}

export async function getAccountState(
  request: Request,
  env: AuthEnvironment,
  ctx: ExecutionContext,
  responseHeaders: Headers,
) {
  const available = isAuthConfigured(env);
  if (!available || !request.headers.has("cookie"))
    return { user: null, available };
  try {
    const { response: session, headers } = await createAuth(
      env,
      ctx,
    ).api.getSession({
      headers: request.headers,
      returnHeaders: true,
    });
    // Session renewal and expired-cookie removal must reach the browser during SSR.
    for (const cookie of headers.getSetCookie())
      responseHeaders.append("Set-Cookie", cookie);
    // Session tokens and account credentials never enter loader data.
    const user = session?.user;
    return {
      available,
      user: user
        ? {
            id: user.id,
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified,
          }
        : null,
    };
  } catch {
    console.error(JSON.stringify({ event: "auth_session_lookup_failed" }));
    return { user: null, available: false };
  }
}
