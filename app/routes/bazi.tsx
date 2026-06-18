import { useEffect, useRef, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { ArrowLeftIcon, ArrowUpIcon, PlusIcon, SparklesIcon, SquareIcon } from "lucide-react";
import { Marked, type RendererObject } from "marked";
import { Link } from "react-router";
import type { Route } from "./+types/bazi";

import { BaziPaipanTable } from "@/components/bazi-paipan-table";
import { DateTimeWheelPicker } from "@/components/date-time-wheel-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatBaziAISystemPrompt } from "@/features/bazi/ai-format";
import type { BaziGender, BaziPaipan } from "@/features/bazi/paipan";
import { cn } from "@/lib/utils";

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

type BaziAIMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  status?: "streaming" | "complete" | "stopped" | "error";
};

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
    <div
      className={cn(
        paipan
          ? "relative mx-auto flex h-svh min-h-0 w-full overflow-hidden px-4 pb-0 pt-16 md:px-0 md:pt-0"
          : "container relative mx-auto flex min-h-svh items-center px-4 py-16 md:py-20 lg:py-10"
      )}
    >
      {paipan ? (
        <>
          <BaziMobileResultActions
            aiPanelOpen={aiPanelOpen}
            onBack={handleBackToForm}
            onToggleAiPanel={() => setAiPanelOpen((open) => !open)}
          />
          <BaziResultWorkspace
            paipan={paipan}
            aiPanelOpen={aiPanelOpen}
            onBack={handleBackToForm}
            onToggleAiPanel={() => setAiPanelOpen((open) => !open)}
            onCloseAi={() => setAiPanelOpen(false)}
          />
        </>
      ) : (
        <>
          <Link
            to="/"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "fixed left-4 top-4 z-20"
            )}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            返回主页
          </Link>

          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:gap-8">
            <div className="flex flex-col gap-2 text-center">
              <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">八字排盘</h1>
              <p className="text-sm text-muted-foreground">填写命主信息与出生时间</p>
            </div>

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
          </div>
        </>
      )}
    </div>
  );
}

function BaziMobileResultActions({
  aiPanelOpen,
  onBack,
  onToggleAiPanel,
}: {
  aiPanelOpen: boolean;
  onBack: () => void;
  onToggleAiPanel: () => void;
}) {
  return (
    <div className="fixed left-4 right-4 top-4 z-20 md:hidden">
      <BaziResultActions
        layout="mobile"
        aiPanelOpen={aiPanelOpen}
        onBack={onBack}
        onToggleAiPanel={onToggleAiPanel}
      />
    </div>
  );
}

function BaziResultWorkspace({
  paipan,
  aiPanelOpen,
  onBack,
  onToggleAiPanel,
  onCloseAi,
}: {
  paipan: BaziPaipan;
  aiPanelOpen: boolean;
  onBack: () => void;
  onToggleAiPanel: () => void;
  onCloseAi: () => void;
}) {
  return (
    <section className="flex h-full min-h-0 w-full flex-col" aria-label="八字排盘结果">
      <div className="fixed inset-x-0 top-0 z-20 hidden h-16 border-b bg-background/95 backdrop-blur md:left-[224px] md:flex md:items-center">
        <div className="mx-auto flex w-full max-w-[96rem] px-6 lg:px-8">
          <BaziResultActions
            layout="desktop"
            aiPanelOpen={aiPanelOpen}
            onBack={onBack}
            onToggleAiPanel={onToggleAiPanel}
          />
        </div>
      </div>

      <div className="flex h-full min-h-0 w-full flex-1 flex-col md:pt-16">
        <div
          className={cn(
            "mx-auto flex w-full flex-1 flex-col max-lg:relative max-lg:h-full max-lg:min-h-0 max-lg:overflow-hidden lg:h-full lg:min-h-0 lg:overflow-hidden",
            aiPanelOpen
              ? "liuyao-result-grid-open max-lg:h-full max-lg:min-h-0 lg:grid lg:max-w-[96rem]"
              : "liuyao-result-grid-closed lg:grid lg:max-w-[96rem]"
          )}
        >
          <div
            className={cn(
              "liuyao-mobile-result-page min-w-0 max-lg:absolute max-lg:inset-0 max-lg:overflow-y-auto max-lg:pb-6 lg:flex lg:h-full lg:min-h-0 lg:overflow-y-auto lg:px-8 lg:py-8",
              aiPanelOpen ? "liuyao-mobile-result-page-open" : "liuyao-mobile-result-page-closed",
              !aiPanelOpen && "lg:w-full"
            )}
          >
            <div className="w-full lg:mx-auto lg:max-w-6xl">
              <BaziPaipanTable paipan={paipan} />
            </div>
          </div>

          <Separator
            orientation="vertical"
            className={cn(
              "liuyao-result-divider hidden",
              aiPanelOpen ? "liuyao-result-divider-open lg:block" : "liuyao-result-divider-closed lg:block"
            )}
          />

          <BaziAIPanel open={aiPanelOpen} paipan={paipan} onClose={onCloseAi} />
        </div>
      </div>
    </section>
  );
}

