import { useEffect, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { ArrowLeftIcon, ArrowUpIcon, SparklesIcon } from "lucide-react";
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
          title={formatBaziAITitle(paipan)}
          tabIndex={open ? 0 : -1}
          variant="mobile"
        />
      </section>
    </>
  );
}

function BaziAIPanelContent({
  title,
  tabIndex,
  variant,
}: {
  title: string;
  tabIndex: 0 | -1;
  variant: "desktop" | "mobile";
}) {
  const mobile = variant === "mobile";
  const messageInputId = mobile ? "bazi-ai-message-mobile" : "bazi-ai-message-desktop";

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
      </div>

      <div className="h-full min-h-0">
        <ScrollArea className="h-full min-h-0" aria-live="polite" aria-label="询问AI消息">
          <div className={cn("flex min-h-full flex-col justify-end gap-3 py-4", mobile ? "px-0" : "px-5")} />
        </ScrollArea>
      </div>

      <form
        className={cn(mobile ? "border-t py-3" : "px-5 pb-5 pt-3")}
        onSubmit={(event) => event.preventDefault()}
      >
        <FieldGroup className="gap-0">
          <Field orientation="horizontal" className="items-center gap-2">
            <FieldLabel htmlFor={messageInputId} className="sr-only">追问内容</FieldLabel>
            <Input
              id={messageInputId}
              disabled
              tabIndex={tabIndex}
              placeholder="AI 解盘暂未接入"
            />
            <Button
              type="button"
              size="icon"
              aria-label="发送追问"
              disabled
              tabIndex={tabIndex}
            >
              <ArrowUpIcon />
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
