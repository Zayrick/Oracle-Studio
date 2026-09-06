import { redirect } from "react-router";

import {
  accountHref,
  isAccountMode,
  safeRedirect,
} from "@/features/auth/shared";
import type { Route } from "./+types/account";

export function loader({ request, params }: Route.LoaderArgs) {
  if (!isAccountMode(params.mode))
    throw new Response("页面不存在", { status: 404 });
  const url = new URL(request.url);
  const initialEmail = (url.searchParams.get("email") ?? "").slice(0, 254);
  const redirectTo = safeRedirect(url.searchParams.get("redirectTo"));
  return redirect(
    accountHref(params.mode, { email: initialEmail, redirectTo }),
  );
}