function BaziResultActions({
  layout,
  aiPanelOpen,
  onBack,
  onToggleAiPanel,
}: {
  layout: "mobile" | "desktop";
  aiPanelOpen: boolean;
  onBack: () => void;
  onToggleAiPanel: () => void;
}) {
  const compact = layout === "mobile";

  return (
    <div
      className={cn(
        "flex w-full max-w-full items-center gap-2",
        compact ? "justify-between" : "justify-between gap-3"
      )}
    >
      <Button
        type="button"
        variant="outline"
        size={compact ? "sm" : "default"}
        onClick={onBack}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        返回填写
      </Button>
      <Button
        type="button"
        size={compact ? "sm" : "default"}
        aria-expanded={aiPanelOpen}
        onClick={onToggleAiPanel}
      >
        <SparklesIcon data-icon="inline-start" />
        {aiPanelOpen ? "收起AI" : "询问AI"}
      </Button>
    </div>
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
  const [sessionId, setSessionIdState] = useState(() => createBaziAISessionId());
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
    setSessionId(createBaziAISessionId());
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
    const requestMessages = buildBaziAIRequestMessages(messagesRef.current, content);
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
        throw new Error(await readAIErrorMessage(response));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          const chunk = decoder.decode(value, { stream: true });

          if (chunk && isActiveRequest()) {
            setMessages((prev) => appendToBaziMessage(prev, assistantMessageId, chunk));
          }
        }

        const rest = decoder.decode();

        if (rest && isActiveRequest()) {
          setMessages((prev) => appendToBaziMessage(prev, assistantMessageId, rest));
        }
      } finally {
        reader.releaseLock();
      }

      if (!isActiveRequest()) {
        return;
      }

      setMessages((prev) =>
        prev.map((item) => {
          if (item.id !== assistantMessageId) {
            return item;
          }

          return {
            ...item,
            content: item.content || "AI 未返回内容。",
            status: item.content ? "complete" : "error",
          };
        })
      );
    } catch (err) {
      if (!isActiveRequest()) {
        return;
      }

      if (abortController.signal.aborted) {
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantMessageId
              ? {
                  ...item,
                  content: item.content || "已停止。",
                  status: "stopped",
                }
              : item
          )
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
    setSessionId(createBaziAISessionId());
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
    <>
      <aside
        aria-hidden={!open}
        aria-label="询问AI"
        className={cn(
          "liuyao-ai-pane hidden min-h-0 overflow-hidden bg-background lg:flex lg:h-full lg:flex-col",
          open ? "liuyao-ai-pane-open" : "liuyao-ai-pane-closed"
        )}
      >
        <BaziAIPanelContent
          isSending={isSending}
          message={message}
          messages={messages}
          onMessageChange={setMessage}
          onNewSession={handleNewSession}
          onStop={handleStop}
          onSubmit={handleSubmit}
          title="AI 解盘"
          tabIndex={open ? 0 : -1}
          variant="desktop"
        />
      </aside>
      <section
        aria-hidden={!open}
        aria-label="询问AI"
        className={cn(
          "liuyao-mobile-ai-page min-h-0 w-full overflow-hidden bg-background max-lg:absolute max-lg:inset-0 max-lg:flex max-lg:flex-col lg:hidden",
          open ? "liuyao-mobile-ai-page-open" : "liuyao-mobile-ai-page-closed"
        )}
      >
        <BaziAIPanelContent
          isSending={isSending}
          message={message}
          messages={messages}
          onMessageChange={setMessage}
          onNewSession={handleNewSession}
          onStop={handleStop}
          onSubmit={handleSubmit}
          title={formatBaziAITitle(paipan)}
          tabIndex={open ? 0 : -1}
          variant="mobile"
        />
      </section>
    </>
  );
}

