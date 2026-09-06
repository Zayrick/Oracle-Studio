import { useState } from "react";
import { Link } from "react-router";
import { LogOutIcon, CircleUserRoundIcon } from "lucide-react";

import { AuthNotice } from "@/components/account/auth-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/features/auth/auth-client";
import { accountHref, authErrorMessage } from "@/features/auth/shared";
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
        {user ? (
          <CardDescription>管理你的登录与账户安全。</CardDescription>
        ) : (
          <CardAction className="row-span-1 flex items-center gap-2 self-center">
            <Button
              nativeButton={false}
              render={<Link to={accountHref("login")} />}
            >
              登录
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link to={accountHref("register")} />}
            >
              创建账户
            </Button>
          </CardAction>
        )}
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
              <Badge variant="secondary">邮箱已验证</Badge>
            </div>
          ) : null}
        </CardContent>
      ) : null}
      {user ? (
        <CardFooter className="flex-wrap gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link
                to={accountHref("forgot-password", { email: user.email })}
              />
            }
          >
            重置密码
          </Button>
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
        </CardFooter>
      ) : null}
    </Card>
  );
}
