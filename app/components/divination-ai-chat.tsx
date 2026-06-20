import { useEffect, useRef, type FormEvent, type Ref } from "react";
import { format } from "date-fns";
import {
  ArrowUpIcon,
  HistoryIcon,
  PlusIcon,
  SquareIcon,
} from "lucide-react";

import { AIMessageTimeline } from "@/components/ai-message-timeline";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AIChatMessage } from "@/features/ai/chat";
import { cn } from "@/lib/utils";

export type DivinationAIChatSession<Message extends AIChatMessage = AIChatMessage> = {
  sessionId: string;
  title: string;
  updatedAt: string;
  messages: Message[];
};

export type DivinationAIChatHistory<Message extends AIChatMessage = AIChatMessage> = {
  visible?: boolean;
  sessions: Array<DivinationAIChatSession<Message>>;
  activeSessionId: string;
  title?: string;
  description?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  onRestoreSession: (sessionId: string) => void;
};

export type DivinationAIChatPanelProps<Message extends AIChatMessage = AIChatMessage> = {
  open: boolean;
  desktopTitle: string;
  mobileTitle: string;
  pendingLabel: string;
  inputValue: string;
  messages: Message[];
  isSending: boolean;
  history?: DivinationAIChatHistory<Message>;
  onInputChange: (value: string) => void;
  onNewSession: () => void;
  onStop: () => void;
  onSubmit: (event: FormEvent) => void;
  renderMarkdown: (content: string) => string;
};

const AI_CHAT_LAYOUT = {
  desktop: {
    header: "px-5 pt-4",
    scrollContent: "px-5 pb-24 pt-[4.5rem]",
    messageList: "",
    composer: "bottom-0 px-5 pb-5 pt-3",
    title: "px-4 py-2 text-sm",
  },
  mobile: {
    header: "px-1 pt-2",
    scrollContent: "px-0 pb-[calc(var(--mobile-dock-height)+5rem)] pt-14",
    messageList: "",
    composer: "bottom-[var(--mobile-dock-height)] px-1 py-3",
    title: "px-3 py-2 text-xs text-muted-foreground",
  },
} satisfies Record<
  "desktop" | "mobile",
  {
    header: string;
    scrollContent: string;
    messageList: string;
    composer: string;
    title: string;
  }
>;

const AI_HEADER_ICON_BUTTON_CLASS =
  "divination-ai-frosted-surface rounded-full ring-1 ring-border/60 hover:bg-muted/80";

export function DivinationAIChatPanel<Message extends AIChatMessage>({
  open,
  desktopTitle,
  mobileTitle,
  ...contentProps
}: DivinationAIChatPanelProps<Message>) {
  return (
    <>
      <aside
        aria-hidden={!open}
        aria-label="询问AI"
        className={cn(
          "divination-ai-pane hidden min-h-0 overflow-hidden bg-background lg:flex lg:h-full lg:flex-col",
          open ? "divination-ai-pane-open" : "divination-ai-pane-closed"
        )}
      >
        <DivinationAIChatContent
          {...contentProps}
          title={desktopTitle}
          tabIndex={open ? 0 : -1}
          variant="desktop"
        />
      </aside>
      <section
        aria-hidden={!open}
        aria-label="询问AI"
        className={cn(
          "divination-mobile-ai-page min-h-0 w-full overflow-hidden bg-background max-lg:absolute max-lg:inset-0 max-lg:flex max-lg:flex-col lg:hidden",
          open ? "divination-mobile-ai-page-open" : "divination-mobile-ai-page-closed"
        )}
      >
        <DivinationAIChatContent
          {...contentProps}
          title={mobileTitle}
          tabIndex={open ? 0 : -1}
          variant="mobile"
        />
      </section>
    </>
  );
}

