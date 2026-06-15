import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { format } from "date-fns";
import { ArrowLeftIcon, ArrowUpIcon, CheckIcon, ChevronDownIcon, CopyIcon, CornerLeftUpIcon, SparklesIcon } from "lucide-react";
import type { Route } from "./+types/liuyao";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { TimePicker } from "@/components/time-picker";
import {
  buildLiuyaoPaipan,
  YAO_NAMES,
  type LiuyaoInputYao,
  type LiuyaoLineInfo,
  type LiuyaoPaipan,
  type YaoType,
} from "@/features/liuyao/paipan";
import { cn } from "@/lib/utils";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "六爻 - 占卜大师" },
    { name: "description", content: "六爻占卜" },
  ];
}

const YAO_INDEXES_TOP_DOWN = [5, 4, 3, 2, 1, 0];
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type CopyElementName = LiuyaoLineInfo["element"];
type CopyRelative = LiuyaoLineInfo["relation"];
type CopyStemBasis = "yearStem" | "dayStem";
type CopyBranchBasis = "yearBranch" | "dayBranch";
type CopyTargetToken = { type: "stem" | "branch"; name: string };

const COPY_BRANCH_ORDER = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

const COPY_BRANCH_ELEMENTS: Record<string, CopyElementName> = {
  子: "水",
  丑: "土",
  寅: "木",
  卯: "木",
  辰: "土",
  巳: "火",
  午: "火",
  未: "土",
  申: "金",
  酉: "金",
  戌: "土",
  亥: "水",
};

const COPY_GENERATES: Record<CopyElementName, CopyElementName> = {
  木: "火",
  火: "土",
  土: "金",
  金: "水",
  水: "木",
};

const COPY_CONTROLS: Record<CopyElementName, CopyElementName> = {
  木: "土",
  土: "水",
  水: "火",
  火: "金",
  金: "木",
};

const COPY_BRANCH_OPPOSITES: Record<string, string> = {
  子: "午",
  丑: "未",
  寅: "申",
  卯: "酉",
  辰: "戌",
  巳: "亥",
  午: "子",
  未: "丑",
  申: "寅",
  酉: "卯",
  戌: "辰",
  亥: "巳",
};

const COPY_BRANCH_COMBINES: Record<string, string> = {
  子: "丑",
  丑: "子",
  寅: "亥",
  亥: "寅",
  卯: "戌",
  戌: "卯",
  辰: "酉",
  酉: "辰",
  巳: "申",
  申: "巳",
  午: "未",
  未: "午",
};

const COPY_CHANGSHENG_BY_ELEMENT: Record<CopyElementName, Record<string, string>> = {
  木: { 亥: "长生", 子: "沐浴", 丑: "冠带", 寅: "临官", 卯: "帝旺", 辰: "衰", 巳: "病", 午: "死", 未: "墓", 申: "绝", 酉: "胎", 戌: "养" },
  火: { 寅: "长生", 卯: "沐浴", 辰: "冠带", 巳: "临官", 午: "帝旺", 未: "衰", 申: "病", 酉: "死", 戌: "墓", 亥: "绝", 子: "胎", 丑: "养" },
  土: { 申: "长生", 酉: "沐浴", 戌: "冠带", 亥: "临官", 子: "帝旺", 丑: "衰", 寅: "病", 卯: "死", 辰: "墓", 巳: "绝", 午: "胎", 未: "养" },
  金: { 巳: "长生", 午: "沐浴", 未: "冠带", 申: "临官", 酉: "帝旺", 戌: "衰", 亥: "病", 子: "死", 丑: "墓", 寅: "绝", 卯: "胎", 辰: "养" },
  水: { 申: "长生", 酉: "沐浴", 戌: "冠带", 亥: "临官", 子: "帝旺", 丑: "衰", 寅: "病", 卯: "死", 辰: "墓", 巳: "绝", 午: "胎", 未: "养" },
};

const COPY_STEM_BRANCH_SHENSHA_RULES: Array<{
  name: string;
  basis: CopyStemBasis[];
  targets: Record<string, string[]>;
}> = [
  {
    name: "天乙贵人",
    basis: ["yearStem", "dayStem"],
    targets: {
      甲: ["丑", "未"],
      戊: ["丑", "未"],
      庚: ["丑", "未"],
      乙: ["子", "申"],
      己: ["子", "申"],
      丙: ["亥", "酉"],
      丁: ["亥", "酉"],
      壬: ["卯", "巳"],
      癸: ["卯", "巳"],
      辛: ["寅", "午"],
    },
  },
  {
    name: "文昌贵人",
    basis: ["yearStem", "dayStem"],
    targets: {
      甲: ["巳"],
      乙: ["午"],
      丙: ["申"],
      丁: ["酉"],
      戊: ["申"],
      己: ["酉"],
      庚: ["亥"],
      辛: ["子"],
      壬: ["寅"],
      癸: ["卯"],
    },
  },
  {
    name: "羊刃",
    basis: ["dayStem"],
    targets: {
      甲: ["卯"],
      乙: ["寅"],
      丙: ["午"],
      丁: ["巳"],
      戊: ["午"],
      己: ["巳"],
      庚: ["酉"],
      辛: ["申"],
      壬: ["子"],
      癸: ["亥"],
    },
  },
  {
    name: "禄神",
    basis: ["dayStem"],
    targets: {
      甲: ["寅"],
      乙: ["卯"],
      丙: ["巳"],
      丁: ["午"],
      戊: ["巳"],
      己: ["午"],
      庚: ["申"],
      辛: ["酉"],
      壬: ["亥"],
      癸: ["子"],
    },
  },
];

