import type { ReactNode } from "react";
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  SparklesIcon,
} from "lucide-react";

import { TransitionBackLink } from "@/components/route-transition-link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type DivinationCopyStatus = "idle" | "copied" | "error";

type DivinationResultFrame = {
  ariaLabel: string;
  content: ReactNode;
  contentClassName?: string;
  pageClassName?: string;
  restartHref?: string;
  restartLabel?: string;
  onRestart?: () => void;
  copy?: {
    status: DivinationCopyStatus;
    onCopy: () => void;
    ariaLabel?: string;
    errorLabel?: string;
  };
  ai?: {
    open: boolean;
    onToggle: () => void;
    panel: ReactNode;
  };
};

export function DivinationPageFrame({
  form,
  homeHref = "/",
  homeLabel = "返回主页",
  result,
}: {
  form: {
    title: string;
    description?: string;
    content: ReactNode;
  };
  homeHref?: string;
  homeLabel?: string;
  result?: DivinationResultFrame;
}) {
  if (!result) {
    return (
      <div className="container relative mx-auto flex min-h-dvh items-center px-4 pb-[calc(4rem+var(--mobile-safe-bottom))] pt-[calc(var(--mobile-safe-top)+4rem)] md:py-20 lg:py-10">
        <TransitionBackLink
          to={homeHref}
          prefetch="intent"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "fixed left-4 top-[calc(var(--mobile-safe-top)+1rem)] z-20 md:hidden"
          )}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          {homeLabel}
        </TransitionBackLink>

        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:gap-8">
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">{form.title}</h1>
            {form.description ? (
              <p className="text-sm text-muted-foreground">{form.description}</p>
            ) : null}
          </div>

          <div className="divination-transition-content">{form.content}</div>
        </div>
      </div>
    );
  }

  const aiOpen = Boolean(result.ai?.open);

  return (
    <div className="relative mx-auto flex h-dvh min-h-0 w-full flex-col overflow-hidden px-4 md:px-0">
      <div className="divination-eased-header pointer-events-none fixed inset-x-0 top-0 z-20 h-[calc(var(--mobile-safe-top)+4rem)] md:hidden">
        <div className="pointer-events-auto absolute left-4 right-4 top-[calc(var(--mobile-safe-top)+1rem)]">
          <DivinationResultActions
            aiOpen={aiOpen}
            copy={result.copy}
            layout="mobile"
            restartHref={result.restartHref}
            restartLabel={result.restartLabel}
            onAIToggle={result.ai?.onToggle}
            onRestart={result.onRestart}
          />
        </div>
      </div>

      <section
        className="divination-transition-content flex min-h-0 w-full flex-1 flex-col"
        aria-label={result.ariaLabel}
      >
        <div className="divination-eased-header fixed inset-x-0 top-0 z-20 hidden h-16 md:left-[224px] md:flex md:items-center">
          <div className="mx-auto flex w-full max-w-[96rem] px-6 lg:px-8">
            <DivinationResultActions
              aiOpen={aiOpen}
              copy={result.copy}
              layout="desktop"
              restartHref={result.restartHref}
              restartLabel={result.restartLabel}
              onAIToggle={result.ai?.onToggle}
              onRestart={result.onRestart}
            />
          </div>
        </div>

        <div className="flex h-full min-h-0 w-full flex-1 flex-col">
          <div
            className={cn(
              "mx-auto flex w-full flex-1 flex-col max-lg:relative max-lg:h-full max-lg:min-h-0 max-lg:overflow-hidden lg:grid lg:h-full lg:min-h-0 lg:max-w-[96rem] lg:overflow-hidden",
              aiOpen ? "divination-result-grid-open" : "divination-result-grid-closed"
            )}
          >
            <div
              className={cn(
                "divination-mobile-result-page min-w-0 max-lg:absolute max-lg:inset-0 max-lg:overflow-y-auto max-lg:overscroll-y-contain max-lg:pb-[max(1rem,var(--mobile-safe-bottom))] max-lg:pt-[calc(var(--mobile-safe-top)+4rem)] lg:flex lg:h-full lg:min-h-0 lg:overflow-y-auto lg:px-8 lg:pb-8 lg:pt-24",
                aiOpen && "divination-mobile-result-page-open",
                result.pageClassName
              )}
            >
              <div className={cn("w-full", result.contentClassName)}>
                {result.content}
              </div>
            </div>

            {result.ai ? (
              <>
                <Separator
                  orientation="vertical"
                  className={cn(
                    "divination-result-divider hidden lg:mt-16 lg:h-[calc(100%-4rem)]",
                    aiOpen ? "divination-result-divider-open lg:block" : "divination-result-divider-closed lg:block"
                  )}
                />
                {result.ai.panel}
              </>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function DivinationResultActions({
  aiOpen,
  copy,
  layout,
  restartHref,
  restartLabel = "重新开始",
  onAIToggle,
  onRestart,
}: {
  aiOpen: boolean;
  copy?: DivinationResultFrame["copy"];
  layout: "mobile" | "desktop";
  restartHref?: string;
  restartLabel?: string;
  onAIToggle?: () => void;
  onRestart?: () => void;
}) {
  const compact = layout === "mobile";
  const showAI = Boolean(onAIToggle);

  return (
    <div
      className={cn(
        "flex w-full max-w-full items-center justify-between gap-2",
        !compact && "gap-3"
      )}
    >
      {restartHref ? (
        <TransitionBackLink
          to={restartHref}
          prefetch="viewport"
          className={cn(
            buttonVariants({
              variant: "outline",
              size: compact ? "sm" : "default",
            })
          )}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          {restartLabel}
        </TransitionBackLink>
      ) : (
        <Button
          type="button"
          variant="outline"
          size={compact ? "sm" : "default"}
          onClick={onRestart}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          {restartLabel}
        </Button>
      )}

      {copy || showAI ? (
        <div className="ml-auto flex items-center gap-2">
          {aiOpen ? (
            <div
              className="flex items-center gap-2"
              data-divination-ai-actions
            />
          ) : null}

          {copy && !aiOpen ? (
            <>
              <Button
                type="button"
                variant="outline"
                size={compact ? "icon-sm" : "icon"}
                aria-label={copy.status === "copied" ? "已复制排盘结果" : copy.ariaLabel ?? "复制排盘结果"}
                onClick={copy.onCopy}
              >
                {copy.status === "copied" ? (
                  <CheckIcon data-icon="inline-start" />
                ) : (
                  <CopyIcon data-icon="inline-start" />
                )}
              </Button>
              {copy.status === "error" ? (
                <span className="text-xs text-destructive">{copy.errorLabel ?? "复制失败"}</span>
              ) : null}
            </>
          ) : null}

          {showAI ? (
            <Button
              type="button"
              size={compact ? "sm" : "default"}
              aria-expanded={aiOpen}
              onClick={onAIToggle}
            >
              <SparklesIcon data-icon="inline-start" />
              {aiOpen ? "收起AI" : "询问AI"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
