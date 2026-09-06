import { useState } from "react";
import { LogOutIcon, CircleUserRoundIcon } from "lucide-react";

import { AuthNotice } from "@/components/account/auth-notice";
import { AccountProfileEditor } from "@/components/account/account-profile-editor";
import { AccountEmailEditor } from "@/components/account/account-email-editor";
import { AuthDialogTrigger } from "@/components/account/auth-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/features/auth/auth-client";
import { authErrorMessage } from "@/features/auth/shared";
import { useAccount } from "@/features/auth/use-account";

export function AccountSettings() {
  const { user, available } = useAccount();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) setError(authErrorMessage(result.error));
      else window.location.assign("/settings");
    } catch {
      setError("退出失败，请检查网络后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader className="items-center">
        <CardTitle>
          <h2>账户</h2>
        </CardTitle>
        {!user ? (
          <CardAction className="row-span-1 flex items-center gap-2 self-center">
            <AuthDialogTrigger mode="login">登录</AuthDialogTrigger>
            <AuthDialogTrigger mode="register" variant="outline">
              创建账户
            </AuthDialogTrigger>
          </CardAction>
        ) : null}
      </CardHeader>
      {user || error || !available ? (
        <CardContent className="flex flex-col gap-4">
          {error ? <AuthNotice error>{error}</AuthNotice> : null}
          {!available ? (
            <AuthNotice>账户服务暂时不可用，请稍后重试。</AuthNotice>
          ) : null}
          {user ? (
            <div className="flex items-center gap-3">
              <CircleUserRoundIcon
                className="size-10 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="truncate font-medium">{user.name}</p>
                <p className="break-all text-sm text-muted-foreground">
                  {user.email}
                </p>
              </div>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => void signOut()}
              >
                {pending ? (
                  <Spinner data-icon="inline-start" aria-label="正在退出" />
                ) : (
                  <LogOutIcon data-icon="inline-start" />
                )}
                退出登录
              </Button>
            </div>
          ) : null}
        </CardContent>
      ) : null}
      {user ? (
        <CardFooter className="flex-wrap gap-2">
          <AccountProfileEditor
            key={user.id}
            user={user}
            disabled={pending || !available}
          />
          <AccountEmailEditor
            key={`email:${user.id}`}
            user={user}
            disabled={pending || !available}
          />
          <AuthDialogTrigger
            mode="forgot-password"
            email={user.email}
            variant="outline"
            disabled={pending || !available}
          >
            重置密码
          </AuthDialogTrigger>
        </CardFooter>
      ) : null}
    </Card>
  );
}
