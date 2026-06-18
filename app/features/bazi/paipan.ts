import {
  calculateBazi,
  calculateBaziLiuRiData,
  calculateBaziLiuYueData,
  type BaziOutput,
} from "taibu-core/bazi";
import { calculateBaziDayun } from "taibu-core/bazi-dayun";
import { HIDDEN_STEM_DETAILS, NA_YIN_TABLE } from "taibu-core/data/shensha";
import { calculateTenGod, DI_ZHI, getDiShi, getKongWang, TIAN_GAN } from "taibu-core/utils";
import {
  ChildLimit,
  Gender as TymeGender,
  HideHeavenStemType,
  SolarTime,
  type HeavenStem,
  type SixtyCycle,
} from "tyme4ts";

export type BaziGender = "male" | "female";
export type BaziPillarKey = "year" | "month" | "day" | "hour";

export interface BaziPaipanInput {
  name?: string;
  gender: BaziGender;
  date: Date;
  time: string;
}

export interface BaziHiddenStemDisplay {
  stem: string;
  qiType: string;
  tenGod: string;
}

export interface BaziPillarDisplay {
  key: BaziPillarKey;
  label: string;
  name: string;
  mainStar: string;
  stem: string;
  branch: string;
  hiddenStems: BaziHiddenStemDisplay[];
  starFortune: string;
  selfSitting: string;
  kongWang: string;
  naYin: string;
  shenSha: string[];
}

export interface BaziAuxiliaryPillarDisplay {
  key: "fetalOrigin" | "fetalBreath" | "ownSign" | "bodySign";
  label: string;
  value: string;
}

export interface BaziFortuneContext {
  dayStem: string;
  dayBranch: string;
  yearBranch: string;
}

export interface BaziFlowItemDisplay {
  key: string;
  label: string;
  name: string;
  stem: string;
  branch: string;
  tenGod: string;
  hiddenStems: BaziHiddenStemDisplay[];
  starFortune: string;
  selfSitting: string;
  kongWang: string;
  naYin: string;
  shenSha: string[];
}

export interface BaziFlowYearDisplay extends BaziFlowItemDisplay {
  year: number;
  age: number;
  taiSui: string[];
}

export interface BaziFlowMonthDisplay extends BaziFlowItemDisplay {
  month: number;
  jieQi: string;
  startDate: string;
  endDate: string;
}

export interface BaziFlowDayDisplay extends BaziFlowItemDisplay {
  date: string;
  day: number;
}

export interface BaziFlowHourDisplay extends BaziFlowItemDisplay {
  branchTime: string;
  timeRange: string;
}

export interface BaziDayunDisplay extends BaziFlowItemDisplay {
  startYear: number;
  endYear: number;
  startAge: number;
  years: BaziFlowYearDisplay[];
}

export interface BaziFortuneDisplay {
  currentYear: number;
  context: BaziFortuneContext;
  dayuns: BaziDayunDisplay[];
  dayun: BaziDayunDisplay | null;
  years: BaziFlowYearDisplay[];
}

export interface BaziPaipan {
  name: string;
  gender: BaziGender;
  solarText: string;
  dayMaster: string;
  kongWangText: string;
  tymeEightChar: string;
  pillars: BaziPillarDisplay[];
  auxiliaryPillars: BaziAuxiliaryPillarDisplay[];
  commanderText: string;
  fortuneStartText: string;
  fortune: BaziFortuneDisplay;
  warnings: string[];
}

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

type TymePillar = {
  cycle: SixtyCycle;
  name: string;
  stem: string;
  branch: string;
  naYin: string;
};

type CoreHiddenStem = {
  stem: string;
  qiType?: string;
  tenGod?: string;
};

const PILLAR_META = [
  { key: "year", label: "年柱" },
  { key: "month", label: "月柱" },
  { key: "day", label: "日柱" },
  { key: "hour", label: "时柱" },
] satisfies Array<{ key: BaziPillarKey; label: string }>;

const GENDER_LABELS: Record<BaziGender, string> = {
  male: "男",
  female: "女",
};

const HOUR_BRANCH_RANGES = [
  "23:00-00:59",
  "01:00-02:59",
  "03:00-04:59",
  "05:00-06:59",
  "07:00-08:59",
  "09:00-10:59",
  "11:00-12:59",
  "13:00-14:59",
  "15:00-16:59",
  "17:00-18:59",
  "19:00-20:59",
  "21:00-22:59",
];

export function getBaziGenderLabel(gender: BaziGender) {
  return GENDER_LABELS[gender];
}

