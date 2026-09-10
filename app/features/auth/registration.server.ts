import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  formCsrfMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import {
  constantTimeEqual,
  generateRandomString,
  makeSignature,
} from "better-auth/crypto";
import { z } from "zod";

import {
  createAICredential,
  discardUnboundAICredential,
  insertAICredential,
  type AICredential,
} from "@/features/ai/credentials.server";

import type { AuthEnvironment } from "./auth.server";
import { sendAuthEmail } from "./email.server";
import {
  OTP_EXPIRES_IN,
  OTP_LENGTH,
  OTP_RESEND_SECONDS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  REGISTRATION_EXPIRES_IN,
} from "./shared";
import { verifyRegistrationTurnstile } from "./turnstile.server";

const emailSchema = z.string().trim().toLowerCase().max(254).email();
const nameSchema = z.string().trim().min(1).max(50);
const detailsSchema = z.object({ email: emailSchema, name: nameSchema });
const MAX_ATTEMPTS = 3;
const COMPLETION_LEASE_MS = 120_000;

type PendingRegistration = {
  id: string;
  email: string;
  name: string;
  otpHash: string;
  otpExpiresAt: number;
  attempts: number;
  resendAfter: number;
  tokenHash: string | null;
  tokenExpiresAt: number | null;
};

const invalidCode = () =>
  new APIError("BAD_REQUEST", {
    code: "INVALID_OTP",
    message: "验证码无效或已过期，请重新获取。",
  });
const expiredRegistration = () =>
  new APIError("BAD_REQUEST", {
    code: "REGISTRATION_EXPIRED",
    message: "注册验证已失效，请重新验证邮箱。",
  });

