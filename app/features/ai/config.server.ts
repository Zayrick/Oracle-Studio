export const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";
export const AI_APP_TITLE = "Oracle Studio";

export type AIFeature = "bazi" | "liuyao";

export type AIProvisioningEnvironment = Pick<
  Env,
  | "AUTH_DB"
  | "OPENROUTER_MANAGEMENT_KEY"
  | "OPENROUTER_WORKSPACE_ID"
  | "AI_KEY_ENCRYPTION_SECRET"
>;

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
