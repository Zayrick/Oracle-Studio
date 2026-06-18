import { useEffect, useMemo, useRef, useState } from "react";
import {
  BrainIcon,
  ChevronRightIcon,
  LoaderCircleIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";

import {
  getAIMessageTextFromParts,
  type AIMessagePart,
  type AIMessageStatus,
} from "@/features/ai/timeline";
import { cn } from "@/lib/utils";

type AIMessageTimelineMessage = {
  content: string;
  parts?: AIMessagePart[];
  status?: AIMessageStatus;
};

type TimelineSegment =
  | {
      id: string;
      kind: "thinking";
      parts: Array<Extract<AIMessagePart, { type: "reasoning" | "tool" }>>;
      active: boolean;
    }
  | {
      id: string;
      kind: "text";
      text: string;
    };

export function AIMessageTimeline({
  message,
  pendingLabel,
  renderMarkdown,
}: {
  message: AIMessageTimelineMessage;
  pendingLabel: string;
  renderMarkdown: (content: string) => string;
}) {
  const segments = useMemo(() => buildTimelineSegments(message), [message]);

  if (message.status === "error") {
    return message.content;
  }

  if (segments.length === 0) {
    return message.status === "streaming" ? pendingLabel : null;
  }

  return (
    <div className="flex flex-col gap-2">
      {segments.map((segment) => {
        if (segment.kind === "thinking") {
          return (
            <ThinkingSection
              key={segment.id}
              segment={segment}
              renderMarkdown={renderMarkdown}
            />
          );
        }

        return (
          <div
            key={segment.id}
            dangerouslySetInnerHTML={{
              __html: renderMarkdown(segment.text),
            }}
          />
        );
      })}
    </div>
  );
}

function ThinkingSection({
  segment,
  renderMarkdown,
}: {
  segment: Extract<TimelineSegment, { kind: "thinking" }>;
  renderMarkdown: (content: string) => string;
}) {
  const [collapsed, setCollapsed] = useState(() => !segment.active);
  const wasActiveRef = useRef(segment.active);
  const reasoningCount = segment.parts.filter((part) => part.type === "reasoning").length;
  const toolCount = segment.parts.filter((part) => part.type === "tool").length;
  const title = segment.active
    ? "思考中"
    : formatThinkingSummary(reasoningCount, toolCount);

  useEffect(() => {
    if (segment.active) {
      setCollapsed(false);
    } else if (wasActiveRef.current) {
      setCollapsed(true);
    }

    wasActiveRef.current = segment.active;
  }, [segment.active]);

  if (!segment.active && reasoningCount === 0 && toolCount === 0) {
    return null;
  }

  return (
    <section className="text-muted-foreground">
      <button
        type="button"
        className="flex w-full items-center gap-2 py-1.5 text-left text-xs font-medium outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((current) => !current)}
      >
        <ChevronRightIcon
          aria-hidden="true"
          className={cn("size-3.5 shrink-0 transition-transform", !collapsed && "rotate-90")}
        />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {segment.active ? (
          <LoaderCircleIcon aria-hidden="true" className="size-3.5 shrink-0 animate-spin" />
        ) : null}
      </button>

      <div className={cn("overflow-hidden", collapsed && "hidden")} aria-hidden={collapsed}>
        <div className="flex flex-col gap-0 pb-1">
          {segment.parts.map((part) =>
            part.type === "reasoning" ? (
              <ReasoningItem key={part.id} part={part} renderMarkdown={renderMarkdown} />
            ) : (
              <ToolItem key={part.id} part={part} />
            )
          )}
        </div>
      </div>
    </section>
  );
}

function ReasoningItem({
  part,
  renderMarkdown,
}: {
  part: Extract<AIMessagePart, { type: "reasoning" }>;
  renderMarkdown: (content: string) => string;
}) {
  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2 py-1.5 [--reasoning-line-height:1.21875rem]">
      <span className="flex h-[var(--reasoning-line-height)] items-center justify-center">
        <span className="flex size-4 items-center justify-center rounded-full bg-muted-foreground text-background">
          <BrainIcon aria-hidden="true" className="size-3" />
        </span>
      </span>
      <div
        className="min-w-0 text-xs leading-[var(--reasoning-line-height)] break-words [&>:first-child]:mt-0 [&>:last-child]:mb-0"
        dangerouslySetInnerHTML={{
          __html: renderMarkdown(part.text),
        }}
      />
    </div>
  );
}

