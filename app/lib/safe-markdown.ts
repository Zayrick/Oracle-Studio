import { Marked, type RendererObject } from "marked";

const ZERO_WIDTH_PREFIX_PATTERN = /^[\u200B\u200C\u200D\u200E\u200F\uFEFF]/;
const HTML_ESCAPE_REPLACEMENTS: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

const renderer: RendererObject = {
  html({ text }) {
    return escapeHtml(text);
  },
  link({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    const safeHref = normalizeUrl(href);

    if (!safeHref) {
      return text;
    }

    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";

    return `<a href="${escapeHtml(safeHref)}"${titleAttribute} target="_blank" rel="noreferrer noopener nofollow">${text}</a>`;
  },
  image({ text }) {
    return text ? escapeHtml(`[图片：${text}]`) : "";
  },
};

const markdown = new Marked({
  async: false,
  breaks: true,
  gfm: true,
  renderer,
  silent: true,
});

export function renderSafeMarkdown(content: string) {
  return markdown.parse(content.replace(ZERO_WIDTH_PREFIX_PATTERN, ""), {
    async: false,
  });
}

function normalizeUrl(href: string) {
  const trimmed = href.trim();

  if (!trimmed || /[\u0000-\u001F\u007F\s]/.test(trimmed)) {
    return "";
  }

  try {
    const url = new URL(trimmed, "https://oracle-studio.local");

    if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) {
      return trimmed;
    }
  } catch {
    return "";
  }

  return "";
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"'`]/g,
    (character) => HTML_ESCAPE_REPLACEMENTS[character] ?? character
  );
}
