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

interface BaziPaipanTableProps {
  paipan: BaziPaipan;
}

export function BaziPaipanTable({ paipan }: BaziPaipanTableProps) {
  const summaryItems = [
    paipan.name || "未署名",
    GENDER_LABELS[paipan.gender],
    paipan.solarText,
    `日主 ${paipan.dayMaster}`,
    paipan.kongWangText,
  ];

  return (
    <section
      aria-labelledby="bazi-paipan-heading"
      className="flex w-full flex-col gap-4 animate-in fade-in-0 slide-in-from-bottom-3 duration-300"
    >
      <div className="flex flex-col gap-2 text-center">
        <h2 id="bazi-paipan-heading" className="text-xl font-semibold tracking-tight">
          排盘结果
        </h2>
        <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {summaryItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>

      {paipan.warnings.length > 0 ? (
        <div className="rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive">
          {paipan.warnings.join(" ")}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border bg-background">
        <Table className="min-w-[760px] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-24 text-center">项目</TableHead>
              {paipan.pillars.map((pillar) => (
                <TableHead key={pillar.key} className="text-center">
                  <div className="flex flex-col gap-1">
                    <span>{pillar.label}</span>
                    <span className="font-normal text-muted-foreground">{pillar.name}</span>
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {BAZI_TABLE_ROWS.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="text-center font-medium text-muted-foreground">
                  {row.label}
                </TableCell>
                {paipan.pillars.map((pillar) => (
                  <TableCell
                    key={`${row.key}-${pillar.key}`}
                    className="whitespace-normal text-center align-top leading-6"
                  >
                    {renderPillarValue(row.key, pillar)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function renderPillarValue(rowKey: BaziPaipanRowKey, pillar: BaziPillarDisplay) {
  if (rowKey === "hiddenStems") {
    return (
      <ValueStack
        items={pillar.hiddenStems.map(
          (hiddenStem) => `${hiddenStem.stem}（${hiddenStem.qiType}·${hiddenStem.tenGod}）`
        )}
      />
    );
  }

  if (rowKey === "shenSha") {
    return <ValueStack items={pillar.shenSha} compact />;
  }

  const value = pillar[rowKey];
  const isStemOrBranch = rowKey === "stem" || rowKey === "branch";

  return (
    <span className={cn(isStemOrBranch && "text-lg font-semibold")}>
      {value || "—"}
    </span>
  );
}

function ValueStack({ items, compact = false }: { items: string[]; compact?: boolean }) {
  if (items.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className={cn("flex flex-col", compact ? "gap-0.5" : "gap-1")}>
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}