export function buildBaziPaipan(input: BaziPaipanInput): BaziPaipan {
  const parts = getDateTimeParts(input.date, input.time);
  const solarTime = SolarTime.fromYmdHms(
    parts.year,
    parts.month,
    parts.day,
    parts.hour,
    parts.minute,
    0
  );
  const eightChar = solarTime.getLunarHour().getEightChar();
  const dayHeavenStem = eightChar.getDay().getHeavenStem();
  const tymePillars = {
    year: buildTymePillar(eightChar.getYear()),
    month: buildTymePillar(eightChar.getMonth()),
    day: buildTymePillar(eightChar.getDay()),
    hour: buildTymePillar(eightChar.getHour()),
  };
  const chart = calculateBazi({
    birthYear: parts.year,
    birthMonth: parts.month,
    birthDay: parts.day,
    birthHour: parts.hour,
    birthMinute: parts.minute,
    gender: input.gender,
    calendarType: "solar",
  });

  const dayMaster = dayHeavenStem.getName();
  const warnings = buildPillarConsistencyWarnings(chart, tymePillars);
  const pillars = PILLAR_META.map(({ key, label }) =>
    buildPillarDisplay(key, label, chart, tymePillars[key], dayHeavenStem)
  );
  const childLimit = ChildLimit.fromSolarTime(solarTime, getTymeGender(input.gender));
  const fortuneContext = buildFortuneContext(chart);

  return {
    name: input.name?.trim() ?? "",
    gender: input.gender,
    solarText: formatDateTimeParts(parts),
    dayMaster,
    kongWangText: formatPillarKongWangText(eightChar.getDay()),
    tymeEightChar: eightChar.getName(),
    pillars,
    auxiliaryPillars: [
      { key: "fetalOrigin", label: "胎元", value: eightChar.getFetalOrigin().getName() },
      { key: "fetalBreath", label: "胎息", value: eightChar.getFetalBreath().getName() },
      { key: "ownSign", label: "命宫", value: eightChar.getOwnSign().getName() },
      { key: "bodySign", label: "身宫", value: eightChar.getBodySign().getName() },
    ],
    commanderText: formatCommanderText(solarTime),
    fortuneStartText: formatChildLimitText(childLimit),
    fortune: buildFortuneDisplay(parts, input.gender, fortuneContext),
    warnings,
  };
}

export function buildBaziFlowMonths(
  year: number,
  context: BaziFortuneContext
): BaziFlowMonthDisplay[] {
  return calculateBaziLiuYueData(year, context).map((month) => {
    const stem = month.gan ?? "";
    const branch = month.zhi ?? "";

    return {
      key: `month-${year}-${month.month}`,
      label: "流月",
      month: month.month,
      jieQi: month.jieQi,
      startDate: month.startDate,
      endDate: month.endDate,
      name: month.ganZhi,
      stem,
      branch,
      tenGod: month.tenGod ?? "",
      hiddenStems: buildHiddenStemDisplayFromCore(month.hiddenStems),
      starFortune: month.diShi ?? "",
      selfSitting: buildFlowSelfSitting(stem, branch),
      kongWang: formatCoreKongWang(stem, branch),
      naYin: month.naYin ?? "",
      shenSha: month.shenSha ?? [],
    };
  });
}

export function buildBaziFlowDays(
  month: Pick<BaziFlowMonthDisplay, "startDate" | "endDate">,
  context: BaziFortuneContext
): BaziFlowDayDisplay[] {
  return calculateBaziLiuRiData(month.startDate, month.endDate, context).map((day) => ({
    key: `day-${day.date}`,
    label: "流日",
    date: day.date,
    day: day.day,
    name: day.ganZhi,
    stem: day.gan,
    branch: day.zhi,
    tenGod: day.tenGod ?? "",
    hiddenStems: buildHiddenStemDisplayFromCore(day.hiddenStems),
    starFortune: day.diShi ?? "",
    selfSitting: buildFlowSelfSitting(day.gan, day.zhi),
    kongWang: formatCoreKongWang(day.gan, day.zhi),
    naYin: day.naYin ?? "",
    shenSha: day.shenSha ?? [],
  }));
}

export function buildBaziFlowHours(
  day: Pick<BaziFlowDayDisplay, "date" | "stem">,
  context: BaziFortuneContext
): BaziFlowHourDisplay[] {
  const dayStemIndex = TIAN_GAN.indexOf(day.stem as (typeof TIAN_GAN)[number]);
  const startStemIndex = dayStemIndex >= 0 ? (dayStemIndex % 5) * 2 : 0;

  return DI_ZHI.map((branch, branchIndex) => {
    const stem = TIAN_GAN[(startStemIndex + branchIndex) % TIAN_GAN.length];
    const name = `${stem}${branch}`;

    return {
      key: `hour-${day.date}-${branch}`,
      label: "流时",
      branchTime: `${branch}时`,
      timeRange: HOUR_BRANCH_RANGES[branchIndex],
      name,
      stem,
      branch,
      tenGod: calculateTenGod(context.dayStem, stem),
      hiddenStems: buildHiddenStemDisplayFromCore(
        HIDDEN_STEM_DETAILS[branch].map((hiddenStem) => ({
          ...hiddenStem,
          tenGod: calculateTenGod(context.dayStem, hiddenStem.stem),
        }))
      ),
      starFortune: getDiShi(context.dayStem, branch),
      selfSitting: buildFlowSelfSitting(stem, branch),
      kongWang: formatCoreKongWang(stem, branch),
      naYin: NA_YIN_TABLE[name] ?? "",
      shenSha: [],
    };
  });
}

