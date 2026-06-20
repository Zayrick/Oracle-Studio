import { useEffect, useRef, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { Marked, type RendererObject } from "marked";
import type { Route } from "./+types/bazi";

import { BaziPaipanTable } from "@/components/bazi-paipan-table";
import { DateTimeWheelPicker } from "@/components/date-time-wheel-picker";
import { DivinationAIChatPanel } from "@/components/divination-ai-chat";
import { DivinationPageFrame } from "@/components/divination-page-frame";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  appendAIChatEventToMessage,
  buildAIChatRequestMessages,
  createAIChatSessionId,
  encodeBase64Json,
  readAIErrorMessage,
  type AIChatMessage,
} from "@/features/ai/chat";
import { readAIStreamEvents } from "@/features/ai/timeline";
import { formatBaziAISystemPrompt } from "@/features/bazi/ai-format";
import type { BaziGender, BaziPaipan } from "@/features/bazi/paipan";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "云占·八字" },
    { name: "description", content: "八字占卜" },
  ];
}

const BAZI_GENDER_OPTIONS = [
  { label: "男", value: "male" },
  { label: "女", value: "female" },
] satisfies Array<{ label: string; value: BaziGender }>;
const BAZI_AI_ENDPOINT = "/api/bazi/ai";
const MARKDOWN_ZERO_WIDTH_PREFIX_PATTERN = /^[\u200B\u200C\u200D\u200E\u200F\uFEFF]/;

type BaziAIMessage = AIChatMessage;

