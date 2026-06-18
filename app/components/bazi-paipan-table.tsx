import { useEffect, useState } from "react";
import { ChevronDownIcon } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BaziGender, BaziPaipan, BaziPillarDisplay } from "@/features/bazi/paipan";
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
  const displayName = paipan.name || "未署名";
  const summaryItems = [
    GENDER_LABELS[paipan.gender],
    paipan.solarText,
  ];
  const isShenShaCollapsible = paipan.pillars.some(
    (pillar) => pillar.shenSha.length > SHEN_SHA_PREVIEW_COUNT
  );
  const shenShaPreviewLimit =
    isShenShaCollapsible && !isShenShaExpanded ? SHEN_SHA_PREVIEW_COUNT : undefined;

  useEffect(() => {
    setIsShenShaExpanded(false);
  }, [paipan]);

  const toggleShenShaRow = () => {
    if (!isShenShaCollapsible) {
      return;
    }

    setIsShenShaExpanded((isExpanded) => !isExpanded);
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

      <div className="overflow-hidden border-y bg-background md:rounded-lg md:border-x">
        <Table className="table-fixed text-[13px] md:min-w-[760px] md:text-sm">
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

function HiddenStemStack({ items }: { items: BaziPillarDisplay["hiddenStems"] }) {
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
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
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
