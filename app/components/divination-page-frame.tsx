import type { ReactNode } from "react";
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  SparklesIcon,
} from "lucide-react";
import { Link } from "react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type DivinationCopyStatus = "idle" | "copied" | "error";

export type DivinationResultFrame = {
  ariaLabel: string;
  content: ReactNode;
  contentClassName?: string;
  pageClassName?: string;
  restartLabel?: string;
  onRestart: () => void;
  copy?: {
    visible?: boolean;
    status: DivinationCopyStatus;
    onCopy: () => void;
    ariaLabel?: string;
    errorLabel?: string;
  };
  ai?: {
    visible?: boolean;
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
      <div className="container relative mx-auto flex min-h-svh items-center px-4 py-16 md:py-20 lg:py-10">
        <Link
          to={homeHref}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "fixed left-4 top-4 z-20 md:hidden"
          )}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          {homeLabel}
        </Link>

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

  const aiEnabled = Boolean(result.ai && result.ai.visible !== false);
  const aiOpen = Boolean(aiEnabled && result.ai?.open);

  return (
    <div className="relative mx-auto flex h-svh min-h-0 w-full overflow-hidden px-4 pb-0 pt-16 md:px-0 md:pt-0">
      <div className="fixed left-4 right-4 top-4 z-20 md:hidden">
        <DivinationResultActions
          aiOpen={aiOpen}
          copy={result.copy}
          layout="mobile"
          restartLabel={result.restartLabel}
          onAIToggle={aiEnabled ? result.ai?.onToggle : undefined}
          onRestart={result.onRestart}
        />
      </div>

      <section
        className="divination-transition-content flex h-full min-h-0 w-full flex-col"
        aria-label={result.ariaLabel}
      >
        <div className="fixed inset-x-0 top-0 z-20 hidden h-16 border-b bg-background/95 backdrop-blur md:left-[224px] md:flex md:items-center">
          <div className="mx-auto flex w-full max-w-[96rem] px-6 lg:px-8">
            <DivinationResultActions
              aiOpen={aiOpen}
              copy={result.copy}
              layout="desktop"
              restartLabel={result.restartLabel}
              onAIToggle={aiEnabled ? result.ai?.onToggle : undefined}
              onRestart={result.onRestart}
            />
          </div>
        </div>

        <div className="flex h-full min-h-0 w-full flex-1 flex-col md:pt-16">
          <div
            className={cn(
              "mx-auto flex w-full flex-1 flex-col max-lg:relative max-lg:h-full max-lg:min-h-0 max-lg:overflow-hidden lg:h-full lg:min-h-0 lg:overflow-hidden",
              aiOpen
                ? "divination-result-grid-open max-lg:h-full max-lg:min-h-0 lg:grid lg:max-w-[96rem]"
                : "divination-result-grid-closed lg:grid lg:max-w-[96rem]"
            )}
          >
            <div
              className={cn(
                "divination-mobile-result-page min-w-0 max-lg:absolute max-lg:inset-0 max-lg:overflow-y-auto max-lg:pb-6 lg:flex lg:h-full lg:min-h-0 lg:overflow-y-auto lg:px-8 lg:py-8",
                aiOpen ? "divination-mobile-result-page-open" : "divination-mobile-result-page-closed",
                !aiOpen && "lg:w-full",
                result.pageClassName
              )}
            >
              <div className={cn("w-full", result.contentClassName)}>
                {result.content}
              </div>
            </div>

            {aiEnabled ? (
              <>
                <Separator
                  orientation="vertical"
                  className={cn(
                    "divination-result-divider hidden",
                    aiOpen ? "divination-result-divider-open lg:block" : "divination-result-divider-closed lg:block"
                  )}
                />
                {result.ai!.panel}
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
  restartLabel = "重新开始",
  onAIToggle,
  onRestart,
}: {
  aiOpen: boolean;
  copy?: DivinationResultFrame["copy"];
  layout: "mobile" | "desktop";
  restartLabel?: string;
  onAIToggle?: () => void;
  onRestart: () => void;
}) {
  const compact = layout === "mobile";
  const showCopy = Boolean(copy && copy.visible !== false);
  const showAI = Boolean(onAIToggle);

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
        onClick={onRestart}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        {restartLabel}
      </Button>

      {showCopy || showAI ? (
        <div className="ml-auto flex items-center gap-2">
          {showCopy ? (
            <>
              <Button
                type="button"
                variant="outline"
                size={compact ? "icon-sm" : "icon"}
                aria-label={copy!.status === "copied" ? "已复制排盘结果" : copy!.ariaLabel ?? "复制排盘结果"}
                onClick={copy!.onCopy}
              >
                {copy!.status === "copied" ? <CheckIcon /> : <CopyIcon />}
              </Button>
              {copy!.status === "error" ? (
                <span className="text-xs text-destructive">{copy!.errorLabel ?? "复制失败"}</span>
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
