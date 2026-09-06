import type { BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { z } from "zod";

// Better Auth owns the session and mutations; validate profile input before it runs.
export const validateProfileUpdate: NonNullable<
  NonNullable<BetterAuthOptions["hooks"]>["before"]
> = createAuthMiddleware(async (ctx) => {
  const path = ctx.path.replace(/\/+$/, "");
  if (path === "/update-user" && ctx.body?.name !== undefined) {
    const name = z.string().trim().min(1).max(50).safeParse(ctx.body.name);
    if (!name.success) {
      throw new APIError("BAD_REQUEST", {
        code: "INVALID_NAME",
        message: "名字需要 1–50 个字符。",
      });
    }
    return { context: { ...ctx, body: { ...ctx.body, name: name.data } } };
  }

  if (
    path === "/email-otp/request-email-change" ||
    path === "/email-otp/change-email"
  ) {
    const email = z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .email()
      .safeParse(ctx.body?.newEmail);
    if (!email.success) {
      throw new APIError("BAD_REQUEST", {
        code: "INVALID_EMAIL",
        message: "请输入有效的邮箱地址。",
      });
    }
    return { context: { ...ctx, body: { ...ctx.body, newEmail: email.data } } };
  }
});