function DivinationAIChatContent<Message extends AIChatMessage>({
  history,
  inputValue,
  isSending,
  messages,
  onInputChange,
  onNewSession,
  onStop,
  onSubmit,
  pendingLabel,
  renderMarkdown,
  tabIndex,
  title,
  variant,
}: Omit<DivinationAIChatPanelProps<Message>, "desktopTitle" | "mobileTitle" | "open"> & {
  tabIndex: 0 | -1;
  title: string;
  variant: "desktop" | "mobile";
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const mobile = variant === "mobile";
  const messageInputId = mobile ? "divination-ai-message-mobile" : "divination-ai-message-desktop";
  const showHistory = history && history.visible !== false;
  const layout = AI_CHAT_LAYOUT[variant];
  const header = (
    <AIChatHeader
      className={layout.header}
      history={showHistory ? history : undefined}
      tabIndex={tabIndex}
      title={title}
      titleClassName={layout.title}
      onNewSession={onNewSession}
    />
  );

  useEffect(() => {
    if (tabIndex === -1) {
      return;
    }

    const viewport = scrollContainerRef.current;

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
      const viewport = scrollContainerRef.current;

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
        "relative flex h-full min-h-0 flex-col overflow-hidden",
        mobile && "flex-1"
      )}
    >
      {header}

      <AIChatMessages
        messageListClassName={layout.messageList}
        messages={messages}
        pendingLabel={pendingLabel}
        renderMarkdown={renderMarkdown}
        scrollContainerRef={scrollContainerRef}
        scrollContentClassName={layout.scrollContent}
        tabIndex={tabIndex}
      />

      <AIChatComposer
        className={layout.composer}
        inputId={messageInputId}
        inputValue={inputValue}
        isSending={isSending}
        tabIndex={tabIndex}
        onInputChange={onInputChange}
        onStop={onStop}
        onSubmit={onSubmit}
      />
    </div>
  );
}

function AIChatHeader<Message extends AIChatMessage>({
  className,
  history,
  onNewSession,
  tabIndex,
  title,
  titleClassName,
}: {
  className: string;
  history?: DivinationAIChatHistory<Message>;
  tabIndex: 0 | -1;
  title: string;
  titleClassName: string;
  onNewSession: () => void;
}) {
  return (
    <header className={cn("pointer-events-none absolute inset-x-0 top-0 z-10", className)}>
      <div className="flex w-full items-center gap-2">
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "divination-ai-frosted-surface pointer-events-auto inline-flex max-w-full rounded-full ring-1 ring-border/60",
              titleClassName
            )}
          >
            <div className="truncate text-left font-medium">{title}</div>
          </div>
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          {history ? (
            <DivinationAIHistoryPopover
              activeSessionId={history.activeSessionId}
              description={history.description}
              emptyDescription={history.emptyDescription}
              emptyTitle={history.emptyTitle}
              sessions={history.sessions}
              tabIndex={tabIndex}
              title={history.title}
              triggerClassName={AI_HEADER_ICON_BUTTON_CLASS}
              onRestoreSession={history.onRestoreSession}
            />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={AI_HEADER_ICON_BUTTON_CLASS}
            aria-label="新建询问AI会话"
            tabIndex={tabIndex}
            onClick={onNewSession}
          >
            <PlusIcon />
          </Button>
        </div>
      </div>
    </header>
  );
}