function ToolItem({ part }: { part: Extract<AIMessagePart, { type: "tool" }> }) {
  const [expanded, setExpanded] = useState(false);
  const failed = part.status === "error";
  const complete = part.status === "complete";
  const hasDetails = Boolean(part.arguments || part.result);

  return (
    <div className="py-1.5">
      <button
        type="button"
        className="grid w-full grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 text-left outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none"
        aria-expanded={hasDetails ? expanded : undefined}
        disabled={!hasDetails}
        onClick={() => setExpanded((current) => !current)}
      >
        <span
          className={cn(
            "flex size-4 items-center justify-center rounded-full bg-muted-foreground text-background",
            complete && "bg-success text-success-foreground",
            failed && "bg-destructive text-destructive-foreground"
          )}
        >
          {failed ? (
            <XIcon aria-hidden="true" className="size-3" />
          ) : (
            <WrenchIcon aria-hidden="true" className="size-3" />
          )}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
          <span className="truncate">{part.displayName || part.name}</span>
          {part.status === "running" ? (
            <LoaderCircleIcon aria-hidden="true" className="size-3 animate-spin text-muted-foreground" />
          ) : null}
          {hasDetails ? (
            <ChevronRightIcon
              aria-hidden="true"
              className={cn("ml-auto size-3 shrink-0 transition-transform", expanded && "rotate-90")}
            />
          ) : null}
        </span>
      </button>
      {expanded ? (
        <div className="mt-1 grid grid-cols-[1rem_minmax(0,1fr)] gap-2">
          <span aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-1 text-[11px] leading-relaxed text-muted-foreground">
            {part.arguments ? (
              <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words">
                {formatToolArguments(part.arguments)}
              </pre>
            ) : null}
            {part.result ? (
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words">
                {part.result}
              </pre>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildTimelineSegments(message: AIMessageTimelineMessage) {
  const sourceParts = getTimelineSourceParts(message);
  const segments: TimelineSegment[] = [];
  let thinkingParts: Array<Extract<AIMessagePart, { type: "reasoning" | "tool" }>> = [];
  let thinkingIndex = 0;
  let textIndex = 0;

  const flushThinking = (active: boolean) => {
    if (thinkingParts.length === 0) {
      return;
    }

    thinkingIndex += 1;
    segments.push({
      id: `thinking-${thinkingIndex}`,
      kind: "thinking",
      parts: thinkingParts,
      active,
    });
    thinkingParts = [];
  };

  for (const part of sourceParts) {
    if (part.type === "text") {
      flushThinking(false);
      textIndex += 1;
      segments.push({
        id: `text-${textIndex}`,
        kind: "text",
        text: part.text,
      });
      continue;
    }

    thinkingParts.push(part);
  }

  flushThinking(message.status === "streaming");

  return segments;
}

function getTimelineSourceParts(message: AIMessageTimelineMessage) {
  if (!message.parts?.length) {
    return message.content
      ? ([{ id: "legacy-text", type: "text", text: message.content }] satisfies AIMessagePart[])
      : [];
  }

  const textFromParts = getAIMessageTextFromParts(message.parts);

  if (!message.content || message.content === textFromParts) {
    return message.parts;
  }

  return [
    ...message.parts,
    {
      id: "content-fallback",
      type: "text",
      text: message.content,
    } satisfies AIMessagePart,
  ];
}

function formatThinkingSummary(reasoningCount: number, toolCount: number) {
  const parts = [];

  if (reasoningCount > 0) {
    parts.push(`${reasoningCount} 段思考`);
  }

  if (toolCount > 0) {
    parts.push(`${toolCount} 次工具调用`);
  }

  return parts.join("，") || "思考过程";
}

function formatToolArguments(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
