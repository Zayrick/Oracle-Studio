import type { Route } from "./+types/bazi-ai";

import { aiMethodNotAllowed, handleAIRequest } from "@/features/ai/request.server";
import { handleBaziAI } from "@/features/bazi/ai.server";
import { cloudflareContext } from "@/lib/cloudflare-context";

export const loader = aiMethodNotAllowed;

export function action({ request, context }: Route.ActionArgs) {
  const { env, ctx } = context.get(cloudflareContext);
  return handleAIRequest(request, env, ctx, "bazi", handleBaziAI);
}