const baziMarkdownRenderer: RendererObject = {
  html({ text }) {
    return escapeHtml(text);
  },
  link({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    const safeHref = normalizeMarkdownUrl(href);

    if (!safeHref) {
      return text;
    }

    const titleAttribute = title ? ` title="${escapeHtmlAttribute(title)}"` : "";

    return `<a href="${escapeHtmlAttribute(safeHref)}"${titleAttribute} target="_blank" rel="noreferrer noopener nofollow">${text}</a>`;
  },
  image({ text }) {
    return text ? escapeHtml(`[图片：${text}]`) : "";
  },
};

const baziMarkdown = new Marked({
  async: false,
  breaks: true,
  gfm: true,
  renderer: baziMarkdownRenderer,
  silent: true,
});

export default function Bazi() {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<BaziGender | "">("");
  const [date, setDate] = useState<Date>(new Date());
  const [time, setTime] = useState(format(new Date(), "HH:mm"));
  const [genderError, setGenderError] = useState("");
  const [calculationError, setCalculationError] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);
  const [paipan, setPaipan] = useState<BaziPaipan | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  const handleBackToForm = () => {
    setPaipan(null);
    setAiPanelOpen(false);
    setCalculationError("");
  };

  const handleSetNow = () => {
    const now = new Date();
    setDate(now);
    setTime(format(now, "HH:mm"));
    setCalculationError("");
  };

  const handleGenderChange = (values: string[]) => {
    const nextGender = values[values.length - 1] as BaziGender | undefined;

    if (!nextGender) {
      return;
    }

    setGender(nextGender);
    setGenderError("");
    setCalculationError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!gender) {
      setGenderError("请选择性别。");
      setPaipan(null);
      return;
    }

    setGenderError("");

    try {
      setIsCalculating(true);
      const { buildBaziPaipan } = await import("@/features/bazi/paipan");
      setPaipan(buildBaziPaipan({ name, gender, date, time }));
      setAiPanelOpen(false);
      setCalculationError("");
    } catch (error) {
      console.error(error);
      setPaipan(null);
      setAiPanelOpen(false);
      setCalculationError("排盘失败，请检查出生时间后重试。");
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <DivinationPageFrame
      form={{
        title: "八字排盘",
        description: "填写命主信息与出生时间",
        content: (
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex w-full max-w-md flex-col gap-5 text-card-foreground animate-in fade-in-0 slide-in-from-bottom-3 duration-300 lg:gap-6"
          >
            <Field>
              <FieldLabel htmlFor="bazi-name">命主姓名（可选）</FieldLabel>
              <Input
                id="bazi-name"
                name="name"
                type="text"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setCalculationError("");
                }}
                placeholder="请输入命主姓名"
                autoComplete="name"
              />
            </Field>

            <Field data-invalid={Boolean(genderError)}>
              <FieldLabel id="bazi-gender-label">性别</FieldLabel>
              <ToggleGroup
                aria-labelledby="bazi-gender-label"
                aria-invalid={Boolean(genderError) || undefined}
                value={gender ? [gender] : []}
                onValueChange={handleGenderChange}
                variant="outline"
                spacing={0}
                className="w-full"
              >
                {BAZI_GENDER_OPTIONS.map((option) => (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    className="flex-1"
                  >
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <input type="hidden" name="gender" value={gender} />
              {genderError ? <FieldError>{genderError}</FieldError> : null}
            </Field>

            <FieldGroup className="flex-row items-end gap-2">
              <Field className="min-w-0 flex-1">
                <FieldLabel htmlFor="bazi-date-time-picker">出生时间</FieldLabel>
                <DateTimeWheelPicker
                  id="bazi-date-time-picker"
                  date={date}
                  time={time}
                  onChange={(nextValue) => {
                    setDate(nextValue.date);
                    setTime(nextValue.time);
                    setCalculationError("");
                  }}
                />
                <input type="hidden" name="birthDate" value={format(date, "yyyy-MM-dd")} />
                <input type="hidden" name="birthTime" value={time} />
              </Field>
              <Button
                type="button"
                variant="outline"
                onClick={handleSetNow}
                className="shrink-0"
              >
                现在
              </Button>
            </FieldGroup>

            <div className="flex justify-center pt-1">
              <Button type="submit" size="lg" disabled={isCalculating} className="w-full max-w-xs">
                {isCalculating ? "排盘中..." : "开始排盘"}
              </Button>
            </div>

            {calculationError ? (
              <p role="alert" className="text-center text-sm text-destructive">
                {calculationError}
              </p>
            ) : null}
          </form>
        ),
      }}
      result={
        paipan
          ? {
              ariaLabel: "八字排盘结果",
              content: <BaziPaipanTable paipan={paipan} />,
              contentClassName: "lg:mx-auto lg:max-w-6xl",
              restartLabel: "返回填写",
              onRestart: handleBackToForm,
              ai: {
                open: aiPanelOpen,
                onToggle: () => setAiPanelOpen((open) => !open),
                panel: (
                  <BaziAIPanel
                    open={aiPanelOpen}
                    paipan={paipan}
                    onClose={() => setAiPanelOpen(false)}
                  />
                ),
              },
            }
          : undefined
      }
    />
  );
}

function BaziAIPanel({
  open,
  paipan,
  onClose,
}: {
  open: boolean;
  paipan: BaziPaipan;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [messages, setMessagesState] = useState<BaziAIMessage[]>([]);
  const [sessionId, setSessionIdState] = useState(() => createAIChatSessionId("bazi"));
  const [isSending, setIsSending] = useState(false);
  const messagesRef = useRef(messages);
  const sessionIdRef = useRef(sessionId);
  const nextMessageIdRef = useRef(1);
  const activeRequestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const setMessages = (
    updater: BaziAIMessage[] | ((current: BaziAIMessage[]) => BaziAIMessage[])
  ) => {
    const nextMessages = typeof updater === "function"
      ? updater(messagesRef.current)
      : updater;

    messagesRef.current = nextMessages;
    setMessagesState(nextMessages);

    return nextMessages;
  };

  const setSessionId = (nextSessionId: string) => {
    sessionIdRef.current = nextSessionId;
    setSessionIdState(nextSessionId);
  };

  useEffect(() => {
    activeRequestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessage("");
    setMessages([]);
    setSessionId(createAIChatSessionId("bazi"));
    setIsSending(false);
    nextMessageIdRef.current = 1;
  }, [paipan]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const content = message.trim();

    if (!content || isSending) {
      return;
    }

    const userMessageId = nextMessageIdRef.current++;
    const assistantMessageId = nextMessageIdRef.current++;
    const requestMessages = buildAIChatRequestMessages(messagesRef.current, content);
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;

    setMessages([
      ...messagesRef.current,
      {
        id: userMessageId,
        role: "user",
        content,
      },
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        status: "streaming",
      },
    ]);
    setMessage("");
    setIsSending(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const isActiveRequest = () => activeRequestIdRef.current === requestId;

    try {
      const response = await fetch(BAZI_AI_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payload: encodeBase64Json({
            systemPrompt: formatBaziAISystemPrompt(paipan),
            chart: paipan,
            sessionId: sessionIdRef.current,
            messages: requestMessages,
          }),
        }),
        signal: abortController.signal,
      });

      if (!isActiveRequest()) {
        return;
      }

      if (!response.ok || !response.body) {
        throw new Error(await readAIErrorMessage(response, "AI 解盘失败，请稍后再试。"));
      }

      await readAIStreamEvents(response.body, (event) => {
        if (event.type === "error") {
          throw new Error(event.message);
        }

        if (isActiveRequest()) {
          setMessages((prev) => appendAIChatEventToMessage(prev, assistantMessageId, event));
        }
      });

      if (!isActiveRequest()) {
        return;
      }

      setMessages((prev) =>
        prev.map((item) => {
          if (item.id !== assistantMessageId) {
            return item;
          }

          const hasOutput = Boolean(item.content || item.parts?.length);

          return {
            ...item,
            content: hasOutput ? item.content : "AI 未返回内容。",
            status: hasOutput ? "complete" : "error",
          };
        })
      );
    } catch (err) {
      if (!isActiveRequest()) {
        return;
      }

      if (abortController.signal.aborted) {
        setMessages((prev) =>
          prev.map((item) => {
            if (item.id !== assistantMessageId) {
              return item;
            }

            return {
              ...item,
              content: item.content || "已停止。",
              status: "stopped",
            };
          })
        );
        return;
      }

      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content: err instanceof Error ? err.message : "AI 解盘失败，请稍后再试。",
                status: "error",
              }
            : item
        )
      );
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }

      if (isActiveRequest()) {
        setIsSending(false);
      }
    }
  };

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  const handleNewSession = () => {
    activeRequestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessage("");
    setMessages([]);
    setIsSending(false);
    setSessionId(createAIChatSessionId("bazi"));
    nextMessageIdRef.current = 1;
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  return (
    <DivinationAIChatPanel
      open={open}
      desktopTitle="AI 解盘"
      mobileTitle={formatBaziAITitle(paipan)}
      pendingLabel="正在解盘..."
      inputValue={message}
      messages={messages}
      isSending={isSending}
      onInputChange={setMessage}
      onNewSession={handleNewSession}
      onStop={handleStop}
      onSubmit={handleSubmit}
      renderMarkdown={renderBaziMarkdown}
    />
  );
}

function formatBaziAITitle(paipan: BaziPaipan) {
  return `${paipan.name || "未署名"} · ${paipan.tymeEightChar}`;
}

function renderBaziMarkdown(content: string) {
  return baziMarkdown.parse(
    content.replace(MARKDOWN_ZERO_WIDTH_PREFIX_PATTERN, ""),
    { async: false }
  );
}

function normalizeMarkdownUrl(href: string) {
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

const HTML_ESCAPE_REPLACEMENTS: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"'`]/g, (char) => HTML_ESCAPE_REPLACEMENTS[char] ?? char);
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