function BaziAIPanelContent({
  isSending,
  message,
  messages,
  onMessageChange,
  onNewSession,
  onStop,
  onSubmit,
  title,
  tabIndex,
  variant,
}: {
  isSending: boolean;
  message: string;
  messages: BaziAIMessage[];
  onMessageChange: (value: string) => void;
  onNewSession: () => void;
  onStop: () => void;
  onSubmit: (event: FormEvent) => void;
  title: string;
  tabIndex: 0 | -1;
  variant: "desktop" | "mobile";
}) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const mobile = variant === "mobile";
  const messageInputId = mobile ? "bazi-ai-message-mobile" : "bazi-ai-message-desktop";

  useEffect(() => {
    if (tabIndex === -1) {
      return;
    }

    const viewport = getScrollAreaViewport(scrollAreaRef.current);

    if (!viewport) {
      return;
    }

    const updateShouldStick = () => {
      shouldStickToBottomRef.current = isScrolledNearBottom(viewport);
    };

    updateShouldStick();
    viewport.addEventListener("scroll", updateShouldStick, { passive: true });

    return () => {
      viewport.removeEventListener("scroll", updateShouldStick);
    };
  }, [tabIndex]);

  useEffect(() => {
    if (tabIndex === -1 || !shouldStickToBottomRef.current) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const viewport = getScrollAreaViewport(scrollAreaRef.current);

      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [messages, tabIndex]);

  return (
    <div
      className={cn(
        "grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden",
        mobile && "flex-1"
      )}
    >
      <div className={cn("flex items-center justify-between gap-2", mobile ? "border-b px-0 py-2" : "px-5 pb-2 pt-5")}>
        <div className={cn("min-w-0 flex-1 truncate font-medium", mobile ? "text-xs text-muted-foreground" : "text-sm")}>
          {title}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="新建询问AI会话"
          tabIndex={tabIndex}
          onClick={onNewSession}
        >
          <PlusIcon />
        </Button>
      </div>

      <div ref={scrollAreaRef} className="h-full min-h-0">
        <ScrollArea className="h-full min-h-0" aria-live="polite" aria-label="询问AI消息">
          <div className={cn("flex min-h-full flex-col justify-end gap-3 py-4", mobile ? "px-0" : "px-5")}>
            {messages.map((item) => (
              <div key={item.id} className={cn("flex", item.role === "user" ? "justify-end" : "justify-start")}>
                <div className={getBaziAIMessageClass(item)}>
                  <BaziAIMessageContent message={item} />
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <form
        className={cn(mobile ? "border-t py-3" : "px-5 pb-5 pt-3")}
        onSubmit={onSubmit}
      >
        <FieldGroup className="gap-0">
          <Field orientation="horizontal" className="items-center gap-2">
            <FieldLabel htmlFor={messageInputId} className="sr-only">追问内容</FieldLabel>
            <Input
              id={messageInputId}
              value={message}
              disabled={isSending}
              tabIndex={tabIndex}
              onChange={(event) => onMessageChange(event.target.value)}
              placeholder="输入你想了解的内容"
            />
            <Button
              type={isSending ? "button" : "submit"}
              size="icon"
              aria-label={isSending ? "停止输出" : "发送追问"}
              disabled={!isSending && !message.trim()}
              tabIndex={tabIndex}
              onClick={isSending ? onStop : undefined}
            >
              {isSending ? <SquareIcon /> : <ArrowUpIcon />}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
}

function formatBaziAITitle(paipan: BaziPaipan) {
  return `${paipan.name || "未署名"} · ${paipan.tymeEightChar}`;
}

function createBaziAISessionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `bazi-${globalThis.crypto.randomUUID()}`;
  }

  return `bazi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getScrollAreaViewport(root: HTMLDivElement | null) {
  return root?.querySelector<HTMLElement>("[data-slot='scroll-area-viewport']") ?? null;
}

function isScrolledNearBottom(element: HTMLElement) {
  const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;

  return distanceToBottom < 32;
}

function getBaziAIMessageClass(message: BaziAIMessage) {
  if (message.role === "user") {
    return cn(
      "max-w-[82%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm leading-relaxed text-primary-foreground break-words whitespace-pre-wrap",
      message.status === "error" && "bg-destructive/10 text-destructive"
    );
  }

  return cn(
    "liuyao-ai-markdown w-full max-w-full py-1 text-sm leading-relaxed text-card-foreground break-words",
    message.status === "error" && "text-destructive"
  );
}

function BaziAIMessageContent({ message }: { message: BaziAIMessage }) {
  if (!message.content) {
    return message.status === "streaming" ? "正在解盘..." : null;
  }

  if (message.role === "assistant" && message.status !== "error") {
    return (
      <div
        dangerouslySetInnerHTML={{
          __html: renderBaziMarkdown(message.content),
        }}
      />
    );
  }

  return message.content;
}

function renderBaziMarkdown(content: string) {
  return baziMarkdown.parse(
    content.replace(MARKDOWN_ZERO_WIDTH_PREFIX_PATTERN, ""),
    { async: false }
  );
}

function appendToBaziMessage(messages: BaziAIMessage[], messageId: number, chunk: string) {
  return messages.map((item) =>
    item.id === messageId
      ? {
          ...item,
          content: item.content + chunk,
        }
      : item
  );
}

function buildBaziAIRequestMessages(messages: BaziAIMessage[], currentContent: string) {
  const history = messages
    .flatMap((item): Array<Pick<BaziAIMessage, "role" | "content">> => {
      const content = item.content.trim();

      if (!content || (item.role === "assistant" && item.status === "error")) {
        return [];
      }

      return [
        {
          role: item.role,
          content,
        },
      ];
    })

  return [
    ...history,
    {
      role: "user" as const,
      content: currentContent,
    },
  ];
}

function encodeBase64Json(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

async function readAIErrorMessage(response: Response) {
  try {
    const data = await response.json();

    if (isRecord(data) && typeof data.error === "string") {
      return data.error;
    }
  } catch {
    // Fall through to the generic message below.
  }

  return "AI 解盘失败，请稍后再试。";
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
