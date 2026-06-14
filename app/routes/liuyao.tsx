import { useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { format } from "date-fns";
import { ArrowLeftIcon, ChevronDownIcon, CornerLeftUpIcon } from "lucide-react";
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
      });
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "排盘失败，请检查输入。");
    }
  };

  const handleStartOver = () => {
    runLiuyaoViewTransition(() => {
      setResult(null);
      setError("");
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 lg:py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:gap-8">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">六爻排盘</h1>
          <p className="text-sm text-muted-foreground">本卦、变卦、纳甲、六亲、六神与旬空</p>
        </div>

        {result ? (
          <PaipanResult result={result} onStartOver={handleStartOver} />
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
  );
}

function PaipanResult({
  result,
  onStartOver,
}: {
  result: LiuyaoPaipan;
  onStartOver: () => void;
}) {
  const showChangedColumns = Boolean(result.changed);

  return (
    <section className="flex w-full flex-col gap-4 text-card-foreground animate-in fade-in-0 slide-in-from-bottom-3 duration-300 sm:gap-6 lg:mx-auto lg:w-fit lg:max-w-full">
      <div className="flex justify-start">
        <Button type="button" variant="outline" onClick={onStartOver}>
          <ArrowLeftIcon data-icon="inline-start" />
          再起一卦
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-stretch lg:justify-between lg:gap-10">
        <div className="flex flex-1 flex-col justify-between gap-3 sm:gap-4 lg:w-max lg:max-w-[36rem] lg:flex-none">
          <div className="flex flex-col gap-2">
            <div className="text-xs text-muted-foreground">{result.solar}</div>
            <div className="text-lg font-medium leading-relaxed text-foreground">{result.question}</div>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
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
            "w-full border-collapse text-xs leading-tight [--liuyao-cell-x:0.125rem] [--liuyao-yao-gap:clamp(0.25rem,1.5vw,0.75rem)] [--liuyao-yao-width:clamp(2rem,calc((100vw_-_15.5rem)/2),4.5rem)] sm:text-base sm:[--liuyao-cell-x:0.5rem] sm:[--liuyao-yao-gap:0.75rem] sm:[--liuyao-yao-width:5rem] lg:mx-auto lg:w-max lg:min-w-0 lg:[--liuyao-cell-x:0.375rem]",
            showChangedColumns ? "min-w-0 sm:min-w-[720px]" : "min-w-0 sm:min-w-[440px]"
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
        <span className="text-lg font-semibold text-foreground sm:text-xl">{value}</span>
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
        <td className="h-3 px-[var(--liuyao-cell-x)] pb-0.5 pt-0 sm:h-4 sm:pb-1 lg:w-0 lg:whitespace-nowrap">
          <span
            className={cn(
              "inline-flex items-center",
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
