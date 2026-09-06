import { useRef, useState, type FormEvent } from "react";
import { useRevalidator } from "react-router";
import { PencilIcon } from "lucide-react";

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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/features/auth/auth-client";
import { authErrorMessage } from "@/features/auth/shared";
import type { useAccount } from "@/features/auth/use-account";

type ProfileUser = NonNullable<ReturnType<typeof useAccount>["user"]>;
type AuthResult = { error?: { code?: string; status?: number } | null };

export function AccountProfileEditor({
  user,
  disabled = false,
}: {
  user: ProfileUser;
  disabled?: boolean;
}) {
  const revalidator = useRevalidator();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const locked = useRef(false);

  const normalizedName = name.trim();
  function changeOpen(nextOpen: boolean) {
    if (locked.current) return;
    if (nextOpen) {
      setName(user.name);
      setError("");
      setNotice("");
    }
    setOpen(nextOpen);
  }

  async function run(action: () => Promise<void>) {
    if (locked.current || disabled) return;
    locked.current = true;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await action();
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

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!normalizedName || normalizedName === user.name) return;
    await run(async () => {
      if (!succeeded(await authClient.updateUser({ name: normalizedName })))
        return;
      setName(normalizedName);
      await revalidator.revalidate();
      setNotice("名字已更新。");
    });
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button variant="outline" disabled={disabled} />}>
        <PencilIcon data-icon="inline-start" />
        编辑信息
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        showCloseButton={!pending}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>编辑信息</DialogTitle>
        </DialogHeader>
        {error ? <AuthNotice error>{error}</AuthNotice> : null}
        {notice ? <AuthNotice>{notice}</AuthNotice> : null}
        <form onSubmit={(event) => void saveName(event)} aria-busy={pending}>
          <fieldset className="min-w-0" disabled={pending || disabled}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="profile-name">名字</FieldLabel>
                <Input
                  id="profile-name"
                  name="name"
                  autoComplete="nickname"
                  required
                  maxLength={50}
                  pattern=".*\S.*"
                  title="请输入名字，不能只包含空格"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError("");
                    setNotice("");
                  }}
                />
              </Field>
              <Button
                type="submit"
                className="w-fit"
                disabled={
                  pending ||
                  disabled ||
                  !normalizedName ||
                  normalizedName === user.name
                }
              >
                {pending ? (
                  <Spinner data-icon="inline-start" aria-label="正在保存名字" />
                ) : null}
                保存名字
              </Button>
            </FieldGroup>
          </fieldset>
        </form>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>
            关闭
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