export function registration(env: AuthEnvironment) {
  const db = env.AUTH_DB;
  // Keyed hashes prevent offline enumeration of the six-digit OTP space.
  const otpHash = (email: string, otp: string) =>
    makeSignature(`registration-otp:${email}:${otp}`, env.BETTER_AUTH_SECRET);
  const tokenHash = (token: string) =>
    makeSignature(`registration-token:${token}`, env.BETTER_AUTH_SECRET);

  return {
    id: "registration",
    schema: {
      pendingRegistration: {
        fields: {
          email: { type: "string", required: true, unique: true },
          name: { type: "string", required: true },
          otpHash: { type: "string", required: true },
          otpExpiresAt: { type: "number", required: true },
          attempts: { type: "number", required: true },
          resendAfter: { type: "number", required: true },
          tokenHash: { type: "string", required: false },
          tokenExpiresAt: { type: "number", required: false },
          completionId: { type: "string", required: false },
          completionExpiresAt: { type: "number", required: false },
        },
      },
    },
    endpoints: {
      sendRegistrationCode: createAuthEndpoint(
        "/registration/send-code",
        {
          method: "POST",
          use: [formCsrfMiddleware],
          body: detailsSchema.extend({ turnstileToken: z.string().max(2048) }),
        },
        async (ctx) => {
          const { email, name, turnstileToken } = ctx.body;
          await verifyRegistrationTurnstile(
            env,
            turnstileToken,
            ctx.request?.headers,
          );
          const now = Date.now();
          await db
            .prepare(
              `DELETE FROM "pendingRegistration"
          WHERE MAX("otpExpiresAt", COALESCE("tokenExpiresAt", 0), COALESCE("completionExpiresAt", 0)) <= ?`,
            )
            .bind(now)
            .run();
          if (await ctx.context.internalAdapter.findUserByEmail(email)) {
            return ctx.json({ success: true });
          }
          const id = crypto.randomUUID();
          const otp = generateRandomString(OTP_LENGTH, "0-9");
          const hash = await otpHash(email, otp);
          // The conditional upsert also enforces the resend delay across different IPs.
          const saved = await db
            .prepare(
              `INSERT INTO "pendingRegistration"
          ("id", "email", "name", "otpHash", "otpExpiresAt", "attempts", "resendAfter")
          VALUES (?, ?, ?, ?, ?, 0, ?)
          ON CONFLICT ("email") DO UPDATE SET
            "id" = excluded."id", "name" = excluded."name", "otpHash" = excluded."otpHash",
            "otpExpiresAt" = excluded."otpExpiresAt", "attempts" = 0,
            "resendAfter" = excluded."resendAfter", "tokenHash" = NULL, "tokenExpiresAt" = NULL,
            "completionId" = NULL, "completionExpiresAt" = NULL
          WHERE "pendingRegistration"."resendAfter" <= ?
            AND COALESCE("pendingRegistration"."completionExpiresAt", 0) <= ? RETURNING "id"`,
            )
            .bind(
              id,
              email,
              name,
              hash,
              now + OTP_EXPIRES_IN * 1000,
              now + OTP_RESEND_SECONDS * 1000,
              now,
              now,
            )
            .first();
          if (!saved)
            throw new APIError("TOO_MANY_REQUESTS", {
              code: "TOO_MANY_REQUESTS",
              message: "请稍后再获取验证码。",
            });
          try {
            await sendAuthEmail(env, {
              email,
              otp,
              type: "email-verification",
            });
          } catch {
            await db
              .prepare('DELETE FROM "pendingRegistration" WHERE "id" = ?')
              .bind(id)
              .run();
            throw new APIError("SERVICE_UNAVAILABLE", {
              code: "EMAIL_DELIVERY_FAILED",
              message: "验证码发送失败，请稍后重试。",
            });
          }
          return ctx.json({ success: true });
        },
      ),
      verifyRegistrationEmail: createAuthEndpoint(
        "/registration/verify-email",
        {
          method: "POST",
          use: [formCsrfMiddleware],
          body: detailsSchema.extend({ otp: z.string().regex(/^\d{6}$/) }),
        },
        async (ctx) => {
          const { email, name, otp } = ctx.body;
          const now = Date.now();
          // Increment in SQL so concurrent wrong guesses cannot evade the attempt limit.
          const pending = await db
            .prepare(
              `UPDATE "pendingRegistration" SET "attempts" = "attempts" + 1
          WHERE "email" = ? AND "tokenHash" IS NULL AND "otpExpiresAt" > ? AND "attempts" < ?
          RETURNING *`,
            )
            .bind(email, now, MAX_ATTEMPTS)
            .first<PendingRegistration>();
          if (
            !pending ||
            !constantTimeEqual(pending.otpHash, await otpHash(email, otp))
          )
            throw invalidCode();
          const token = generateRandomString(48);
          const expiresAt = now + REGISTRATION_EXPIRES_IN * 1000;
          const verified = await db
            .prepare(
              `UPDATE "pendingRegistration"
          SET "name" = ?, "tokenHash" = ?, "tokenExpiresAt" = ?
          WHERE "id" = ? AND "tokenHash" IS NULL AND "otpExpiresAt" > ? RETURNING "id"`,
            )
            .bind(
              name,
              await tokenHash(token),
              expiresAt,
              pending.id,
              Date.now(),
            )
            .first();
          if (!verified) throw invalidCode();
          // No user, credential, or login session exists at this point.
          return ctx.json({ token, expiresAt });
        },
      ),
      completeRegistration: createAuthEndpoint(
        "/registration/complete",
        {
          method: "POST",
          use: [formCsrfMiddleware],
          body: z.object({
            email: emailSchema,
            token: z.string().length(48),
            password: z
              .string()
              .min(PASSWORD_MIN_LENGTH)
              .max(PASSWORD_MAX_LENGTH),
          }),
        },
        async (ctx) => {
          const { email, token, password } = ctx.body;
          const proof = await tokenHash(token);
          const pending = await db
            .prepare(
              `SELECT "id" FROM "pendingRegistration"
          WHERE "email" = ? AND "tokenHash" = ? AND "tokenExpiresAt" > ?`,
            )
            .bind(email, proof, Date.now())
            .first();
          if (!pending) throw expiredRegistration();
          const hash = await ctx.context.password.hash(password);
          const userId = crypto.randomUUID();
          const claimed = await db
            .prepare(
              `
            UPDATE "pendingRegistration" SET "completionId" = ?, "completionExpiresAt" = ?
            WHERE "email" = ? AND "tokenHash" = ? AND "tokenExpiresAt" > ?
              AND COALESCE("completionExpiresAt", 0) <= ? RETURNING "id"
          `,
            )
            .bind(
              userId,
              Date.now() + COMPLETION_LEASE_MS,
              email,
              proof,
              Date.now(),
              Date.now(),
            )
            .first();
          if (!claimed) {
            throw new APIError("CONFLICT", {
              code: "REGISTRATION_IN_PROGRESS",
              message: "注册正在处理中，请稍后重试。",
            });
          }
          const date = new Date().toISOString();
          let credential: AICredential | undefined;
          try {
            try {
              credential = await createAICredential(env, userId);
            } catch {
              throw new APIError("SERVICE_UNAVAILABLE", {
                code: "AI_SETUP_FAILED",
                message: "账户初始化暂时失败，请稍后重试。",
              });
            }
            // Bind the key in the same transaction as the user, password and proof consumption.
            const result = await db.batch([
              db
                .prepare(
                  `INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
            SELECT ?, "name", "email", 1, ?, ? FROM "pendingRegistration"
            WHERE "email" = ? AND "tokenHash" = ? AND "tokenExpiresAt" > ?
              AND "completionId" = ?`,
                )
                .bind(userId, date, date, email, proof, Date.now(), userId),
              db
                .prepare(
                  `INSERT INTO "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
            SELECT ?, "id", 'credential', "id", ?, ?, ? FROM "user" WHERE "id" = ?`,
                )
                .bind(crypto.randomUUID(), hash, date, date, userId),
              insertAICredential(db, userId, credential),
              db
                .prepare(
                  `DELETE FROM "pendingRegistration" WHERE "email" = ? AND "tokenHash" = ?
            AND EXISTS (SELECT 1 FROM "user" WHERE "id" = ?)`,
                )
                .bind(email, proof, userId),
            ]);
            if (!result[0].meta.changes) throw expiredRegistration();
          } catch (error) {
            if (credential)
              await discardUnboundAICredential(env, userId, credential.keyHash);
            throw error;
          } finally {
            await db
              .prepare(
                `
              UPDATE "pendingRegistration" SET "completionId" = NULL, "completionExpiresAt" = NULL
              WHERE "email" = ? AND "completionId" = ?
            `,
              )
              .bind(email, userId)
              .run()
              .catch(() => {
                console.error(
                  JSON.stringify({
                    event: "registration_claim_release_failed",
                    userId,
                  }),
                );
              });
          }
          try {
            const user = await ctx.context.internalAdapter.findUserById(userId);
            const session =
              await ctx.context.internalAdapter.createSession(userId);
            if (!user || !session) throw new Error("Session creation failed");
            await setSessionCookie(ctx, { user, session });
          } catch {
            console.error(
              JSON.stringify({ event: "registration_login_failed", userId }),
            );
            throw new APIError("INTERNAL_SERVER_ERROR", {
              code: "REGISTRATION_LOGIN_FAILED",
              message: "账户已创建，请前往登录。",
            });
          }
          return ctx.json({ success: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
