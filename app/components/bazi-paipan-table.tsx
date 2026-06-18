import { useEffect, useState, type ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  BaziFlowDayDisplay,
  BaziFlowHourDisplay,
  BaziFlowItemDisplay,
  BaziFlowMonthDisplay,
  BaziGender,
  BaziHiddenStemDisplay,
  BaziPaipan,
  BaziPillarDisplay,
} from "@/features/bazi/paipan";
import { cn } from "@/lib/utils";

type BaziPaipanRowKey =
  | "mainStar"
  | "stem"
  | "branch"
  | "hiddenStems"
  | "starFortune"
  | "selfSitting"
  | "kongWang"
  | "naYin"
  | "shenSha";

const BAZI_TABLE_ROWS = [
  { key: "mainStar", label: "主星" },
  { key: "stem", label: "天干" },
  { key: "branch", label: "地支" },
  { key: "hiddenStems", label: "藏干" },
  { key: "starFortune", label: "星运" },
  { key: "selfSitting", label: "自坐" },
  { key: "kongWang", label: "空亡" },
  { key: "naYin", label: "纳音" },
  { key: "shenSha", label: "神煞" },
] satisfies Array<{ key: BaziPaipanRowKey; label: string }>;

const GENDER_LABELS: Record<BaziGender, string> = {
  male: "男",
  female: "女",
};

const SHEN_SHA_PREVIEW_COUNT = 2;

interface BaziPaipanTableProps {
  paipan: BaziPaipan;
}

