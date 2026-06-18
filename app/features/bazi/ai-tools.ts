import {
  buildBaziFlowDays,
  buildBaziFlowHours,
  buildBaziFlowMonths,
  type BaziFlowMonthDisplay,
  type BaziFortunePeriodDisplay,
  type BaziFlowYearDisplay,
  type BaziPaipan,
} from "@/features/bazi/paipan";

import {
  formatBaziPeriodDetailMarkdown,
  formatBaziShenshaMarkdown,
  formatBaziStructureMarkdown,
  formatBaziTimelineMarkdown,
} from "./ai-format";

export const BAZI_AI_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "bazi_structure",
      description:
        "分析当前八字命局结构证据，包括月令、五行、十神、透干、通根和原局刑冲合害。不要输出最终断命结论，适合在回答前取证。",
      parameters: {
        type: "object",
        properties: {
          focus: {
            type: "string",
            description: "可选。用户关注的主题，例如事业、财运、感情、健康、学业、阶段判断。",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bazi_timeline",
      description:
        "查看当前八字从指定公历年份开始的起运前、小运、大运、流年、年龄、太岁和与原局四柱的触发关系。适合回答阶段性趋势和重点年份。",
      parameters: {
        type: "object",
        properties: {
          startYear: {
            type: "integer",
            description: "起始公历年份。例如 2026。",
          },
          count: {
            type: "integer",
            description: "查询年数。默认 10。",
          },
        },
        required: ["startYear"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bazi_period_detail",
      description:
        "展开当前八字某一年、干支月、日期或时辰的周期证据，包括起运前/大运阶段、十神、藏干、星运、纳音、神煞和与原局关系。适合回答具体时间点。",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["year", "month", "day", "hour"],
            description: "周期层级: year/month/day/hour。",
          },
          year: {
            type: "integer",
            description: "scope=year/month 时必填，公历年份。",
          },
          month: {
            type: "integer",
            minimum: 1,
            maximum: 12,
            description: "scope=month 时必填，干支月序号 1-12，不是普通公历月。",
          },
          date: {
            type: "string",
            description: "scope=day/hour 时必填，格式 YYYY-MM-DD。",
          },
          hour: {
            type: "integer",
            minimum: 0,
            maximum: 23,
            description: "scope=hour 时必填，0-23。",
          },
        },
        required: ["scope"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bazi_shensha",
      description:
        "查看当前八字四柱命中的神煞清单。神煞只能作为辅助证据，不可单独断事。",
      parameters: {
        type: "object",
        properties: {
          onlyHits: {
            type: "boolean",
            description: "是否只返回命中项。当前排盘默认就是命中清单。",
          },
        },
      },
    },
  },
] as const;

type BaziAIToolName =
  | "bazi_structure"
  | "bazi_timeline"
  | "bazi_period_detail"
  | "bazi_shensha";

type ToolArgs = Record<string, unknown>;

export function executeBaziAITool(name: string, args: ToolArgs, paipan: BaziPaipan) {
  if (!isBaziAIToolName(name)) {
    return `工具错误: 未知工具 ${name}`;
  }

  try {
    switch (name) {
      case "bazi_structure":
        return formatBaziStructureMarkdown(
          paipan,
          typeof args.focus === "string" ? args.focus : undefined
        );
      case "bazi_timeline":
        return formatBaziTimelineMarkdown(
          paipan,
          toInt(args.startYear, paipan.fortune.currentYear),
          toInt(args.count, 10)
        );
      case "bazi_period_detail":
        return formatPeriodDetail(paipan, args);
      case "bazi_shensha":
        return formatBaziShenshaMarkdown(paipan, args.onlyHits === true);
    }
  } catch (error) {
    return `工具错误: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function formatPeriodDetail(paipan: BaziPaipan, args: ToolArgs) {
  const scope = typeof args.scope === "string" ? args.scope : "";

  if (scope === "year") {
    const year = toInt(args.year, NaN);
    const result = findFlowYear(paipan, year);

    if (!result) {
      throw new Error("scope=year 需要 year，且该年份必须在当前排盘的起运前或大运流年范围内。");
    }

    const { item, period } = result;

    return formatBaziPeriodDetailMarkdown(paipan, {
      scope,
      label: `${year}年`,
      item,
      extra: [
        ["阶段", formatFortunePeriodLabel(period)],
        ["年龄", `${item.age}岁`],
        ["小运", item.minorFortune?.name ?? "-"],
        ["小运十神", item.minorFortune?.tenGod ?? "-"],
        ["太岁", item.taiSui.join("、") || "-"],
      ],
    });
  }

  if (scope === "month") {
    const year = toInt(args.year, NaN);
    const month = toInt(args.month, NaN);

    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      throw new Error("scope=month 需要 year 和 month(1-12)。");
    }

    const item = buildBaziFlowMonths(year, paipan.fortune.context).find(
      (flowMonth) => flowMonth.month === month
    );

    if (!item) {
      throw new Error("scope=month 需要 year 和 month(1-12)。");
    }

    return formatBaziPeriodDetailMarkdown(paipan, {
      scope,
      label: `${year}年第${month}个干支月`,
      item,
      extra: [
        ["节气", item.jieQi],
        ["开始日期", item.startDate],
        ["结束日期", item.endDate],
      ],
    });
  }

  if (scope === "day") {
    const date = typeof args.date === "string" ? args.date : "";
    const item = findFlowDay(paipan, date);

    if (!item) {
      throw new Error("scope=day 需要 date，格式 YYYY-MM-DD。");
    }

    return formatBaziPeriodDetailMarkdown(paipan, {
      scope,
      label: date,
      item,
      extra: [["日期", item.date]],
    });
  }

  if (scope === "hour") {
    const date = typeof args.date === "string" ? args.date : "";
    const hour = toInt(args.hour, NaN);
    const day = findFlowDay(paipan, date);

    if (!day || !Number.isFinite(hour) || hour < 0 || hour > 23) {
      throw new Error("scope=hour 需要 date(YYYY-MM-DD) 和 hour(0-23)。");
    }

    const item = buildBaziFlowHours(day, paipan.fortune.context)[getHourBranchIndex(hour)];

    if (!item) {
      throw new Error("scope=hour 需要 hour(0-23)。");
    }

    return formatBaziPeriodDetailMarkdown(paipan, {
      scope,
      label: `${date} ${String(hour).padStart(2, "0")}:00`,
      item,
      extra: [
        ["时辰", item.branchTime],
        ["时间范围", item.timeRange],
      ],
    });
  }

  throw new Error("scope 必须是 year、month、day 或 hour。");
}

function findFlowYear(
  paipan: BaziPaipan,
  year: number
): { item: BaziFlowYearDisplay; period: BaziFortunePeriodDisplay } | null {
  if (!Number.isFinite(year)) {
    return null;
  }

  for (const period of paipan.fortune.periods) {
    const item = period.years.find((flowYear) => flowYear.year === year);

    if (item) {
      return { item, period };
    }
  }

  return null;
}

function formatFortunePeriodLabel(period: BaziFortunePeriodDisplay) {
  if (period.kind === "preFortune") {
    return `起运前 ${period.startYear}-${period.endYear}`;
  }

  return `${period.name}大运 ${period.startYear}-${period.endYear}`;
}

function findFlowDay(paipan: BaziPaipan, date: string) {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = findFlowMonthForDate(paipan, year, date);

  if (!month) {
    return null;
  }

  return buildBaziFlowDays(month, paipan.fortune.context).find(
    (flowDay) => flowDay.date === date
  ) ?? null;
}

function findFlowMonthForDate(
  paipan: BaziPaipan,
  year: number,
  date: string
): BaziFlowMonthDisplay | null {
  return buildBaziFlowMonths(year, paipan.fortune.context).find(
    (month) => month.startDate <= date && date <= month.endDate
  ) ?? null;
}

function getHourBranchIndex(hour: number) {
  if (hour === 23 || hour === 0) {
    return 0;
  }

  return Math.floor((hour + 1) / 2);
}

function toInt(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);

  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function isBaziAIToolName(value: string): value is BaziAIToolName {
  return (
    value === "bazi_structure" ||
    value === "bazi_timeline" ||
    value === "bazi_period_detail" ||
    value === "bazi_shensha"
  );
}
