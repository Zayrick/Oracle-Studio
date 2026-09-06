import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRevalidator } from "react-router";
import { MailIcon } from "lucide-react";

import { AuthNotice } from "@/components/account/auth-notice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/features/auth/auth-client";
import {
  authErrorMessage,
  OTP_LENGTH,
  OTP_RESEND_SECONDS,
} from "@/features/auth/shared";
import type { useAccount } from "@/features/auth/use-account";

type ProfileUser = NonNullable<ReturnType<typeof useAccount>["user"]>;
type Operation = "send-code" | "email";
type AuthResult = { error?: { code?: string; status?: number } | null };

export function AccountEmailEditor({
  user,
  disabled = false,
}: {
  user: ProfileUser;
  disabled?: boolean;
}) {
  const revalidator = useRevalidator();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(user.email);
  const [otp, setOtp] = useState("");
  const [requestedEmail, setRequestedEmail] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [pending, setPending] = useState<Operation | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const locked = useRef(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const otpInput = useRef<HTMLInputElement>(null);

  const normalizedEmail = email.trim().toLowerCase();
  const emailChanged = normalizedEmail !== user.email.toLowerCase();
  const codeRequested =
    Boolean(requestedEmail) && requestedEmail === normalizedEmail;
  const busy = pending !== null;

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setTimeout(
      () => setRemaining((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [remaining]);

  useEffect(() => {
    if (requestedEmail) otpInput.current?.focus();
  }, [requestedEmail]);

  function changeOpen(nextOpen: boolean) {
    if (locked.current) return;
    if (nextOpen) {
      setEmail(user.email);
      setOtp("");
      setRequestedEmail("");
      setError("");
      setNotice("");
    }
    setOpen(nextOpen);
  }

  async function run(operation: Operation, action: () => Promise<void>) {
    if (locked.current || disabled) return;
    locked.current = true;
    setPending(operation);
    setError("");
    setNotice("");
    try {
      await action();
    } catch {
      setError("网络连接失败，请检查网络后重试。");
    } finally {
      locked.current = false;
      setPending(null);
    }
  }

  function succeeded(result: AuthResult) {
    if (!result.error) return true;
    setError(authErrorMessage(result.error));
    return false;
  }

  async function sendCode() {
    if (remaining > 0 || !emailChanged || !emailInput.current?.reportValidity())
      return;
    await run("send-code", async () => {
      if (
        !succeeded(
          await authClient.emailOtp.requestEmailChange({
            newEmail: normalizedEmail,
          }),
        )
      )
        return;
      setEmail(normalizedEmail);
      setOtp("");
      setRequestedEmail(normalizedEmail);
      setRemaining(OTP_RESEND_SECONDS);
      // Better Auth intentionally returns the same response for an occupied email.
      setNotice("验证码已申请。若未收到，请确认邮箱未被占用。");
    });
  }

  async function saveEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!emailChanged || !codeRequested) return;
    await run("email", async () => {
      if (
        !succeeded(
          await authClient.emailOtp.changeEmail({
            newEmail: normalizedEmail,
            otp,
          }),
        )
      )
        return;
      setOtp("");
      setRequestedEmail("");
      await revalidator.revalidate();
      setNotice("邮箱已更新，请使用新邮箱登录。");
    });
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button variant="outline" disabled={disabled} />}>
        <MailIcon data-icon="inline-start" />
        更改邮箱
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        showCloseButton={!busy}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>更改邮箱</DialogTitle>
        </DialogHeader>
        {error ? <AuthNotice error>{error}</AuthNotice> : null}
        {notice ? <AuthNotice>{notice}</AuthNotice> : null}
        <form
          onSubmit={(event) => void saveEmail(event)}
          aria-busy={pending === "email" || pending === "send-code"}
        >
          <fieldset className="min-w-0" disabled={busy || disabled}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="profile-email">新邮箱</FieldLabel>
                <Input
                  ref={emailInput}
                  id="profile-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  maxLength={254}
                  value={email}
                  aria-describedby="profile-email-description"
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setOtp("");
                    setRequestedEmail("");
                    setError("");
                    setNotice("");
                  }}
                />
                <FieldDescription id="profile-email-description">
                  验证新邮箱后生效。
                </FieldDescription>
              </Field>
              {emailChanged ? (
                <Field>
                  <FieldLabel htmlFor="profile-otp">新邮箱验证码</FieldLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      ref={otpInput}
                      id="profile-otp"
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
                      aria-describedby="profile-otp-description"
                      onChange={(event) => {
                        setOtp(
                          event.target.value
                            .replace(/\D/g, "")
                            .slice(0, OTP_LENGTH),
                        );
                        setError("");
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || disabled || remaining > 0}
                      onClick={() => void sendCode()}
                    >
                      {pending === "send-code" ? (
                        <Spinner
                          data-icon="inline-start"
                          aria-label="正在发送验证码"
                        />
                      ) : null}
                      {remaining > 0 ? `${remaining} 秒后重发` : "获取验证码"}
                    </Button>
                  </div>
                  <FieldDescription id="profile-otp-description">
                    验证码 5 分钟内有效。
                  </FieldDescription>
                </Field>
              ) : null}
              <Button
                type="submit"
                className="w-fit"
                disabled={
                  busy ||
                  disabled ||
                  !emailChanged ||
                  !codeRequested ||
                  otp.length !== OTP_LENGTH
                }
              >
                {pending === "email" ? (
                  <Spinner data-icon="inline-start" aria-label="正在修改邮箱" />
                ) : null}
                验证并修改邮箱
              </Button>
            </FieldGroup>
          </fieldset>
        </form>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={busy} />}>
            关闭
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
