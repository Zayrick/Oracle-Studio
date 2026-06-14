import { useState, type FormEvent } from "react";
import { format } from "date-fns";
import { ChevronDownIcon, CornerLeftUpIcon } from "lucide-react";
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
      setResult(buildLiuyaoPaipan({ question, date, time, yaos }));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "排盘失败，请检查输入。");
    }
  };

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-10">
        <div className="flex flex-col gap-3 text-center">
          <h1 className="text-3xl font-bold tracking-tight">六爻排盘</h1>
          <p className="text-muted-foreground">本卦、变卦、纳甲、六亲、六神与旬空</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-2xl flex-col gap-8 rounded-lg border bg-card p-6 text-card-foreground shadow-sm"
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

          <div className="flex flex-col gap-3">
            <FieldLabel className="mb-2 block">占问时间</FieldLabel>
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

          <div className="flex flex-col gap-4">
            <FieldLabel className="mb-4 block">所得之卦</FieldLabel>
            <div className="flex flex-col gap-3 rounded-lg bg-muted/40 p-4">
              {YAO_INDEXES_TOP_DOWN.map((index) => {
                const yao = yaos[index];

                return (
                <div
                  key={index}
                  className="grid grid-cols-[3.5rem_1fr_4rem] items-center gap-4 sm:grid-cols-[4rem_10rem_4rem] sm:justify-center"
                >
                  <div className="text-right text-sm font-medium">
                    {YAO_NAMES[index]}
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleYaoType(index)}
                    className="relative flex h-11 cursor-pointer items-center justify-center rounded-md hover:bg-background/70"
                  >
                    <YaoGlyph type={yao.type} />
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleYaoMoving(index)}
                    className={cn(
                      "flex h-9 items-center justify-center rounded-md border text-sm font-medium transition-colors",
                      yao.moving
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted"
                    )}
                  >
                    {yao.moving ? (yao.type === "阳" ? "老阳" : "老阴") : "静"}
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

          <div className="flex justify-center pt-2">
            <Button type="submit" size="lg" className="w-full max-w-xs">
              开始排盘
            </Button>
          </div>
        </form>

        {result ? <PaipanResult result={result} /> : null}
      </div>
    </div>
  );
}

function PaipanResult({ result }: { result: LiuyaoPaipan }) {
  return (
    <section className="flex flex-col gap-6 rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
        <div className="flex flex-1 flex-col justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="text-xs text-muted-foreground">{result.solar}</div>
            <div className="text-lg font-medium leading-relaxed text-foreground">{result.question}</div>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">
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
        <table className="w-full min-w-[860px] border-collapse text-base leading-tight">
          <thead className="text-muted-foreground">
            <tr>
              <td className="px-2 py-1" aria-hidden="true" />
              <td className="px-2 py-1" aria-hidden="true" />
              <th className="px-2 py-1 text-center font-medium" scope="col">
                <HexagramTableHeading hexagram={result.primary} fallback="本卦" />
              </th>
              <td className="px-2 py-1" aria-hidden="true" />
              <td className="px-2 py-1" aria-hidden="true" />
              <td className="px-2 py-1" aria-hidden="true" />
              <th className="px-2 py-1 text-center font-medium" scope="col">
                <HexagramTableHeading hexagram={result.changed} fallback="变卦" />
              </th>
              <td className="px-2 py-1" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {[...result.lines].reverse().map((line) => (
              <PaipanLineRow key={line.position} line={line} />
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
    <aside className="flex w-full flex-col gap-3 rounded-lg bg-muted/35 p-4 lg:max-w-[22rem] lg:min-w-[20rem]">
      <div className="text-sm font-semibold tracking-tight">神煞</div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        {shenshaItems.map((item) => (
          <div
            key={`${item.branch}-${item.name}`}
            className="grid grid-cols-[1.25rem_1fr] items-baseline gap-1"
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
    <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
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
    <div className="flex min-w-14 flex-col gap-1 leading-none">
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-semibold text-foreground">{value}</span>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="text-[11px] text-muted-foreground">{voidValue}空</div>
    </div>
  );
}

function PaipanLineRow({ line }: { line: LiuyaoLineInfo }) {
  const hiddenGodsText = formatHiddenGods(line.hiddenGods);

  return (
    <>
      <tr className="bg-background">
        <td className="w-0 whitespace-nowrap px-2 pt-1 text-center font-medium">{line.deity}</td>
        <td className="w-0 whitespace-nowrap px-2 pt-1">
          <LineRelativeCell line={line} />
        </td>
        <td className="px-2 pt-1">
          <div className="flex items-center gap-3">
            <YaoGlyph type={line.type} />
          </div>
        </td>
        <td className="w-0 whitespace-nowrap px-2 pt-1 text-center font-medium">{line.role}</td>
        <td className="w-0 whitespace-nowrap px-2 pt-1 text-center font-medium">{line.movingSymbol}</td>
        <td className="w-0 whitespace-nowrap px-2 pt-1">
          {line.changed ? <LineRelativeCell line={line.changed} /> : null}
        </td>
        <td className="px-2 pt-1">
          {line.changed ? <YaoGlyph type={line.changed.type} /> : null}
        </td>
        <td className="w-0 whitespace-nowrap px-2 pt-1 text-center font-medium">
          {line.changed?.role ?? ""}
        </td>
      </tr>
      <tr className="bg-background text-sm leading-tight text-muted-foreground">
        <td className="px-2 pb-1 pt-0" aria-hidden="true" />
        <td className="h-4 px-2 pb-1 pt-0">
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
        <td className="px-2 pb-1 pt-0" aria-hidden="true" />
        <td className="px-2 pb-1 pt-0" aria-hidden="true" />
        <td className="px-2 pb-1 pt-0" aria-hidden="true" />
        <td className="px-2 pb-1 pt-0" aria-hidden="true" />
        <td className="px-2 pb-1 pt-0" aria-hidden="true" />
        <td className="px-2 pb-1 pt-0" aria-hidden="true" />
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
      <span className="text-sm font-normal leading-tight text-muted-foreground">
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
    <div className={cn("flex h-4 w-full min-w-20 items-center", className)}>
      {type === "阳" ? (
        <div className="h-2 w-full rounded bg-foreground" />
      ) : (
        <div className="flex w-full gap-3">
          <div className="h-2 flex-1 rounded bg-foreground" />
          <div className="h-2 flex-1 rounded bg-foreground" />
        </div>
      )}
    </div>
  );
}
