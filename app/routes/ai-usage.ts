import type { Route } from "./+types/ai-usage";
import { handleAIUsageRequest } from "@/features/ai/usage-recovery.server";
import { cloudflareContext } from "@/lib/cloudflare-context";

function handle({ request, context }: Route.LoaderArgs | Route.ActionArgs) {
  const { env, ctx } = context.get(cloudflareContext);
  return handleAIUsageRequest(request, env, ctx);
}
export const loader = handle;
export const action = handle;
