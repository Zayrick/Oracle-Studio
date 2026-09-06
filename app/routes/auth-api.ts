import { createAuth, isAuthConfigured } from "@/features/auth/auth.server";
import { cloudflareContext } from "@/lib/cloudflare-context";
import type { Route } from "./+types/auth-api";

async function handleAuth({
  request,
  context,
}: Route.LoaderArgs | Route.ActionArgs) {
  const { env, ctx } = context.get(cloudflareContext);
  if (!isAuthConfigured(env)) {
    return Response.json(
      { code: "AUTH_UNAVAILABLE", message: "账户服务暂时不可用。" },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
  const response = await createAuth(env, ctx).handler(request);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const loader = handleAuth;
export const action = handleAuth;
