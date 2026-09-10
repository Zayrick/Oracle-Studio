import type { Route } from "./+types/liuyao-ai";

import { aiMethodNotAllowed, handleAIRequest } from "@/features/ai/request.server";
import { handleLiuyaoAI } from "@/features/liuyao/ai.server";
import { cloudflareContext } from "@/lib/cloudflare-context";

export const loader = aiMethodNotAllowed;

export function action({ request, context }: Route.ActionArgs) {
  const { env, ctx } = context.get(cloudflareContext);
  return handleAIRequest(request, env, ctx, "liuyao", handleLiuyaoAI);
}
