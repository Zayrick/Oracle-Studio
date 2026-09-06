import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowLeftIcon, MailIcon } from "lucide-react";
import { Link, useNavigate, useRevalidator } from "react-router";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { PageShell } from "@/components/page-shell";
import { AuthNotice } from "@/components/account/auth-notice";
import { RegistrationTurnstile } from "@/components/account/registration-turnstile";
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
import { Dialog, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { authClient } from "@/features/auth/auth-client";
import { registrationClient } from "@/features/auth/registration-client";
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
  turnstileSiteKey,
}: {
  mode: AccountMode;
  initialEmail: string;
  redirectTo: string;
  turnstileSiteKey: string;
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
  const [pending, setPending] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [registrationToken, setRegistrationToken] = useState("");
  const [challengeRequested, setChallengeRequested] = useState(false);
  const challengeRequest = useRef<((token: string | null) => void) | null>(
    null,
  );
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const locked = useRef(false);
  const card = useRef<HTMLDivElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const isPasswordStep = mode === "register" && Boolean(registrationToken);

  useEffect(() => () => challengeRequest.current?.(null), []);

  const receiveTurnstileToken = useCallback((token: string) => {
    if (!token || !challengeRequest.current) return;
    challengeRequest.current(token);
    challengeRequest.current = null;
    setChallengeRequested(false);
  }, []);

  const failTurnstile = useCallback(() => {
    challengeRequest.current?.(null);
    challengeRequest.current = null;
    setChallengeRequested(false);
    setError(authErrorMessage({ code: "TURNSTILE_FAILED" }));
  }, []);

  function requestTurnstile() {
    return new Promise<string | null>((resolve) => {
      challengeRequest.current = resolve;
      setChallengeRequested(true);
    });
  }

  function cancelTurnstile() {
    challengeRequest.current?.(null);
    challengeRequest.current = null;
    setChallengeRequested(false);
  }

  useEffect(() => {
    if (isPasswordStep) passwordInput.current?.focus();
  }, [isPasswordStep]);

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
    if (mode !== "register" && mode !== "forgot-password") return;
    if (remaining > 0 || !emailInput.current?.reportValidity()) return;
    if (mode === "register" && !nameInput.current?.reportValidity()) return;
    await run(async () => {
      const turnstileToken =
        mode === "register" ? await requestTurnstile() : "";
      if (mode === "register" && !turnstileToken) return;
      const result =
        mode === "forgot-password"
          ? await authClient.emailOtp.requestPasswordReset({
              email: normalizedEmail,
            })
          : await registrationClient.sendCode({
              email: normalizedEmail,
              name: name.trim(),
              turnstileToken: turnstileToken ?? "",
            });
      if (succeeded(result)) {
        setOtp("");
        setRemaining(OTP_RESEND_SECONDS);
      }
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const needsConfirmation = isPasswordStep || mode === "forgot-password";
    if (needsConfirmation && password !== confirmPassword) {
      setPasswordMismatch(true);
      return;
    }
    setPasswordMismatch(false);
    await run(async () => {
      if (mode === "register") {
        if (!isPasswordStep) {
          const result = await registrationClient.verifyEmail({
            email: normalizedEmail,
            name: name.trim(),
            otp,
          });
          if (succeeded(result) && result.data) {
            setRegistrationToken(result.data.token);
            setOtp("");
          }
        } else {
          const result = await registrationClient.complete({
            email: normalizedEmail,
            token: registrationToken,
            password,
          });
          if (result.error?.code === "REGISTRATION_EXPIRED") {
            restartRegistration();
            setError(authErrorMessage(result.error));
          } else if (succeeded(result)) {
            finishSignIn();
          }
        }
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
        if (succeeded(result)) {
          finishSignIn();
        }
      }
    });
  }

  function restartRegistration() {
    setRegistrationToken("");
    setPassword("");
    setConfirmPassword("");
    setPasswordMismatch(false);
    setOtp("");
    setError("");
  }

  const passwordField = (newPassword: boolean) => (
    <Field>
      <FieldLabel htmlFor="account-password">
        {newPassword && mode === "forgot-password" ? "新密码" : "密码"}
      </FieldLabel>
      <Input
        ref={passwordInput}
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
          {challengeRequested
            ? "安全验证中…"
            : remaining > 0
              ? `${remaining} 秒后重发`
              : "获取验证码"}
        </Button>
      </div>
      <FieldDescription>
        验证码 5 分钟内有效。如未收到，请检查垃圾邮箱。
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
        <Card ref={card} className="relative isolate">
          <CardHeader className={cn(isAccountEntry && "text-center")}>
            {!isAccountEntry ? (
              <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <MailIcon className="size-5" aria-hidden="true" />
              </div>
            ) : null}
            <CardTitle>
              <h1>{isPasswordStep ? "设置密码" : copy[mode].title}</h1>
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
            <form onSubmit={(event) => void submit(event)} aria-busy={pending}>
              <fieldset className="min-w-0" disabled={pending || !available}>
                <FieldGroup>
                  {mode === "register" && !isPasswordStep ? (
                    <Field>
                      <FieldLabel htmlFor="account-name">昵称</FieldLabel>
                      <Input
                        ref={nameInput}
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
                      readOnly={isPasswordStep}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setOtp("");
                        setError("");
                        if (mode === "register") setRemaining(0);
                      }}
                    />
                  </Field>
                  {mode === "login" ? (
                    <>
                      {passwordField(false)}
                      {submitButton("登录")}
                    </>
                  ) : null}
                  {mode === "register" && !isPasswordStep ? (
                    <>
                      {codeField}
                      {submitButton("下一步")}
                    </>
                  ) : null}
                  {isPasswordStep ? (
                    <>
                      {passwordField(true)}
                      {confirmationField}
                      {submitButton("完成注册")}
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={restartRegistration}
                      >
                        返回修改邮箱
                      </Button>
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
          {!isPasswordStep ? (
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
          ) : null}
          <Dialog
            open={challengeRequested}
            onOpenChange={(open) => {
              if (!open) cancelTurnstile();
            }}
          >
            <DialogPortal container={card} className="absolute inset-0">
              <DialogPrimitive.Backdrop className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
              <DialogPrimitive.Popup
                className="absolute top-1/2 left-1/2 w-[300px] max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 outline-none"
                aria-describedby={undefined}
              >
                <DialogTitle className="sr-only">安全验证</DialogTitle>
                {challengeRequested ? (
                  <RegistrationTurnstile
                    siteKey={turnstileSiteKey}
                    onTokenChange={receiveTurnstileToken}
                    onError={failTurnstile}
                  />
                ) : null}
              </DialogPrimitive.Popup>
            </DialogPortal>
          </Dialog>
        </Card>
      </div>
    </PageShell>
  );
}