const COPY_BRANCH_GROUP_SHENSHA_RULES: Array<{
  name: string;
  basis: CopyBranchBasis[];
  targetsByGroup: Record<string, string>;
}> = [
  { name: "桃花/咸池", basis: ["yearBranch", "dayBranch"], targetsByGroup: { 申子辰: "酉", 寅午戌: "卯", 巳酉丑: "午", 亥卯未: "子" } },
  { name: "驿马", basis: ["yearBranch", "dayBranch"], targetsByGroup: { 申子辰: "寅", 寅午戌: "申", 巳酉丑: "亥", 亥卯未: "巳" } },
  { name: "华盖", basis: ["yearBranch", "dayBranch"], targetsByGroup: { 申子辰: "辰", 寅午戌: "戌", 巳酉丑: "丑", 亥卯未: "未" } },
  { name: "劫煞", basis: ["yearBranch", "dayBranch"], targetsByGroup: { 申子辰: "巳", 寅午戌: "亥", 巳酉丑: "寅", 亥卯未: "申" } },
  { name: "将星", basis: ["yearBranch", "dayBranch"], targetsByGroup: { 申子辰: "子", 寅午戌: "午", 巳酉丑: "酉", 亥卯未: "卯" } },
];

const COPY_MONTH_BRANCH_SHENSHA_RULES: Array<{
  name: string;
  targets: Record<string, CopyTargetToken[]>;
}> = [
  {
    name: "天德贵人",
    targets: {
      寅: [{ type: "stem", name: "丁" }],
      卯: [{ type: "branch", name: "申" }],
      辰: [{ type: "stem", name: "壬" }],
      巳: [{ type: "stem", name: "辛" }],
      午: [{ type: "branch", name: "亥" }],
      未: [{ type: "stem", name: "甲" }],
      申: [{ type: "stem", name: "癸" }],
      酉: [{ type: "branch", name: "寅" }],
      戌: [{ type: "stem", name: "丙" }],
      亥: [{ type: "stem", name: "乙" }],
      子: [{ type: "branch", name: "巳" }],
      丑: [{ type: "stem", name: "庚" }],
    },
  },
  {
    name: "月德贵人",
    targets: {
      寅: [{ type: "stem", name: "丙" }],
      午: [{ type: "stem", name: "丙" }],
      戌: [{ type: "stem", name: "丙" }],
      申: [{ type: "stem", name: "壬" }],
      子: [{ type: "stem", name: "壬" }],
      辰: [{ type: "stem", name: "壬" }],
      亥: [{ type: "stem", name: "甲" }],
      卯: [{ type: "stem", name: "甲" }],
      未: [{ type: "stem", name: "甲" }],
      巳: [{ type: "stem", name: "庚" }],
      酉: [{ type: "stem", name: "庚" }],
      丑: [{ type: "stem", name: "庚" }],
    },
  },
];

type ViewTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void) => ViewTransition;
};

function runLiuyaoViewTransition(update: () => void) {
  if (typeof document === "undefined") {
    update();
    return;
  }

  const viewTransitionDocument = document as ViewTransitionDocument;

  if (!viewTransitionDocument.startViewTransition) {
    update();
    return;
  }

  document.documentElement.dataset.liuyaoTransition = "active";

  const transition = viewTransitionDocument.startViewTransition(() => {
    flushSync(update);
  });

  transition.finished.finally(() => {
    delete document.documentElement.dataset.liuyaoTransition;
  });
}

