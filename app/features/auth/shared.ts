export const OTP_LENGTH = 6;
export const OTP_EXPIRES_IN = 300;
export const OTP_RESEND_SECONDS = 60;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export type AccountMode =
  "login" | "register" | "verify-email" | "forgot-password";

export function isAccountMode(value: string | undefined): value is AccountMode {
  return ["login", "register", "verify-email", "forgot-password"].includes(
    value ?? "",
  );
}

// Only allow local page paths, including when a URL parser normalizes backslashes.
export function safeRedirect(value: string | null | undefined) {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  ) {
    return "/settings";
  }
  const url = new URL(value, "https://local.invalid");
  if (
    url.origin !== "https://local.invalid" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/account/")
  ) {
    return "/settings";
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function accountHref(
  mode: AccountMode,
  options: { email?: string; redirectTo?: string } = {},
) {
  const search = new URLSearchParams();
  if (options.email) search.set("email", options.email);
  if (options.redirectTo)
    search.set("redirectTo", safeRedirect(options.redirectTo));
  const query = search.toString();
  return `/account/${mode}${query ? `?${query}` : ""}`;
}

const errorMessages: Record<string, string> = {
  INVALID_EMAIL: "请输入有效的邮箱地址。",
  INVALID_EMAIL_OR_PASSWORD: "邮箱或密码不正确，请重新输入。",
  EMAIL_NOT_VERIFIED: "请先验证邮箱，再使用密码登录。",
  USER_ALREADY_EXISTS: "此邮箱已注册，请直接登录或找回密码。",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "此邮箱已注册，请直接登录或找回密码。",
  USER_NOT_FOUND: "无法完成验证，请检查邮箱和验证码。",
  INVALID_OTP: "验证码不正确，请重新输入。",
  OTP_EXPIRED: "验证码已过期，请重新获取。",
  TOO_MANY_ATTEMPTS: "尝试次数过多，请重新获取验证码。",
  PASSWORD_TOO_SHORT: "密码至少需要 8 个字符。",
  PASSWORD_TOO_LONG: "密码不能超过 128 个字符。",
  AUTH_UNAVAILABLE: "账户服务暂时不可用，请稍后重试。",
};

export function authErrorMessage(
  error: { code?: string; status?: number } | null | undefined,
) {
  if (error?.status === 429) return "操作太频繁，请稍后再试。";
  return errorMessages[error?.code ?? ""] ?? "操作未完成，请稍后重试。";
}
