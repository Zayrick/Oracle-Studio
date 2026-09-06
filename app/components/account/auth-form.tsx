import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeftIcon, MailIcon } from "lucide-react";
import { Link, useNavigate, useRevalidator } from "react-router";

import { PageShell } from "@/components/page-shell";
import { AuthNotice } from "@/components/account/auth-notice";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/features/auth/auth-client";
import {
  accountHref,
  authErrorMessage,
  OTP_LENGTH,
  OTP_RESEND_SECONDS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type AccountMode,
} from "@/features/auth/shared";
import { useAccount } from "@/features/auth/use-account";
import { cn } from "@/lib/utils";

const copy = {
  login: { title: "登陆帐户" },
  register: { title: "创建账户" },
  "verify-email": {
    title: "验证邮箱",
    description: "输入邮件中的 6 位验证码，完成账户注册。",
  },
  "forgot-password": {
    title: "找回密码",
    description: "通过邮箱验证码，设置新的账户密码。",
  },
};

type AuthResult = { error?: { code?: string; status?: number } | null };

export function AuthForm({
  mode,
  initialEmail,
  redirectTo,
  verificationSent,
}: {
  mode: AccountMode;
  initialEmail: string;
  redirectTo: string;
  verificationSent: boolean;
}) {
  const isAccountEntry = mode === "login" || mode === "register";
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const { available } = useAccount();
  const [email, setEmail] = useState(initialEmail);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    verificationSent ? "验证码已发送，请检查收件箱或垃圾邮件。" : "",
  );
  const [pending, setPending] = useState(false);
  const [remaining, setRemaining] = useState(
    verificationSent ? OTP_RESEND_SECONDS : 0,
  );
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const locked = useRef(false);
  const emailInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setTimeout(
      () => setRemaining((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [remaining]);

  const normalizedEmail = email.trim().toLowerCase();
  const href = (next: AccountMode) =>
    accountHref(next, { email: normalizedEmail, redirectTo });

  async function run(operation: () => Promise<void>) {
    if (locked.current || !available) return;
    locked.current = true;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch {
      setError("网络连接失败，请检查网络后重试。");
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  function succeeded(result: AuthResult) {
    if (!result.error) return true;
    setError(authErrorMessage(result.error));
    return false;
  }

  function finishSignIn() {
    // A document navigation refreshes all server session data from the HttpOnly cookie.
    window.location.assign(redirectTo);
  }

  async function sendCode() {
    if (mode !== "verify-email" && mode !== "forgot-password") return;
    if (remaining > 0 || !emailInput.current?.reportValidity()) return;
    await run(async () => {
      const result =
        mode === "forgot-password"
          ? await authClient.emailOtp.requestPasswordReset({
              email: normalizedEmail,
            })
          : await authClient.emailOtp.sendVerificationOtp({
              email: normalizedEmail,
              type: "email-verification",
            });
      if (succeeded(result)) {
        setOtp("");
        setRemaining(OTP_RESEND_SECONDS);
        setNotice(
          "如果该邮箱符合验证条件，验证码将发送至收件箱，请同时检查垃圾邮件。验证码 5 分钟内有效。",
        );
      }
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const needsConfirmation = mode === "register" || mode === "forgot-password";
    if (needsConfirmation && password !== confirmPassword) {
      setPasswordMismatch(true);
      return;
    }
    setPasswordMismatch(false);
    await run(async () => {
      if (mode === "register") {
        const result = await authClient.signUp.email({
          email: normalizedEmail,
          password,
          name: name.trim(),
        });
        if (succeeded(result)) {
          setPassword("");
          setConfirmPassword("");
          await navigate(href("verify-email"), {
            state: { verificationSent: true },
          });
        }
      } else if (mode === "verify-email") {
        if (
          succeeded(
            await authClient.emailOtp.verifyEmail({
              email: normalizedEmail,
              otp,
            }),
          )
        )
          finishSignIn();
      } else if (mode === "forgot-password") {
        if (
          succeeded(
            await authClient.emailOtp.resetPassword({
              email: normalizedEmail,
              otp,
              password,
            }),
          )
        ) {
          setPassword("");
          setConfirmPassword("");
          setOtp("");
          await revalidator.revalidate();
          await navigate(href("login"), {
            replace: true,
            state: { passwordReset: true },
          });
        }
      } else {
        const result = await authClient.signIn.email({
          email: normalizedEmail,
          password,
        });
        if (result.error?.code === "EMAIL_NOT_VERIFIED") {
          setPassword("");
          await navigate(href("verify-email"));
        } else if (succeeded(result)) {
          finishSignIn();
        }
      }
    });
  }

  const passwordField = (newPassword: boolean) => (
    <Field>
      <FieldLabel htmlFor="account-password">
        {newPassword && mode === "forgot-password" ? "新密码" : "密码"}
      </FieldLabel>
      <Input
        id="account-password"
        name="password"
        type="password"
        autoComplete={newPassword ? "new-password" : "current-password"}
        required
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
          setPasswordMismatch(false);
        }}
      />
      {newPassword ? (
        <FieldDescription>
          使用 8–128 个字符，建议组合字母、数字和符号。
        </FieldDescription>
      ) : null}
    </Field>
  );

  const confirmationField = (
    <Field data-invalid={passwordMismatch || undefined}>
      <FieldLabel htmlFor="account-confirm-password">确认密码</FieldLabel>
      <Input
        id="account-confirm-password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
        value={confirmPassword}
        aria-invalid={passwordMismatch || undefined}
        aria-describedby={passwordMismatch ? "password-error" : undefined}
        onChange={(event) => {
          setConfirmPassword(event.target.value);
          setPasswordMismatch(false);
        }}
      />
      {passwordMismatch ? (
        <FieldError id="password-error">两次输入的密码不一致。</FieldError>
      ) : null}
    </Field>
  );

  const codeField = (
    <Field>
      <FieldLabel htmlFor="account-otp">邮箱验证码</FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id="account-otp"
          name="otp"
          className="min-w-0 flex-1"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          title="请输入 6 位数字验证码"
          required
          minLength={OTP_LENGTH}
          maxLength={OTP_LENGTH}
          value={otp}
          onChange={(event) =>
            setOtp(event.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))
          }
        />
        <Button
          type="button"
          variant="outline"
          disabled={pending || !available || remaining > 0}
          onClick={() => void sendCode()}
        >
          {remaining > 0 ? `${remaining} 秒后重发` : "获取验证码"}
        </Button>
      </div>
      <FieldDescription>
        验证码 5 分钟内有效。重新获取后请使用最新验证码。
      </FieldDescription>
    </Field>
  );

  function submitButton(label: string) {
    return (
      <Button type="submit" className="w-full" disabled={pending || !available}>
        {pending ? (
          <Spinner data-icon="inline-start" aria-label="正在处理" />
        ) : null}
        {label}
      </Button>
    );
  }

  return (
    <PageShell className="px-4 pb-12">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <Button
          className="w-fit"
          variant="ghost"
          nativeButton={false}
          render={<Link to="/settings" />}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          返回设置
        </Button>
        <Card>
          <CardHeader className={cn(isAccountEntry && "text-center")}>
            {!isAccountEntry ? (
              <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <MailIcon className="size-5" aria-hidden="true" />
              </div>
            ) : null}
            <CardTitle>
              <h1>{copy[mode].title}</h1>
            </CardTitle>
            {!isAccountEntry ? (
              <CardDescription>{copy[mode].description}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {!available ? (
              <AuthNotice error>账户服务暂时不可用，请稍后重试。</AuthNotice>
            ) : null}
            {error ? <AuthNotice error>{error}</AuthNotice> : null}
            {notice ? <AuthNotice>{notice}</AuthNotice> : null}
            <form onSubmit={(event) => void submit(event)} aria-busy={pending}>
              <fieldset className="min-w-0" disabled={pending || !available}>
                <FieldGroup>
                  {mode === "register" ? (
                    <Field>
                      <FieldLabel htmlFor="account-name">昵称</FieldLabel>
                      <Input
                        id="account-name"
                        name="name"
                        autoComplete="nickname"
                        required
                        maxLength={50}
                        value={name}
                        pattern=".*\S.*"
                        title="请输入昵称"
                        onChange={(event) => setName(event.target.value)}
                      />
                    </Field>
                  ) : null}
                  <Field>
                    <FieldLabel htmlFor="account-email">邮箱</FieldLabel>
                    <Input
                      ref={emailInput}
                      id="account-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      maxLength={254}
                      placeholder="you@example.com"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setOtp("");
                        setNotice("");
                        setError("");
                      }}
                    />
                  </Field>
                  {mode === "login" ? (
                    <>
                      {passwordField(false)}
                      {submitButton("登录")}
                    </>
                  ) : null}
                  {mode === "register" ? (
                    <>
                      {passwordField(true)}
                      {confirmationField}
                      {submitButton("注册")}
                    </>
                  ) : null}
                  {mode === "verify-email" ? (
                    <>
                      {codeField}
                      {submitButton("完成注册")}
                    </>
                  ) : null}
                  {mode === "forgot-password" ? (
                    <>
                      {codeField}
                      {passwordField(true)}
                      {confirmationField}
                      {submitButton("重置密码")}
                    </>
                  ) : null}
                </FieldGroup>
              </fieldset>
            </form>
          </CardContent>
          <CardFooter className="justify-between gap-2">
            {mode === "login" ? (
              <>
                <Button
                  variant="link"
                  nativeButton={false}
                  render={<Link to={href("forgot-password")} />}
                >
                  忘记密码？
                </Button>
                <Button
                  variant="link"
                  nativeButton={false}
                  render={<Link to={href("register")} />}
                >
                  还没有账户？创建账户
                </Button>
              </>
            ) : (
              <Button
                className="mx-auto"
                variant="link"
                nativeButton={false}
                render={<Link to={href("login")} />}
              >
                已有账户？返回登录
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </PageShell>
  );
}