export function BaziPaipanTable({ paipan }: BaziPaipanTableProps) {
  const [isShenShaExpanded, setIsShenShaExpanded] = useState(false);
  const [selectedFlowYear, setSelectedFlowYear] = useState<number | null>(null);
  const [selectedFlowMonth, setSelectedFlowMonth] = useState<number | null>(null);
  const [selectedFlowDay, setSelectedFlowDay] = useState<string | null>(null);
  const [selectedFlowHour, setSelectedFlowHour] = useState<string | null>(null);
  const [flowMonths, setFlowMonths] = useState<BaziFlowMonthDisplay[]>([]);
  const [flowDays, setFlowDays] = useState<BaziFlowDayDisplay[]>([]);
  const [flowHours, setFlowHours] = useState<BaziFlowHourDisplay[]>([]);
  const displayName = paipan.name || "未署名";
  const summaryItems = [
    GENDER_LABELS[paipan.gender],
    paipan.solarText,
  ];

  useEffect(() => {
    setIsShenShaExpanded(false);
    setSelectedFlowYear(null);
    setSelectedFlowMonth(null);
    setSelectedFlowDay(null);
    setSelectedFlowHour(null);
    setFlowMonths([]);
    setFlowDays([]);
    setFlowHours([]);
  }, [paipan]);

  const toggleShenShaRow = () => {
    if (!isShenShaCollapsible) {
      return;
    }

    setIsShenShaExpanded((isExpanded) => !isExpanded);
  };

  const activeFlowYear =
    selectedFlowYear == null
      ? null
      : paipan.fortune.years.find((year) => year.year === selectedFlowYear) ?? null;
  const activeFlowMonth =
    selectedFlowMonth == null
      ? null
      : flowMonths.find((month) => month.month === selectedFlowMonth) ?? null;
  const activeFlowDay =
    selectedFlowDay == null ? null : flowDays.find((day) => day.date === selectedFlowDay) ?? null;
  const activeFlowHour =
    selectedFlowHour == null
      ? null
      : flowHours.find((hour) => hour.key === selectedFlowHour) ?? null;
  const activeFlowColumns = [
    activeFlowYear,
    activeFlowMonth,
    activeFlowDay,
    activeFlowHour,
  ].filter(Boolean) as BaziFlowItemDisplay[];
  const isShenShaCollapsible = [...activeFlowColumns, ...paipan.pillars].some(
    (pillar) => pillar.shenSha.length > SHEN_SHA_PREVIEW_COUNT
  );
  const shenShaPreviewLimit =
    isShenShaCollapsible && !isShenShaExpanded ? SHEN_SHA_PREVIEW_COUNT : undefined;

  const handleSelectFlowYear = async (year: number) => {
    if (selectedFlowYear === year) {
      setSelectedFlowYear(null);
      setSelectedFlowMonth(null);
      setSelectedFlowDay(null);
      setSelectedFlowHour(null);
      setFlowMonths([]);
      setFlowDays([]);
      setFlowHours([]);
      return;
    }

    setSelectedFlowYear(year);
    setSelectedFlowMonth(null);
    setSelectedFlowDay(null);
    setSelectedFlowHour(null);
    setFlowMonths([]);
    setFlowDays([]);
    setFlowHours([]);

    try {
      const { buildBaziFlowMonths } = await import("@/features/bazi/paipan");
      setFlowMonths(buildBaziFlowMonths(year, paipan.fortune.context));
    } catch (error) {
      console.error(error);
      setFlowMonths([]);
    }
  };

  const handleSelectFlowMonth = async (month: BaziFlowMonthDisplay) => {
    if (selectedFlowMonth === month.month) {
      setSelectedFlowMonth(null);
      setSelectedFlowDay(null);
      setSelectedFlowHour(null);
      setFlowDays([]);
      setFlowHours([]);
      return;
    }

    setSelectedFlowMonth(month.month);
    setSelectedFlowDay(null);
    setSelectedFlowHour(null);
    setFlowDays([]);
    setFlowHours([]);

    try {
      const { buildBaziFlowDays } = await import("@/features/bazi/paipan");
      setFlowDays(buildBaziFlowDays(month, paipan.fortune.context));
    } catch (error) {
      console.error(error);
      setFlowDays([]);
    }
  };

  const handleSelectFlowDay = async (day: BaziFlowDayDisplay) => {
    if (selectedFlowDay === day.date) {
      setSelectedFlowDay(null);
      setSelectedFlowHour(null);
      setFlowHours([]);
      return;
    }

    setSelectedFlowDay(day.date);
    setSelectedFlowHour(null);
    setFlowHours([]);

    try {
      const { buildBaziFlowHours } = await import("@/features/bazi/paipan");
      setFlowHours(buildBaziFlowHours(day, paipan.fortune.context));
    } catch (error) {
      console.error(error);
      setFlowHours([]);
    }
  };

  const handleSelectFlowHour = (hour: BaziFlowHourDisplay) => {
    setSelectedFlowHour((selectedHour) => (selectedHour === hour.key ? null : hour.key));
  };

  return (
    <section
      aria-labelledby="bazi-paipan-heading"
      className="flex w-full flex-col gap-3 animate-in fade-in-0 slide-in-from-bottom-3 duration-300 md:gap-4"
    >
      <div className="flex flex-col gap-1.5 px-4 text-center md:gap-2 md:px-0">
        <h2 id="bazi-paipan-heading" className="text-xl font-semibold tracking-tight">
          {displayName}
        </h2>
        <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {summaryItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>

      {paipan.warnings.length > 0 ? (
        <div className="mx-4 rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive md:mx-0">
          {paipan.warnings.join(" ")}
        </div>
      ) : null}

      <div className="overflow-x-auto border-y bg-background md:rounded-lg md:border-x">
        <Table className="min-w-[760px] table-fixed text-[13px] md:text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="h-8 w-10 px-1 py-1 text-center text-[11px] leading-4 sm:w-14 md:h-12 md:w-24 md:px-3 md:text-sm">
                <span className="sr-only">项目</span>
              </TableHead>
              {paipan.pillars.map((pillar) => (
                <TableHead
                  key={pillar.key}
                  className="h-8 px-1 py-1 text-center text-[11px] leading-4 md:h-12 md:px-3 md:text-sm"
                >
                  {pillar.label}
                </TableHead>
              ))}
              {activeFlowColumns.map((column, index) => (
                <TableHead
                  key={column.key}
                  className={cn(
                    "h-8 bg-muted/30 px-1 py-1 text-center text-[11px] leading-4 text-primary md:h-12 md:px-3 md:text-sm",
                    index === 0 && "border-l"
                  )}
                >
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {BAZI_TABLE_ROWS.map((row) => {
              const isInteractiveShenShaRow = row.key === "shenSha" && isShenShaCollapsible;

              return (
                <TableRow
                  key={row.key}
                  className={cn(
                    isInteractiveShenShaRow &&
                      "cursor-pointer select-none focus-visible:bg-muted/50 focus-visible:outline-none"
                  )}
                  onClick={isInteractiveShenShaRow ? toggleShenShaRow : undefined}
                >
                  <TableCell className="px-1 py-1.5 text-center text-xs font-medium leading-5 text-muted-foreground md:p-3 md:text-sm">
                    {isInteractiveShenShaRow ? (
                      <button
                        type="button"
                        aria-expanded={isShenShaExpanded}
                        aria-label={isShenShaExpanded ? "收起神煞" : "展开全部神煞"}
                        className="inline-flex appearance-none flex-col items-center gap-0.5 rounded-sm border-0 bg-transparent p-0 text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleShenShaRow();
                        }}
                      >
                        <span>{row.label}</span>
                        <ChevronDownIcon
                          aria-hidden="true"
                          className={cn(
                            "size-3 transition-transform md:size-3.5",
                            isShenShaExpanded && "rotate-180"
                          )}
                        />
                      </button>
                    ) : (
                      row.label
                    )}
                  </TableCell>
                  {paipan.pillars.map((pillar) => (
                    <TableCell
                      key={`${row.key}-${pillar.key}`}
                      className="whitespace-normal px-1 py-1.5 text-center align-top leading-4 md:p-3 md:leading-6"
                    >
                      {renderPillarValue(row.key, pillar, { shenShaPreviewLimit })}
                    </TableCell>
                  ))}
                  {activeFlowColumns.map((column, index) => (
                    <TableCell
                      key={`${row.key}-${column.key}`}
                      className={cn(
                        "whitespace-normal bg-muted/20 px-1 py-1.5 text-center align-top leading-4 md:p-3 md:leading-6",
                        index === 0 && "border-l"
                      )}
                    >
                      {renderFlowPillarValue(row.key, column, { shenShaPreviewLimit })}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col border-y bg-background text-sm md:rounded-lg md:border-x">
        <div className="grid grid-cols-4 border-b">
          {paipan.auxiliaryPillars.map((item, index) => (
            <InfoPair
              key={item.key}
              label={item.label}
              value={item.value}
              className={cn(index < 3 && "border-r")}
            />
          ))}
        </div>
        <div className="flex flex-row items-center justify-between gap-3 px-4 py-3 md:px-6">
          <InfoInline label="起运" value={paipan.fortuneStartText} />
          <InfoInline label="司令" value={paipan.commanderText} align="right" />
        </div>
      </div>

      {paipan.fortune.years.length > 0 ? (
        <FlowFortuneSection
          paipan={paipan}
          flowMonths={flowMonths}
          flowDays={flowDays}
          flowHours={flowHours}
          selectedFlowYear={selectedFlowYear}
          selectedFlowMonth={selectedFlowMonth}
          selectedFlowDay={selectedFlowDay}
          selectedFlowHour={selectedFlowHour}
          onSelectFlowYear={(year) => {
            void handleSelectFlowYear(year);
          }}
          onSelectFlowMonth={(month) => {
            void handleSelectFlowMonth(month);
          }}
          onSelectFlowDay={(day) => {
            void handleSelectFlowDay(day);
          }}
          onSelectFlowHour={handleSelectFlowHour}
        />
      ) : null}
    </section>
  );
}

function renderPillarValue(
  rowKey: BaziPaipanRowKey,
  pillar: BaziPillarDisplay,
  options: { shenShaPreviewLimit?: number } = {}
) {
  if (rowKey === "hiddenStems") {
    return <HiddenStemStack items={pillar.hiddenStems} />;
  }

  if (rowKey === "shenSha") {
    return (
      <ValueStack
        items={
          options.shenShaPreviewLimit
            ? pillar.shenSha.slice(0, options.shenShaPreviewLimit)
            : pillar.shenSha
        }
        compact
      />
    );
  }

  const value = pillar[rowKey];
  const isStemOrBranch = rowKey === "stem" || rowKey === "branch";

  return (
    <span className={cn(isStemOrBranch && "text-base font-semibold leading-5 md:text-lg md:leading-6")}>
      {value || "—"}
    </span>
  );
}

function renderFlowPillarValue(
  rowKey: BaziPaipanRowKey,
  column: BaziFlowItemDisplay,
  options: { shenShaPreviewLimit?: number } = {}
) {
  if (rowKey === "hiddenStems") {
    return <HiddenStemStack items={column.hiddenStems} />;
  }

  if (rowKey === "shenSha") {
    return (
      <ValueStack
        items={
          options.shenShaPreviewLimit
            ? column.shenSha.slice(0, options.shenShaPreviewLimit)
            : column.shenSha
        }
        compact
      />
    );
  }

  const value = rowKey === "mainStar" ? column.tenGod : column[rowKey];
  const isStemOrBranch = rowKey === "stem" || rowKey === "branch";

  return (
    <span className={cn(isStemOrBranch && "text-base font-semibold leading-5 md:text-lg md:leading-6")}>
      {value || "—"}
    </span>
  );
}

function FlowFortuneSection({
  paipan,
  flowMonths,
  flowDays,
  flowHours,
  selectedFlowYear,
  selectedFlowMonth,
  selectedFlowDay,
  selectedFlowHour,
  onSelectFlowYear,
  onSelectFlowMonth,
  onSelectFlowDay,
  onSelectFlowHour,
}: {
  paipan: BaziPaipan;
  flowMonths: BaziFlowMonthDisplay[];
  flowDays: BaziFlowDayDisplay[];
  flowHours: BaziFlowHourDisplay[];
  selectedFlowYear: number | null;
  selectedFlowMonth: number | null;
  selectedFlowDay: string | null;
  selectedFlowHour: string | null;
  onSelectFlowYear: (year: number) => void;
  onSelectFlowMonth: (month: BaziFlowMonthDisplay) => void;
  onSelectFlowDay: (day: BaziFlowDayDisplay) => void;
  onSelectFlowHour: (hour: BaziFlowHourDisplay) => void;
}) {
  const dayunText = paipan.fortune.dayun
    ? `${paipan.fortune.dayun.startYear}年起 ${paipan.fortune.dayun.ganZhi}`
    : `${paipan.fortune.currentYear}年`;

  return (
    <div className="overflow-hidden border-y bg-background md:rounded-lg md:border-x">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3 md:px-6">
        <h3 className="text-sm font-semibold tracking-tight">流运</h3>
        <span className="text-xs text-muted-foreground">当前大运 {dayunText}</span>
      </div>

      <div>
        <FlowTimelineRow label="流年">
          {paipan.fortune.years.map((year) => (
            <FlowItemButton
              key={year.key}
              ariaLabel={`${year.year}年${year.name}`}
              eyebrow={String(year.year)}
              caption={`${year.age}岁`}
              stem={year.stem}
              branch={year.branch}
              footer={year.tenGod}
              isSelected={selectedFlowYear === year.year}
              className="w-16"
              onClick={() => onSelectFlowYear(year.year)}
            />
          ))}
        </FlowTimelineRow>

        {flowMonths.length > 0 ? (
          <FlowTimelineRow label="流月">
            {flowMonths.map((month) => (
              <FlowItemButton
                key={month.key}
                ariaLabel={`${month.jieQi}${month.name}`}
                eyebrow={month.jieQi}
                caption={formatShortDate(month.startDate)}
                stem={month.stem}
                branch={month.branch}
                footer={month.tenGod}
                isSelected={selectedFlowMonth === month.month}
                className="w-16"
                onClick={() => onSelectFlowMonth(month)}
              />
            ))}
          </FlowTimelineRow>
        ) : null}

        {flowDays.length > 0 ? (
          <FlowTimelineRow label="流日">
            {flowDays.map((day) => (
              <FlowItemButton
                key={day.key}
                ariaLabel={`${day.date}${day.name}`}
                eyebrow={formatShortDate(day.date)}
                caption={`${day.day}日`}
                stem={day.stem}
                branch={day.branch}
                footer={day.tenGod}
                isSelected={selectedFlowDay === day.date}
                className="w-14"
                onClick={() => onSelectFlowDay(day)}
              />
            ))}
          </FlowTimelineRow>
        ) : null}

        {flowHours.length > 0 ? (
          <FlowTimelineRow label="流时">
            {flowHours.map((hour) => (
              <FlowItemButton
                key={hour.key}
                ariaLabel={`${hour.branchTime}${hour.name}`}
                eyebrow={hour.branchTime}
                caption={hour.timeRange}
                stem={hour.stem}
                branch={hour.branch}
                footer={hour.tenGod}
                isSelected={selectedFlowHour === hour.key}
                className="w-16"
                onClick={() => onSelectFlowHour(hour)}
              />
            ))}
          </FlowTimelineRow>
        ) : null}
      </div>
    </div>
  );
}

function FlowTimelineRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] border-b last:border-b-0 md:grid-cols-[4.5rem_minmax(0,1fr)]">
      <div className="flex items-center justify-center border-r bg-muted/30 px-2 text-center text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <div className="min-w-0 overflow-x-auto overscroll-x-contain px-3 py-3 md:px-4">
        <div className="flex w-max gap-2">{children}</div>
      </div>
    </div>
  );
}

function FlowItemButton({
  ariaLabel,
  eyebrow,
  caption,
  stem,
  branch,
  footer,
  isSelected,
  className,
  onClick,
}: {
  ariaLabel: string;
  eyebrow: string;
  caption: string;
  stem: string;
  branch: string;
  footer: string;
  isSelected: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={isSelected}
      onClick={onClick}
      className={cn(
        "flex h-24 shrink-0 flex-col items-center justify-between rounded-md border bg-background px-2 py-2 text-center text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isSelected ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/60",
        className
      )}
    >
      <span className="max-w-full truncate text-[10px] font-medium leading-3 text-muted-foreground">
        {eyebrow}
      </span>
      <span className="max-w-full truncate text-[10px] leading-3 text-muted-foreground">
        {caption}
      </span>
      <span className="flex flex-col items-center gap-0.5 leading-none">
        <span className="text-base font-semibold leading-none">{stem || "—"}</span>
        <span className="text-base font-semibold leading-none">{branch || "—"}</span>
      </span>
      <span className="max-w-full truncate text-[10px] font-medium leading-3">{footer || "—"}</span>
    </button>
  );
}

function HiddenStemStack({ items }: { items: BaziHiddenStemDisplay[] }) {
  if (items.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex flex-col gap-0.5 md:gap-1">
      {items.map((item) => (
        <span
          key={`${item.stem}-${item.qiType}-${item.tenGod}`}
          className="inline-flex items-baseline justify-center leading-4 md:leading-5"
        >
          <span>{item.stem}</span>
          <span className="text-[10px] leading-none md:text-xs">{item.tenGod}</span>
        </span>
      ))}
    </div>
  );
}

function ValueStack({ items, compact = false }: { items: string[]; compact?: boolean }) {
  if (items.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className={cn("flex flex-col", compact ? "gap-0 md:gap-0.5" : "gap-0.5 md:gap-1")}>
      {items.map((item, index) => (
        <span key={`${item}-${index}`}>{item}</span>
      ))}
    </div>
  );
}

function formatShortDate(date: string) {
  const [, month, day] = date.split("-");

  return `${Number(month)}/${Number(day)}`;
}

function InfoPair({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-center gap-1 px-1.5 py-3 sm:gap-2 sm:px-3", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="font-semibold leading-5">{value || "—"}</span>
    </div>
  );
}

function InfoInline({
  label,
  value,
  align = "left",
}: {
  label: string;
  value: string;
  align?: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-baseline gap-2 whitespace-nowrap",
        align === "right" && "md:justify-end md:text-right"
      )}
    >
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <span className="min-w-0 font-semibold leading-5">{value || "—"}</span>
    </div>
  );
}
