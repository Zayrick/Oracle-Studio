export const DEFAULT_LLM_BASE = "https://openrouter.ai/api/v1";
export const DEFAULT_LLM_MODEL = "openrouter/auto";
export const LLM_APP_TITLE = "Oracle Studio";

const CHAT_COMPLETIONS_PATH = "/chat/completions";

export function getLlmChatCompletionsUrl(base: string | undefined) {
  const normalizedBase = normalizeBaseUrl(base);

  return normalizedBase.endsWith(CHAT_COMPLETIONS_PATH)
    ? normalizedBase
    : `${normalizedBase}${CHAT_COMPLETIONS_PATH}`;
}

export function getLlmModel(model: string | undefined) {
  return model?.trim() || DEFAULT_LLM_MODEL;
}

function normalizeBaseUrl(base: string | undefined) {
  return (base?.trim() || DEFAULT_LLM_BASE).replace(/\/+$/, "");
}
