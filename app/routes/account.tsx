import { useLocation } from "react-router";

import { AuthForm } from "@/components/account/auth-form";
import { AuthNotice } from "@/components/account/auth-notice";
import { isAccountMode, safeRedirect } from "@/features/auth/shared";
import type { Route } from "./+types/account";

const titles = {
  login: "登录",
  register: "注册",
  "verify-email": "验证邮箱",
  "forgot-password": "找回密码",
};

export function loader({ request, params }: Route.LoaderArgs) {
  if (!isAccountMode(params.mode))
    throw new Response("页面不存在", { status: 404 });
  const url = new URL(request.url);
  return {
    mode: params.mode,
    initialEmail: (url.searchParams.get("email") ?? "").slice(0, 254),
    redirectTo: safeRedirect(url.searchParams.get("redirectTo")),
  };
}

export function meta({ params }: Route.MetaArgs) {
  return [
    {
      title: `云占 · ${isAccountMode(params.mode) ? titles[params.mode] : "账户"}`,
    },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export default function Account({ loaderData }: Route.ComponentProps) {
  const location = useLocation();
  return (
    <>
      {location.state?.passwordReset && loaderData.mode === "login" ? (
        <div className="mx-auto max-w-md px-4 pt-6">
          <AuthNotice>
            密码已重置，其他设备的登录已失效，请使用新密码登录。
          </AuthNotice>
        </div>
      ) : null}
      <AuthForm
        key={`${loaderData.mode}:${location.key}`}
        {...loaderData}
        verificationSent={Boolean(location.state?.verificationSent)}
      />
    </>
  );
}
