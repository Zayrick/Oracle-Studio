import { handleHistoryRequest } from "@/features/history/sync.server";
import { cloudflareContext } from "@/lib/cloudflare-context";
import type { Route } from "./+types/history-api";

function handle({ request, context }: Route.LoaderArgs | Route.ActionArgs) {
  const { env, ctx } = context.get(cloudflareContext);
  return handleHistoryRequest(request, env, ctx);
}
export const loader = handle;
export const action = handle;