function AIChatMessages<Message extends AIChatMessage>({
  messageListClassName,
  messages,
  pendingLabel,
  renderMarkdown,
  scrollContainerRef,
  scrollContentClassName,
  tabIndex,
}: {
  messageListClassName: string;
  messages: Message[];
  pendingLabel: string;
  renderMarkdown: (content: string) => string;
  scrollContainerRef: Ref<HTMLDivElement>;
  scrollContentClassName: string;
  tabIndex: 0 | -1;
}) {
  return (
    <div
      ref={scrollContainerRef}
      className="divination-ai-chat-scroll h-full min-h-0 flex-1 overflow-y-auto overscroll-contain"
      aria-live="polite"
      aria-label="询问AI消息"
      tabIndex={tabIndex}
    >
      <div className={cn("flex min-h-full flex-col", scrollContentClassName)}>
        <div className={cn("flex flex-1 flex-col justify-end gap-3", messageListClassName)}>
          {messages.map((item) => (
            <div key={item.id} className={cn("flex", item.role === "user" ? "justify-end" : "justify-start")}>
              <div className={getAIChatMessageClass(item)}>
                <AIChatMessageContent
                  message={item}
                  pendingLabel={pendingLabel}
                  renderMarkdown={renderMarkdown}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AIChatComposer({
  className,
  inputId,
  inputValue,
  isSending,
  onInputChange,
  onStop,
  onSubmit,
  tabIndex,
}: {
  className: string;
  inputId: string;
  inputValue: string;
  isSending: boolean;
  tabIndex: 0 | -1;
  onInputChange: (value: string) => void;
  onStop: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form className={cn("absolute inset-x-0 z-10", className)} onSubmit={onSubmit}>
      <FieldGroup className="gap-0">
        <Field orientation="horizontal" className="items-center gap-2">
          <FieldLabel htmlFor={inputId} className="sr-only">追问内容</FieldLabel>
          <Input
            id={inputId}
            value={inputValue}
            tabIndex={tabIndex}
            className="divination-ai-frosted-filter"
            onChange={(event) => onInputChange(event.target.value)}
            placeholder="输入你想了解的内容"
          />
          <Button
            type={isSending ? "button" : "submit"}
            size="icon"
            className="rounded-full bg-primary text-primary-foreground opacity-100 hover:bg-primary disabled:bg-primary disabled:text-primary-foreground disabled:opacity-100"
            aria-label={isSending ? "停止输出" : "发送追问"}
            tabIndex={tabIndex}
            disabled={!isSending && !inputValue.trim()}
            onClick={isSending ? onStop : undefined}
          >
            {isSending ? <SquareIcon /> : <ArrowUpIcon />}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}

function DivinationAIHistoryPopover<Message extends AIChatMessage>({
  activeSessionId,
  description = "恢复过去的询问会话。",
  emptyDescription = "还没有保存过询问会话。",
  emptyTitle = "暂无 AI 会话",
  sessions,
  tabIndex,
  title = "AI 历史",
  triggerClassName,
  onRestoreSession,
}: {
  activeSessionId: string;
  description?: string;
  emptyDescription?: string;
  emptyTitle?: string;
  sessions: Array<DivinationAIChatSession<Message>>;
  tabIndex: 0 | -1;
  title?: string;
  triggerClassName?: string;
  onRestoreSession: (sessionId: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={triggerClassName}
            aria-label="询问AI历史"
            tabIndex={tabIndex}
          />
        }
      >
        <HistoryIcon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] gap-3">
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{description}</PopoverDescription>
        </PopoverHeader>

        {sessions.length === 0 ? (
          <Empty className="rounded-lg border-0 bg-muted/40 px-3 py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HistoryIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{emptyTitle}</EmptyTitle>
              <EmptyDescription>{emptyDescription}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ScrollArea className="max-h-72 pr-2">
            <div className="flex flex-col gap-1">
              {sessions.map((session) => {
                const active = session.sessionId === activeSessionId;

                return (
                  <button
                    key={session.sessionId}
                    type="button"
                    className={cn(
                      "rounded-lg px-3 py-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30",
                      active && "bg-muted"
                    )}
                    onClick={() => onRestoreSession(session.sessionId)}
                  >
                    <div className="truncate text-sm font-medium">
                      {session.title}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{formatHistoryDateTime(session.updatedAt)}</span>
                      <span>{formatAIMessageCount(session.messages)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}

function AIChatMessageContent({
  message,
  pendingLabel,
  renderMarkdown,
}: {
  message: AIChatMessage;
  pendingLabel: string;
  renderMarkdown: (content: string) => string;
}) {
  if (message.role === "assistant" && message.status !== "error") {
    return (
      <AIMessageTimeline
        message={message}
        pendingLabel={pendingLabel}
        renderMarkdown={renderMarkdown}
      />
    );
  }

  if (!message.content) {
    return message.status === "streaming" ? pendingLabel : null;
  }

  return message.content;
}

function getAIChatMessageClass(message: AIChatMessage) {
  if (message.role === "user") {
    return cn(
      "max-w-[82%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm leading-relaxed text-primary-foreground break-words whitespace-pre-wrap",
      message.status === "error" && "bg-destructive/10 text-destructive"
    );
  }

  return cn(
    "divination-ai-markdown w-full max-w-full py-1 text-sm leading-relaxed text-card-foreground break-words",
    message.status === "error" && "text-destructive"
  );
}

function formatAIMessageCount(messages: AIChatMessage[]) {
  return `${messages.length} 条消息`;
}

function formatHistoryDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }

  return format(date, "yyyy-MM-dd HH:mm");
}

function isScrolledNearBottom(element: HTMLElement) {
  const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distanceToBottom < 32;
}
