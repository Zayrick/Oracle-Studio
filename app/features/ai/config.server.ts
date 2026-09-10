export const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";
export const AI_APP_TITLE = "Oracle Studio";

export type AIRoutingEnvironment = { OPENROUTER_DOMAIN?: string };

export function getOpenRouterAPIBase(env: AIRoutingEnvironment) {
  const domain = env.OPENROUTER_DOMAIN?.trim() || "openrouter.ai";
  if (
    domain.length > 253 ||
    !domain.split(".").every((label) => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label))
  ) {
    throw new Error("Invalid OpenRouter domain configuration");
  }
  return `https://${domain.toLowerCase()}/api/v1`;
}

export type AIFeature = "bazi" | "liuyao";

export type AIProvisioningEnvironment = Pick<
  Env,
  | "AUTH_DB"
  | "OPENROUTER_MANAGEMENT_KEY"
  | "OPENROUTER_WORKSPACE_ID"
  | "AI_KEY_ENCRYPTION_SECRET"
> & AIRoutingEnvironment;

export function getAIPreset(env: Env, feature: AIFeature) {
  const value =
    feature === "bazi"
      ? env.OPENROUTER_BAZI_PRESET
      : env.OPENROUTER_LIUYAO_PRESET;
  const slug = value?.trim().replace(/^@preset\//, "") || feature;
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    throw new Error("Invalid OpenRouter preset configuration");
  }
  return `@preset/${slug}`;
}