function buildPillarDisplay(
  key: BaziPillarKey,
  label: string,
  chart: BaziOutput,
  tymePillar: TymePillar,
  dayHeavenStem: HeavenStem
): BaziPillarDisplay {
  const pillar = chart.fourPillars[key];
  const pillarHeavenStem = tymePillar.cycle.getHeavenStem();
  const pillarEarthBranch = tymePillar.cycle.getEarthBranch();

  return {
    key,
    label,
    name: tymePillar.name,
    mainStar: getMainStar(key, dayHeavenStem, pillarHeavenStem),
    stem: tymePillar.stem,
    branch: tymePillar.branch,
    hiddenStems: pillarEarthBranch.getHideHeavenStems().map((hiddenStem) => ({
      stem: hiddenStem.getName(),
      qiType: getHiddenStemQiType(hiddenStem.getType()),
      tenGod: dayHeavenStem.getTenStar(hiddenStem.getHeavenStem()).getName(),
    })),
    starFortune: dayHeavenStem.getTerrain(pillarEarthBranch).getName(),
    selfSitting: pillarHeavenStem.getTerrain(pillarEarthBranch).getName(),
    kongWang: formatExtraEarthBranches(tymePillar.cycle),
    naYin: tymePillar.naYin,
    shenSha: pillar.shenSha,
  };
}

function buildTymePillar(pillar: SixtyCycle): TymePillar {
  return {
    cycle: pillar,
    name: pillar.getName(),
    stem: pillar.getHeavenStem().getName(),
    branch: pillar.getEarthBranch().getName(),
    naYin: pillar.getSound().getName(),
  };
}

function buildFortuneContext(chart: BaziOutput): BaziFortuneContext {
  return {
    dayStem: chart.fourPillars.day.stem,
    dayBranch: chart.fourPillars.day.branch,
    yearBranch: chart.fourPillars.year.branch,
  };
}

function buildFortuneDisplay(
  parts: DateTimeParts,
  gender: BaziGender,
  context: BaziFortuneContext
): BaziFortuneDisplay {
  const currentYear = new Date().getFullYear();
  const dayunOutput = calculateBaziDayun({
    birthYear: parts.year,
    birthMonth: parts.month,
    birthDay: parts.day,
    birthHour: parts.hour,
    birthMinute: parts.minute,
    gender,
    calendarType: "solar",
  });
  const activeDayun =
    dayunOutput.list.find((dayun, index) => {
      const nextDayun = dayunOutput.list[index + 1];

      return dayun.startYear <= currentYear && (!nextDayun || currentYear < nextDayun.startYear);
    }) ?? dayunOutput.list[0];
  const dayuns = dayunOutput.list.map((dayun, index) =>
    buildDayunDisplay(dayun, dayunOutput.list[index + 1])
  );
  const activeDayunDisplay =
    activeDayun == null
      ? null
      : dayuns.find((dayun) => dayun.startYear === activeDayun.startYear) ?? null;

  return {
    currentYear,
    context,
    dayuns,
    dayun: activeDayunDisplay,
    years: activeDayunDisplay?.years ?? [],
  };
}

function buildDayunDisplay(
  dayun: ReturnType<typeof calculateBaziDayun>["list"][number],
  nextDayun: ReturnType<typeof calculateBaziDayun>["list"][number] | undefined
): BaziDayunDisplay {
  return {
    key: `dayun-${dayun.startYear}`,
    label: "大运",
    startYear: dayun.startYear,
    endYear: nextDayun ? nextDayun.startYear - 1 : dayun.startYear + 9,
    startAge: dayun.startAge,
    name: dayun.ganZhi,
    stem: dayun.stem,
    branch: dayun.branch,
    tenGod: dayun.tenGod,
    hiddenStems: buildHiddenStemDisplayFromCore(dayun.hiddenStems),
    starFortune: dayun.diShi,
    selfSitting: buildFlowSelfSitting(dayun.stem, dayun.branch),
    kongWang: formatCoreKongWang(dayun.stem, dayun.branch),
    naYin: dayun.naYin,
    shenSha: dayun.shenSha,
    years: dayun.liunianList.map(buildFlowYearDisplay),
  };
}