export default function Liuyao() {
  const [question, setQuestion] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const [date, setDate] = useState<Date>(new Date());
  const [time, setTime] = useState(
    format(new Date(), "HH:mm:ss")
  );

  const [yaos, setYaos] = useState<LiuyaoInputYao[]>(
    Array.from({ length: 6 }, () => ({ type: "阳", moving: false }))
  );
  const [result, setResult] = useState<LiuyaoPaipan | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [error, setError] = useState("");

  const handleSetNow = () => {
    const now = new Date();
    setDate(now);
    setTime(format(now, "HH:mm:ss"));
  };

  const toggleYaoType = (index: number) => {
    setYaos((prev) =>
      prev.map((yao, i) =>
        i === index
          ? { ...yao, type: yao.type === "阳" ? "阴" : "阳" }
          : yao
      )
    );
  };

  const toggleYaoMoving = (index: number) => {
    setYaos((prev) =>
      prev.map((yao, i) =>
        i === index ? { ...yao, moving: !yao.moving } : yao
      )
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const nextResult = buildLiuyaoPaipan({ question, date, time, yaos });

      runLiuyaoViewTransition(() => {
        setResult(nextResult);
        setAiPanelOpen(false);
      });
    } catch (err) {
      setResult(null);
      setAiPanelOpen(false);
      setError(err instanceof Error ? err.message : "排盘失败，请检查输入。");
    }
  };

  const handleStartOver = () => {
    runLiuyaoViewTransition(() => {
      setResult(null);
      setAiPanelOpen(false);
      setError("");
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 lg:py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:gap-8">
        {!result ? (
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">六爻排盘</h1>
            <p className="text-sm text-muted-foreground">本卦、变卦、纳甲、六亲、六神与旬空</p>
          </div>
        ) : null}

        <div className="liuyao-transition-content">
          {result ? (
            <div
              className={cn(
                "liuyao-ai-motion flex w-full flex-col lg:mx-auto lg:w-fit lg:flex-row lg:items-stretch lg:justify-center lg:gap-0",
                aiPanelOpen ? "liuyao-ai-layout-open" : "liuyao-ai-layout-closed"
              )}
            >
              <PaipanResult
                result={result}
                aiPanelOpen={aiPanelOpen}
                onToggleAiPanel={() => setAiPanelOpen((open) => !open)}
                onStartOver={handleStartOver}
              />
              <AIDivinationPanel
                open={aiPanelOpen}
                onClose={() => setAiPanelOpen(false)}
              />
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="mx-auto flex w-full max-w-md flex-col gap-5 text-card-foreground animate-in fade-in-0 slide-in-from-bottom-3 duration-300 lg:gap-6"
            >
            <Field>
              <FieldLabel htmlFor="question">所问之事</FieldLabel>
              <Input
                id="question"
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="请输入您要占问的事情"
                required
              />
            </Field>

            <div className="flex flex-col gap-2">
              <FieldLabel className="block">占问时间</FieldLabel>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <FieldGroup className="flex-row">
                  <Field>
                    <FieldLabel htmlFor="date-picker">日期</FieldLabel>
                    <Popover open={dateOpen} onOpenChange={setDateOpen}>
                      <PopoverTrigger
                        render={
                          <Button
                            variant="outline"
                            id="date-picker"
                            className="w-40 justify-between font-normal"
                          >
                            {date ? format(date, "yyyy年MM月dd日") : "选择日期"}
                            <ChevronDownIcon data-icon="inline-end" />
                          </Button>
                        }
                      />
                      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={date}
                          captionLayout="dropdown"
                          defaultMonth={date}
                          onSelect={(selectedDate) => {
                            if (selectedDate) {
                              setDate(selectedDate);
                              setDateOpen(false);
                            }
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="time-picker">时间</FieldLabel>
                    <TimePicker
                      id="time-picker"
                      value={time}
                      onChange={setTime}
                    />
                  </Field>
                </FieldGroup>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSetNow}
                  className="mb-[1px]"
                >
                  现在
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <FieldLabel className="block">所得之卦</FieldLabel>
              <div className="flex flex-col gap-1.5 rounded-lg bg-muted/40 p-2 [--liuyao-yao-gap:clamp(0.35rem,1vw,0.75rem)] [--liuyao-yao-width:100%] lg:gap-2 lg:p-3">
                {YAO_INDEXES_TOP_DOWN.map((index) => {
                  const yao = yaos[index];

                  return (
                  <div
                    key={index}
                    className="grid grid-cols-[3rem_minmax(0,1fr)_3.25rem] items-center gap-10 lg:grid-cols-[3.5rem_9rem_3.5rem] lg:justify-center lg:gap-5"
                  >
                    <div className="text-right text-xs font-medium lg:text-sm">
                      {YAO_NAMES[index]}
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleYaoType(index)}
                      className="relative flex h-9 w-full cursor-pointer items-center justify-center rounded-md hover:bg-background/70 lg:h-10"
                    >
                      <YaoGlyph type={yao.type} />
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleYaoMoving(index)}
                      className={cn(
                        "flex h-8 items-center justify-center rounded-md border text-xs font-medium transition-colors lg:h-9 lg:text-sm",
                        yao.moving
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-muted"
                      )}
                    >
                      {yao.type === "阳"
                        ? yao.moving ? "老阳" : "少阳"
                        : yao.moving ? "老阴" : "少阴"}
                    </button>
                  </div>
                  );
                })}
              </div>
            </div>

            {error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div className="flex justify-center pt-1">
              <Button type="submit" size="lg" className="w-full max-w-xs">
                开始排盘
              </Button>
            </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function PaipanResult({
  result,
  aiPanelOpen,
  onToggleAiPanel,
  onStartOver,
}: {
  result: LiuyaoPaipan;
  aiPanelOpen: boolean;
  onToggleAiPanel: () => void;
  onStartOver: () => void;
}) {
  const showChangedColumns = Boolean(result.changed);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(formatLiuyaoCopyMarkdown(result));
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 1600);
    } catch {
      setCopyStatus("error");
      window.setTimeout(() => setCopyStatus("idle"), 2200);
    }
  };

  return (
    <section className="flex w-full flex-col gap-4 text-card-foreground animate-in fade-in-0 slide-in-from-bottom-3 duration-300 sm:gap-6 lg:w-fit lg:max-w-full lg:flex-none">
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={onStartOver}>
          <ArrowLeftIcon data-icon="inline-start" />
          再起一卦
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" aria-label={copyStatus === "copied" ? "已复制排盘结果" : "复制排盘结果"} onClick={handleCopy}>
            {copyStatus === "copied" ? <CheckIcon /> : <CopyIcon />}
          </Button>
          {copyStatus === "error" ? <span className="text-xs text-destructive">复制失败</span> : null}
          <Button type="button" aria-expanded={aiPanelOpen} onClick={onToggleAiPanel}>
            <SparklesIcon data-icon="inline-start" />
            AI 解卦
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-stretch lg:justify-between lg:gap-10">
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 sm:gap-4 lg:w-max lg:max-w-[36rem] lg:flex-none">
          <div className="flex flex-col gap-2">
            <div className="text-xs text-muted-foreground">{result.solar}</div>
            <AutoFitQuestionText>{result.question}</AutoFitQuestionText>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {formatHexagramName(result.primary)}
              {result.changed ? ` 之 ${formatHexagramName(result.changed)}` : ""}
            </h2>
            <PillarTimeSummary result={result} />
          </div>
        </div>

        <ShenshaPanel result={result} />
      </div>

      <Separator />

      <div className="overflow-x-auto">
        <table
          className={cn(
            "border-collapse text-xs leading-tight [--liuyao-cell-x:0.125rem] [--liuyao-yao-gap:clamp(0.25rem,1.5vw,0.75rem)] [--liuyao-yao-width:clamp(2rem,calc((100vw_-_15.5rem)/2),4.5rem)] sm:text-base sm:[--liuyao-cell-x:0.5rem] sm:[--liuyao-yao-gap:0.75rem] sm:[--liuyao-yao-width:5rem] lg:mx-auto lg:w-max lg:min-w-0 lg:[--liuyao-cell-x:0.375rem]",
            showChangedColumns ? "w-full min-w-0 sm:min-w-[720px]" : "mx-auto w-max min-w-0 sm:min-w-[440px]"
          )}
        >
          <thead className="text-muted-foreground">
            <tr>
              <td className="px-[var(--liuyao-cell-x)] py-0.5 sm:py-1" aria-hidden="true" />
              <td className="px-[var(--liuyao-cell-x)] py-0.5 sm:py-1" aria-hidden="true" />
              <th className="px-[var(--liuyao-cell-x)] py-0.5 text-center font-medium sm:py-1 lg:w-[clamp(7rem,11vw,10rem)]" scope="col">
                <HexagramTableHeading hexagram={result.primary} fallback="本卦" />
              </th>
              <td className="px-[var(--liuyao-cell-x)] py-0.5 sm:py-1" aria-hidden="true" />
              {showChangedColumns ? (
                <>
                  <td className="px-[var(--liuyao-cell-x)] py-0.5 sm:py-1" aria-hidden="true" />
                  <td className="px-[var(--liuyao-cell-x)] py-0.5 sm:py-1" aria-hidden="true" />
                  <th className="px-[var(--liuyao-cell-x)] py-0.5 text-center font-medium sm:py-1 lg:w-[clamp(7rem,11vw,10rem)]" scope="col">
                    <HexagramTableHeading hexagram={result.changed} fallback="变卦" />
                  </th>
                  <td className="px-[var(--liuyao-cell-x)] py-0.5 sm:py-1" aria-hidden="true" />
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {[...result.lines].reverse().map((line) => (
              <PaipanLineRow
                key={line.position}
                line={line}
                showChangedColumns={showChangedColumns}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AIDivinationPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
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

  useEffect(() => {
    if (!open || !window.matchMedia("(max-width: 1023px)").matches) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  return (
    <>
      <aside
        aria-hidden={!open}
        className={cn(
          "liuyao-ai-motion hidden min-h-full w-[23rem] shrink-0 overflow-hidden rounded-2xl border bg-card shadow-sm lg:block lg:self-stretch",
          open ? "liuyao-ai-panel-open" : "liuyao-ai-panel-closed"
        )}
      >
        <AIDivinationPanelContent
          message={message}
          onClose={onClose}
          onMessageChange={setMessage}
          onSubmit={handleSubmit}
          tabIndex={open ? 0 : -1}
        />
      </aside>
      <div
        aria-hidden={!open}
        className={cn("fixed inset-x-0 bottom-0 top-14 z-40 lg:hidden", open ? "pointer-events-auto" : "pointer-events-none")}
      >
        <button
          type="button"
          aria-label="关闭 AI 解卦"
          tabIndex={open ? 0 : -1}
          className="absolute inset-0 bg-transparent"
          onClick={onClose}
        />
        <section
          role="dialog"
          aria-modal="true"
          aria-label="AI 解卦"
          className={cn(
            "liuyao-ai-motion absolute inset-x-0 bottom-0 top-8 overflow-hidden rounded-t-2xl border bg-card shadow-lg",
            open ? "liuyao-ai-sheet-open" : "liuyao-ai-sheet-closed"
          )}
        >
          <AIDivinationPanelContent
            message={message}
            onClose={onClose}
            onMessageChange={setMessage}
            onSubmit={handleSubmit}
            tabIndex={open ? 0 : -1}
          />
        </section>
      </div>
    </>
  );
}

function AIDivinationPanelContent({
  message,
  onClose,
  onMessageChange,
  onSubmit,
  tabIndex,
}: {
  message: string;
  onClose: () => void;
  onMessageChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  tabIndex: 0 | -1;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="关闭 AI 解卦"
          tabIndex={tabIndex}
          onClick={onClose}
        >
          <ArrowLeftIcon />
        </Button>
        <div className="text-sm font-medium">AI 解卦</div>
        <div className="size-8" aria-hidden="true" />
      </div>

      <div className="min-h-0 flex-1" />

      <form className="border-t p-3" onSubmit={onSubmit}>
        <div className="flex items-center gap-2">
          <Input
            value={message}
            tabIndex={tabIndex}
            onChange={(event) => onMessageChange(event.target.value)}
            placeholder="输入想追问的内容"
          />
          <Button type="submit" size="icon" aria-label="发送追问" tabIndex={tabIndex} disabled={!message.trim()}>
            <ArrowUpIcon />
          </Button>
        </div>
      </form>
    </div>
  );
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command failed");
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

function formatLiuyaoCopyMarkdown(result: LiuyaoPaipan) {
  const changed = result.changed ?? result.primary;
  const movingLines = result.lines.filter((line) => line.moving);

  return joinCopySections([
    [
      `所问之事：${result.question}`,
      `时间：${result.solar}`,
      `干支:${result.pillars.year}年 ${result.pillars.month}月 ${result.pillars.day}日 ${result.pillars.hour}时`,
      `空亡：年空亡${result.pillarVoids.year} 月空亡${result.pillarVoids.month} 日空亡${result.pillarVoids.day} 时空亡${result.pillarVoids.hour}`,
      `卦身：${formatCopyGuaBody(result)}；世身：${formatCopyWorldBody(result)}`,
      `动爻：${movingLines.length > 0 ? movingLines.map((line) => line.label).join("、") : "无（静卦）"}`,
    ].join("\n"),
    formatLiuyaoCopyCombinedTable(result, changed),
  ]);
}

function formatLiuyaoCopyCombinedTable(
  result: LiuyaoPaipan,
  changed: LiuyaoPaipan["primary"]
) {
  const primary = result.primary;

  return joinCopySections([
    `主卦/变卦：${primary.name} → ${changed.name}（主卦${primary.palace}${primary.palaceElement}，${primary.stage}，世在${YAO_NAMES[primary.worldPosition - 1]}，应在${YAO_NAMES[primary.responsePosition - 1]}；变卦六亲沿用主卦卦宫五行）`,
    copyMdTable(
      ["爻位", "六神", "世应", "主卦六亲", "主卦干支", "伏神", "是否变卦", "主卦神煞", "主卦长生", "变卦六亲", "变卦干支", "变卦神煞", "变卦长生"],
      [...result.lines]
        .sort((a, b) => b.position - a.position)
        .map((line) => {
          const changedLine = line.changed ?? line;

          return [
            `${line.label} ${line.type === "阳" ? "━━━ 阳" : "━ ━ 阴"}`,
            line.deity,
            line.role,
            line.relation,
            formatCopyStemBranch(line),
            formatCopyHiddenGods(line.hiddenGods),
            line.moving ? "是" : "-",
            formatCopyLineShensha(result, line),
            formatCopyLineChangsheng(result, line.element),
            copyRelationFor(primary.palaceElement, changedLine.element),
            formatCopyStemBranch(changedLine),
            formatCopyLineShensha(result, changedLine),
            formatCopyLineChangsheng(result, changedLine.element),
          ];
        })
    ),
  ]);
}

function formatCopyGuaBody(result: LiuyaoPaipan) {
  const worldLine = result.lines[result.primary.worldPosition - 1];
  const startBranchIndex = worldLine.type === "阳" ? COPY_BRANCH_ORDER.indexOf("子") : COPY_BRANCH_ORDER.indexOf("午");
  const bodyBranch = COPY_BRANCH_ORDER[(startBranchIndex + result.primary.worldPosition - 1) % COPY_BRANCH_ORDER.length];
  const bodyHits = result.lines
    .filter((line) => line.branch === bodyBranch)
    .map(formatCopyBodyLine);

  return `${bodyBranch}${bodyHits.length > 0 ? `（${bodyHits.join("、")}）` : "（不上卦）"}`;
}

function formatCopyWorldBody(result: LiuyaoPaipan) {
  const worldLine = result.lines[result.primary.worldPosition - 1];
  const worldBodyLinePosition = (COPY_BRANCH_ORDER.indexOf(worldLine.branch) % 6) + 1;
  const worldBodyLine = result.lines[worldBodyLinePosition - 1];

  return `${YAO_NAMES[worldBodyLinePosition - 1]}（${formatCopyBodyLine(worldBodyLine)}）`;
}

function formatCopyBodyLine(line: LiuyaoLineInfo) {
  return `${line.label} ${line.relation}${line.stem}${line.branch}${line.element}`;
}

function formatCopyStemBranch(line: Pick<LiuyaoLineInfo, "stem" | "branch" | "element">) {
  return `${line.stem}${line.branch}（${line.element}）`;
}

function formatCopyHiddenGods(hiddenGods: LiuyaoLineInfo["hiddenGods"]) {
  return hiddenGods.length > 0
    ? hiddenGods.map((hiddenGod) => `${hiddenGod.relation}${hiddenGod.stem}${hiddenGod.branch}${COPY_BRANCH_ELEMENTS[hiddenGod.branch] ?? ""}`).join("、")
    : "-";
}

function formatCopyLineShensha(result: LiuyaoPaipan, line: Pick<LiuyaoLineInfo, "stem" | "branch">) {
  const basisValues = getCopyBasisValues(result);
  const monthBranch = getBranchFromPillarText(result.pillars.month);
  const dayBranch = getBranchFromPillarText(result.pillars.day);
  const { branch } = line;
  const hits: string[] = [];

  if (branch === monthBranch) hits.push("临月");
  if (branch === dayBranch) hits.push("临日");
  if (COPY_BRANCH_OPPOSITES[monthBranch] === branch) hits.push("月破");
  if (COPY_BRANCH_OPPOSITES[dayBranch] === branch) hits.push("日冲");
  if (COPY_BRANCH_COMBINES[monthBranch] === branch) hits.push("月合");
  if (COPY_BRANCH_COMBINES[dayBranch] === branch) hits.push("日合");
  if (result.pillarVoids.day.includes(branch)) hits.push("日空");

  for (const rule of COPY_STEM_BRANCH_SHENSHA_RULES) {
    for (const basis of rule.basis) {
      const basisValue = basisValues[basis];
      if ((rule.targets[basisValue.value] ?? []).includes(branch)) {
        hits.push(`${basisValue.label}${basisValue.value}:${rule.name}`);
      }
    }
  }

  for (const rule of COPY_BRANCH_GROUP_SHENSHA_RULES) {
    for (const basis of rule.basis) {
      const basisValue = basisValues[basis];
      if (copyGroupTarget(basisValue.value, rule.targetsByGroup) === branch) {
        hits.push(`${basisValue.label}${basisValue.value}:${rule.name}`);
      }
    }
  }

  for (const rule of COPY_MONTH_BRANCH_SHENSHA_RULES) {
    const targets = rule.targets[monthBranch] ?? [];

    if (copyMatchesTargets(line, targets)) {
      hits.push(`月支${monthBranch}:${rule.name}`);
    }
  }

  return [...new Set(hits)].join("、") || "-";
}

function getCopyBasisValues(result: LiuyaoPaipan) {
  return {
    yearStem: { label: "年干", value: getStemFromPillarText(result.pillars.year) },
    dayStem: { label: "日干", value: getStemFromPillarText(result.pillars.day) },
    yearBranch: { label: "年支", value: getBranchFromPillarText(result.pillars.year) },
    dayBranch: { label: "日支", value: getBranchFromPillarText(result.pillars.day) },
  } satisfies Record<CopyStemBasis | CopyBranchBasis, { label: string; value: string }>;
}

function copyGroupTarget(originBranch: string, targetsByGroup: Record<string, string>) {
  const group = Object.keys(targetsByGroup).find((item) => item.includes(originBranch));
  return group ? targetsByGroup[group] : undefined;
}

function copyMatchesTargets(line: Pick<LiuyaoLineInfo, "stem" | "branch">, targets: CopyTargetToken[]) {
  return targets.some((target) => target.type === "stem" ? line.stem === target.name : line.branch === target.name);
}

function formatCopyLineChangsheng(result: LiuyaoPaipan, element: CopyElementName) {
  const monthBranch = getBranchFromPillarText(result.pillars.month);
  const dayBranch = getBranchFromPillarText(result.pillars.day);

  return `月:${COPY_CHANGSHENG_BY_ELEMENT[element]?.[monthBranch] ?? "-"} 日:${COPY_CHANGSHENG_BY_ELEMENT[element]?.[dayBranch] ?? "-"}`;
}

function copyRelationFor(palaceElement: CopyElementName, lineElement: CopyElementName): CopyRelative {
  if (palaceElement === lineElement) return "兄弟";
  if (COPY_GENERATES[lineElement] === palaceElement) return "父母";
  if (COPY_GENERATES[palaceElement] === lineElement) return "子孙";
  if (COPY_CONTROLS[lineElement] === palaceElement) return "官鬼";
  return "妻财";
}

function getBranchFromPillarText(pillar: string) {
  return pillar.slice(-1);
}

function getStemFromPillarText(pillar: string) {
  return pillar.slice(0, 1);
}

function joinCopySections(sections: Array<string | undefined | null | false>) {
  return sections.filter(Boolean).join("\n\n");
}

function copyMdValue(value: unknown) {
  const text = value === undefined || value === null || value === "" ? "-" : String(value);
  return text.replace(/\r?\n/g, "<br>").replace(/\|/g, "\\|");
}

function copyMdTable(headers: string[], rows: unknown[][]) {
  return [
    `| ${headers.map(copyMdValue).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(copyMdValue).join(" | ")} |`),
  ].join("\n");
}

function AutoFitQuestionText({ children }: { children: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    const textElement = textRef.current;

    if (!container || !textElement) {
      return;
    }

    let frameId = 0;
    const fitText = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const isDesktop = window.matchMedia("(min-width: 640px)").matches;
        const maxFontSize = isDesktop ? 24 : 20;
        const minFontSize = isDesktop ? 12 : 14;
        const targetHeight = isDesktop ? 64 : 56;
        let nextFontSize = maxFontSize;

        container.style.height = `${targetHeight}px`;
        container.style.overflow = "hidden";
        textElement.style.fontSize = `${nextFontSize}px`;
        textElement.style.lineHeight = "1.3";

        while (nextFontSize > minFontSize && textElement.scrollHeight > container.clientHeight) {
          nextFontSize -= 1;
          textElement.style.fontSize = `${nextFontSize}px`;
        }

        if (!isDesktop && textElement.scrollHeight > container.clientHeight) {
          container.style.height = "auto";
          container.style.overflow = "visible";
        }
      });
    };

    fitText();

    window.addEventListener("resize", fitText);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", fitText);
    };
  }, [children]);

  return (
    <div ref={containerRef} className="overflow-hidden">
      <div ref={textRef} className="whitespace-normal break-words text-xl font-medium leading-tight text-foreground sm:text-2xl">
        {children}
      </div>
    </div>
  );
}

function ShenshaPanel({ result }: { result: LiuyaoPaipan }) {
  const shenshaItems = result.shenshas.flatMap((shensha) =>
    shensha.branches.map((branch) => ({ branch, name: shensha.name }))
  );

  return (
    <aside className="flex w-full flex-col gap-2 sm:gap-3 sm:rounded-lg sm:bg-muted/35 sm:p-4 lg:w-max lg:min-w-0">
      <div className="text-sm font-semibold tracking-tight">神煞</div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(4.75rem,1fr))] gap-x-1.5 gap-y-1.5 text-xs sm:gap-x-3 sm:gap-y-2 sm:text-sm lg:w-max lg:grid-cols-[max-content_max-content]">
        {shenshaItems.map((item) => (
          <div
            key={`${item.branch}-${item.name}`}
            className="grid grid-cols-[1.125rem_minmax(0,1fr)] items-baseline gap-0.5 sm:grid-cols-[1.25rem_minmax(0,1fr)] sm:gap-1 lg:grid-cols-[1.25rem_max-content]"
          >
            <span className="font-medium text-foreground">{item.branch}</span>
            <span className="truncate text-muted-foreground">{item.name}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function PillarTimeSummary({ result }: { result: LiuyaoPaipan }) {
  return (
    <div className="flex flex-wrap items-start gap-x-5 gap-y-2 sm:gap-x-8 sm:gap-y-3">
      <PillarTimeItem label="年" value={result.pillars.year} voidValue={result.pillarVoids.year} />
      <PillarTimeItem label="月" value={result.pillars.month} voidValue={result.pillarVoids.month} />
      <PillarTimeItem label="日" value={result.pillars.day} voidValue={result.pillarVoids.day} />
      <PillarTimeItem label="时" value={result.pillars.hour} voidValue={result.pillarVoids.hour} />
    </div>
  );
}

function PillarTimeItem({
  label,
  value,
  voidValue,
}: {
  label: string;
  value: string;
  voidValue: string;
}) {
  return (
    <div className="flex min-w-12 flex-col gap-1 leading-none sm:min-w-14">
      <div className="flex items-baseline gap-1">
        <span className="text-base font-semibold text-foreground">{value}</span>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="text-[11px] text-muted-foreground">{voidValue}空</div>
    </div>
  );
}

function PaipanLineRow({
  line,
  showChangedColumns,
}: {
  line: LiuyaoLineInfo;
  showChangedColumns: boolean;
}) {
  const hiddenGodsText = formatHiddenGods(line.hiddenGods);

  return (
    <>
      <tr className="bg-background">
        <td className="w-0 whitespace-nowrap px-[var(--liuyao-cell-x)] pt-0.5 text-center font-medium sm:pt-1">{line.deity}</td>
        <td className="w-0 whitespace-nowrap px-[var(--liuyao-cell-x)] pt-0.5 sm:pt-1">
          <LineRelativeCell line={line} />
        </td>
        <td className="px-[var(--liuyao-cell-x)] pt-0.5 sm:pt-1 lg:w-[clamp(7rem,11vw,10rem)]">
          <div className="flex items-center justify-center">
            <YaoGlyph type={line.type} />
          </div>
        </td>
        <td className="w-0 whitespace-nowrap px-[var(--liuyao-cell-x)] pt-0.5 text-center font-medium sm:pt-1">{line.role}</td>
        {showChangedColumns ? (
          <>
            <td className="w-0 whitespace-nowrap px-[var(--liuyao-cell-x)] pt-0.5 text-center font-medium sm:pt-1">{line.movingSymbol}</td>
            <td className="w-0 whitespace-nowrap px-[var(--liuyao-cell-x)] pt-0.5 sm:pt-1">
              {line.changed ? <LineRelativeCell line={line.changed} /> : null}
            </td>
            <td className="px-[var(--liuyao-cell-x)] pt-0.5 sm:pt-1 lg:w-[clamp(7rem,11vw,10rem)]">
              <div className="flex items-center justify-center">
                {line.changed ? <YaoGlyph type={line.changed.type} /> : null}
              </div>
            </td>
            <td className="w-0 whitespace-nowrap px-[var(--liuyao-cell-x)] pt-0.5 text-center font-medium sm:pt-1">
              {line.changed?.role ?? ""}
            </td>
          </>
        ) : null}
      </tr>
      <tr className="bg-background text-[11px] leading-tight text-muted-foreground sm:text-sm">
        <td className="px-[var(--liuyao-cell-x)] pb-0.5 pt-0 sm:pb-1" aria-hidden="true" />
        <td className="h-3 w-0 whitespace-nowrap px-[var(--liuyao-cell-x)] pb-0.5 pt-0 sm:h-4 sm:pb-1">
          <span
            className={cn(
              "inline-flex shrink-0 items-center whitespace-nowrap",
              !hiddenGodsText && "invisible"
            )}
            aria-hidden={!hiddenGodsText}
          >
            <CornerLeftUpIcon className="size-[1em] shrink-0" aria-hidden="true" />
            {hiddenGodsText || "占位"}
          </span>
        </td>
        <td className="px-[var(--liuyao-cell-x)] pb-0.5 pt-0 sm:pb-1" aria-hidden="true" />
        <td className="px-[var(--liuyao-cell-x)] pb-0.5 pt-0 sm:pb-1" aria-hidden="true" />
        {showChangedColumns ? (
          <>
            <td className="px-[var(--liuyao-cell-x)] pb-0.5 pt-0 sm:pb-1" aria-hidden="true" />
            <td className="px-[var(--liuyao-cell-x)] pb-0.5 pt-0 sm:pb-1" aria-hidden="true" />
            <td className="px-[var(--liuyao-cell-x)] pb-0.5 pt-0 sm:pb-1" aria-hidden="true" />
            <td className="px-[var(--liuyao-cell-x)] pb-0.5 pt-0 sm:pb-1" aria-hidden="true" />
          </>
        ) : null}
      </tr>
    </>
  );
}

function HexagramTableHeading({
  hexagram,
  fallback,
}: {
  hexagram: LiuyaoPaipan["primary"] | null;
  fallback: string;
}) {
  if (!hexagram) {
    return <span className="block text-center">{fallback}</span>;
  }

  return (
    <div className="flex flex-col items-center gap-0.5 text-center leading-tight">
      <span className="text-foreground">{formatHexagramName(hexagram)}</span>
      <span className="text-[11px] font-normal leading-tight text-muted-foreground sm:text-sm">
        {formatHexagramMeta(hexagram)}
      </span>
    </div>
  );
}

function LineRelativeCell({
  line,
}: {
  line: Pick<LiuyaoLineInfo, "relation" | "stem" | "branch">;
}) {
  return (
    <div className="leading-tight">
      <span className="font-medium">
        {line.relation}·{line.stem}{line.branch}
      </span>
    </div>
  );
}

function formatHiddenGods(hiddenGods: LiuyaoLineInfo["hiddenGods"]) {
  return hiddenGods
    .map((hiddenGod) => `${hiddenGod.relation}·${hiddenGod.stem}${hiddenGod.branch}`)
    .join("、");
}

function formatHexagramName(hexagram: Pick<LiuyaoPaipan["primary"], "name" | "pattern">) {
  return `${hexagram.name}${hexagram.pattern ? `·${hexagram.pattern}` : ""}`;
}

function formatHexagramMeta(hexagram: Pick<LiuyaoPaipan["primary"], "palace" | "stage" | "pattern">) {
  return `${hexagram.palace}·${hexagram.stage}`;
}

function YaoGlyph({ type, className }: { type: YaoType; className?: string }) {
  return (
    <div className={cn("flex h-4 w-[var(--liuyao-yao-width,5rem)] min-w-0 items-center", className)}>
      {type === "阳" ? (
        <div className="h-2 w-full rounded bg-foreground" />
      ) : (
        <div className="flex w-full gap-[var(--liuyao-yao-gap,0.75rem)]">
          <div className="h-2 flex-1 rounded bg-foreground" />
          <div className="h-2 flex-1 rounded bg-foreground" />
        </div>
      )}
    </div>
  );
}