function buildFlowYearDisplay(
  year: ReturnType<typeof calculateBaziDayun>["list"][number]["liunianList"][number]
): BaziFlowYearDisplay {
  return {
    key: `year-${year.year}`,
    label: "流年",
    year: year.year,
    age: year.age,
    name: year.ganZhi,
    stem: year.gan,
    branch: year.zhi,
    tenGod: year.tenGod,
    hiddenStems: buildHiddenStemDisplayFromCore(year.hiddenStems),
    starFortune: year.diShi,
    selfSitting: buildFlowSelfSitting(year.gan, year.zhi),
    kongWang: formatCoreKongWang(year.gan, year.zhi),
    naYin: year.nayin,
    shenSha: year.shenSha,
    taiSui: year.taiSui,
  };
}

function buildHiddenStemDisplayFromCore(
  hiddenStems: CoreHiddenStem[] | undefined
): BaziHiddenStemDisplay[] {
  return (hiddenStems ?? []).map((hiddenStem) => ({
    stem: hiddenStem.stem,
    qiType: hiddenStem.qiType ?? "",
    tenGod: hiddenStem.tenGod ?? "",
  }));
}

function buildFlowSelfSitting(stem: string, branch: string) {
  return stem && branch ? getDiShi(stem, branch) : "";
}

function formatCoreKongWang(stem: string, branch: string) {
  if (!stem || !branch) {
    return "";
  }

  return getKongWang(stem, branch).kongZhi.join("");
}

function buildPillarConsistencyWarnings(
  chart: BaziOutput,
  tymePillars: Record<BaziPillarKey, TymePillar>
) {
  const tymeNames = PILLAR_META.map(({ key }) => tymePillars[key].name);
  const taibuNames = PILLAR_META.map(({ key }) => {
    const pillar = chart.fourPillars[key];

    return `${pillar.stem}${pillar.branch}`;
  });

  if (tymeNames.join(" ") === taibuNames.join(" ")) {
    return [];
  }

  return [`tyme4ts 四柱 ${tymeNames.join(" ")} 与 taibu-core 四柱 ${taibuNames.join(" ")} 不一致。`];
}

function getMainStar(key: BaziPillarKey, dayHeavenStem: HeavenStem, pillarHeavenStem: HeavenStem) {
  if (key === "day") {
    return "日主";
  }

  return dayHeavenStem.getTenStar(pillarHeavenStem).getName();
}

function getHiddenStemQiType(type: HideHeavenStemType) {
  switch (type) {
    case HideHeavenStemType.MAIN:
      return "本气";
    case HideHeavenStemType.MIDDLE:
      return "中气";
    case HideHeavenStemType.RESIDUAL:
      return "余气";
  }
}

function getTymeGender(gender: BaziGender) {
  return gender === "male" ? TymeGender.MAN : TymeGender.WOMAN;
}

function formatPillarKongWangText(pillar: SixtyCycle) {
  return `${pillar.getTen().getName()}旬 ${formatExtraEarthBranches(pillar, "、")}空`;
}

function formatExtraEarthBranches(pillar: SixtyCycle, separator = "") {
  return pillar
    .getExtraEarthBranches()
    .map((branch) => branch.getName())
    .join(separator);
}

function formatCommanderText(solarTime: SolarTime) {
  const commander = solarTime.getSolarDay().getHideHeavenStemDay();

  return commander.getName();
}

function formatChildLimitText(childLimit: ReturnType<typeof ChildLimit.fromSolarTime>) {
  const parts = [
    { value: childLimit.getYearCount(), unit: "年" },
    { value: childLimit.getMonthCount(), unit: "个月" },
    { value: childLimit.getDayCount(), unit: "天" },
    { value: childLimit.getHourCount(), unit: "小时" },
    { value: childLimit.getMinuteCount(), unit: "分" },
  ];
  const text = parts
    .filter((part) => part.value > 0)
    .map((part) => `${part.value}${part.unit}`)
    .join("");

  return text || "即刻起运";
}

function getDateTimeParts(date: Date, time: string): DateTimeParts {
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const { hour, minute } = parseTime(time);

  return {
    year: safeDate.getFullYear(),
    month: safeDate.getMonth() + 1,
    day: safeDate.getDate(),
    hour,
    minute,
  };
}

function parseTime(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);

  if (!match) {
    return { hour: 0, minute: 0 };
  }

  return {
    hour: clamp(Number(match[1]), 0, 23),
    minute: clamp(Number(match[2]), 0, 59),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function formatDateTimeParts(parts: DateTimeParts) {
  return `${parts.year}年${pad(parts.month)}月${pad(parts.day)}日 ${pad(parts.hour)}:${pad(parts.minute)}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
