import {
  BA_ZHUAN,
  BAI_HU,
  CI_GUAN,
  DIAO_KE,
  FEI_REN,
  FU_XING,
  GOU_SHA,
  GU_CHEN,
  GU_LUAN,
  GUA_SU,
  GUO_YIN,
  HONG_LUAN,
  HONG_YAN,
  HUA_GAI,
  JIANG_XING,
  JIAO_SHA,
  JIE_SHA,
  JIN_SHEN,
  KUI_GANG,
  LIU_XIA,
  LU_SHEN,
  PI_TOU,
  SAN_QI,
  SANG_MEN,
  SHI_E_DA_BAI,
  SI_FEI_RI,
  TAI_JI_GUI_REN,
  TAO_HUA,
  TIAN_CHU,
  TIAN_XI,
  TIAN_YI,
  TIAN_YI_GUI_REN,
  WANG_SHEN,
  WEN_CHANG,
  XUE_REN,
  XUE_TANG,
  YANG_REN,
  YI_MA,
  YIN_CHA_YANG_CUO,
  ZAI_SHA,
} from "taibu-core/data/shensha";
import {
  ChildLimit,
  Gender as TymeGender,
  HeavenStem,
  HideHeavenStemType,
  SixtyCycleYear,
  SolarDay,
  SolarTime,
  type EarthBranch,
  type Fortune,
  type SixtyCycle,
} from "tyme4ts";

export type BaziGender = "male" | "female";
export type BaziPillarKey = "year" | "month" | "day" | "hour";
export type BaziFortunePeriodKind = "preFortune" | "dayun";

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
  yearStem: string;
  dayStem: string;
  dayBranch: string;
  yearBranch: string;
  monthStem: string;
  monthBranch: string;
  hourStem: string;
  hourBranch: string;
  kongZhi: string[];
  yearNaYinElement: string;
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
  minorFortune?: BaziFlowItemDisplay;
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

export interface BaziFortunePeriodBase extends BaziFlowItemDisplay {
  startYear: number;
  endYear: number;
  startAge: number;
  years: BaziFlowYearDisplay[];
}

export interface BaziPreFortuneDisplay extends BaziFortunePeriodBase {
  kind: "preFortune";
  endAge: number;
}

export interface BaziDayunDisplay extends BaziFortunePeriodBase {
  kind: "dayun";
}

export type BaziFortunePeriodDisplay = BaziPreFortuneDisplay | BaziDayunDisplay;

export interface BaziFortuneDisplay {
  currentYear: number;
  context: BaziFortuneContext;
  preFortune: BaziPreFortuneDisplay | null;
  periods: BaziFortunePeriodDisplay[];
  dayuns: BaziDayunDisplay[];
  period: BaziFortunePeriodDisplay | null;
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

type BaziShenShaPosition = BaziPillarKey;

type BaziShenShaContext = {
  yearStem: string;
  yearBranch: string;
  monthStem: string;
  monthBranch: string;
  dayStem: string;
  dayBranch: string;
  hourStem: string;
  hourBranch: string;
  kongZhi: string[];
  yearNaYinElement: string;
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

const TAI_SUI_OPPOSITES: Record<string, string> = {
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

const TAI_SUI_COMBINES: Record<string, string> = {
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

const TAI_SUI_HARMS: Record<string, string> = {
  子: "未",
  丑: "午",
  寅: "巳",
  卯: "辰",
  辰: "卯",
  巳: "寅",
  午: "丑",
  未: "子",
  申: "亥",
  酉: "戌",
  戌: "酉",
  亥: "申",
};

const TAI_SUI_BREAKS: Record<string, string> = {
  子: "酉",
  酉: "子",
  丑: "辰",
  辰: "丑",
  寅: "亥",
  亥: "寅",
  卯: "午",
  午: "卯",
  巳: "申",
  申: "巳",
  未: "戌",
  戌: "未",
};

const TAI_SUI_PUNISHMENTS: string[][] = [
  ["子", "卯"],
  ["寅", "巳", "申"],
  ["丑", "未", "戌"],
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
  const childLimit = ChildLimit.fromSolarTime(solarTime, getTymeGender(input.gender));
  const eightChar = childLimit.getEightChar();
  const dayHeavenStem = eightChar.getDay().getHeavenStem();
  const tymePillars = {
    year: buildTymePillar(eightChar.getYear()),
    month: buildTymePillar(eightChar.getMonth()),
    day: buildTymePillar(eightChar.getDay()),
    hour: buildTymePillar(eightChar.getHour()),
  };
  const shenShaContext = buildShenShaContext(tymePillars);
  const fortuneContext = buildFortuneContext(tymePillars, shenShaContext);
  const pillars = PILLAR_META.map(({ key, label }) =>
    buildPillarDisplay(key, label, tymePillars[key], dayHeavenStem, shenShaContext)
  );

  return {
    name: input.name?.trim() ?? "",
    gender: input.gender,
    solarText: formatDateTimeParts(parts),
    dayMaster: dayHeavenStem.getName(),
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
    fortune: buildFortuneDisplay(parts, childLimit, dayHeavenStem, fortuneContext, shenShaContext),
    warnings: [],
  };
}

export function buildBaziFlowMonths(
  year: number,
  context: BaziFortuneContext
): BaziFlowMonthDisplay[] {
  const shenShaContext = toFlowShenShaContext(context);

  return SixtyCycleYear.fromYear(year).getMonths().map((month, index) => {
    const firstDay = month.getFirstDay().getSolarDay();
    const nextFirstDay = month.next(1).getFirstDay().getSolarDay();
    const cycle = month.getSixtyCycle();
    const flowItem = buildFlowItemDisplay({
      key: `month-${year}-${index + 1}`,
      label: "流月",
      cycle,
      dayHeavenStem: HeavenStemFromName(context.dayStem),
      shenShaContext,
    });

    return {
      ...flowItem,
      month: index + 1,
      jieQi: firstDay.getTerm().getName(),
      startDate: formatSolarDay(firstDay),
      endDate: formatSolarDay(nextFirstDay.next(-1)),
    };
  });
}

export function buildBaziFlowDays(
  month: Pick<BaziFlowMonthDisplay, "startDate" | "endDate">,
  context: BaziFortuneContext
): BaziFlowDayDisplay[] {
  const shenShaContext = toFlowShenShaContext(context);
  const dayHeavenStem = HeavenStemFromName(context.dayStem);
  const startDay = parseSolarDay(month.startDate);
  const endDay = parseSolarDay(month.endDate);
  const days: BaziFlowDayDisplay[] = [];

  for (let day = startDay; !day.isAfter(endDay); day = day.next(1)) {
    const cycleDay = day.getSixtyCycleDay();
    const cycle = cycleDay.getSixtyCycle();
    const flowItem = buildFlowItemDisplay({
      key: `day-${formatSolarDay(day)}`,
      label: "流日",
      cycle,
      dayHeavenStem,
      shenShaContext,
    });

    days.push({
      ...flowItem,
      date: formatSolarDay(day),
      day: day.getDay(),
    });
  }

  return days;
}

export function buildBaziFlowHours(
  day: Pick<BaziFlowDayDisplay, "date" | "stem">,
  context: BaziFortuneContext
): BaziFlowHourDisplay[] {
  const shenShaContext = toFlowShenShaContext(context);
  const dayHeavenStem = HeavenStemFromName(context.dayStem);
  const solarDay = parseSolarDay(day.date);

  return solarDay
    .getSixtyCycleDay()
    .getHours()
    .map((hour, index) => {
      const cycle = hour.getSixtyCycle();
      const branch = cycle.getEarthBranch().getName();
      const flowItem = buildFlowItemDisplay({
        key: `hour-${day.date}-${branch}`,
        label: "流时",
        cycle,
        dayHeavenStem,
        shenShaContext,
      });

      return {
        ...flowItem,
        branchTime: `${branch}时`,
        timeRange: HOUR_BRANCH_RANGES[index] ?? "",
      };
    });
}

function buildPillarDisplay(
  key: BaziPillarKey,
  label: string,
  tymePillar: TymePillar,
  dayHeavenStem: HeavenStem,
  shenShaContext: BaziShenShaContext
): BaziPillarDisplay {
  const pillarHeavenStem = tymePillar.cycle.getHeavenStem();
  const pillarEarthBranch = tymePillar.cycle.getEarthBranch();

  return {
    key,
    label,
    name: tymePillar.name,
    mainStar: getMainStar(key, dayHeavenStem, pillarHeavenStem),
    stem: tymePillar.stem,
    branch: tymePillar.branch,
    hiddenStems: buildHiddenStemDisplay(pillarEarthBranch, dayHeavenStem),
    starFortune: dayHeavenStem.getTerrain(pillarEarthBranch).getName(),
    selfSitting: pillarHeavenStem.getTerrain(pillarEarthBranch).getName(),
    kongWang: formatExtraEarthBranches(tymePillar.cycle),
    naYin: tymePillar.naYin,
    shenSha: calculateBranchShenSha(shenShaContext, tymePillar.branch, key),
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

function buildFortuneContext(
  tymePillars: Record<BaziPillarKey, TymePillar>,
  shenShaContext: BaziShenShaContext
): BaziFortuneContext {
  return {
    yearStem: tymePillars.year.stem,
    dayStem: tymePillars.day.stem,
    dayBranch: tymePillars.day.branch,
    yearBranch: tymePillars.year.branch,
    monthStem: tymePillars.month.stem,
    monthBranch: tymePillars.month.branch,
    hourStem: tymePillars.hour.stem,
    hourBranch: tymePillars.hour.branch,
    kongZhi: shenShaContext.kongZhi,
    yearNaYinElement: shenShaContext.yearNaYinElement,
  };
}

function buildFortuneDisplay(
  parts: DateTimeParts,
  childLimit: ReturnType<typeof ChildLimit.fromSolarTime>,
  dayHeavenStem: HeavenStem,
  context: BaziFortuneContext,
  shenShaContext: BaziShenShaContext
): BaziFortuneDisplay {
  const currentYear = new Date().getFullYear();
  const dayuns = Array.from({ length: 10 }, (_, index) =>
    buildDayunDisplay(childLimit.getStartDecadeFortune().next(index), dayHeavenStem, shenShaContext)
  );
  const preFortune = buildPreFortuneDisplay(
    parts,
    childLimit,
    dayHeavenStem,
    shenShaContext,
    dayuns[0] ?? null
  );
  const periods = [preFortune, ...dayuns].filter(Boolean) as BaziFortunePeriodDisplay[];
  const activePeriod =
    periods.find((period) => period.startYear <= currentYear && currentYear <= period.endYear) ??
    dayuns[0] ??
    preFortune ??
    null;
  const activeDayun = activePeriod?.kind === "dayun" ? activePeriod : null;

  return {
    currentYear,
    context,
    preFortune,
    periods,
    dayuns,
    period: activePeriod,
    dayun: activeDayun,
    years: activePeriod?.years ?? [],
  };
}

function buildPreFortuneDisplay(
  parts: DateTimeParts,
  childLimit: ReturnType<typeof ChildLimit.fromSolarTime>,
  dayHeavenStem: HeavenStem,
  shenShaContext: BaziShenShaContext,
  firstDayun: BaziDayunDisplay | null
): BaziPreFortuneDisplay | null {
  if (!firstDayun || firstDayun.startAge <= 1 || firstDayun.startYear <= parts.year) {
    return null;
  }

  const years = Array.from({ length: firstDayun.startAge - 1 }, (_, index) => {
    const age = index + 1;
    const year = parts.year + index;
    const minorFortune = buildMinorFortuneDisplay(
      childLimit.getStartFortune().next(age - firstDayun.startAge),
      dayHeavenStem,
      shenShaContext
    );

    return buildFlowYearDisplay(year, age, dayHeavenStem, shenShaContext, minorFortune);
  }).filter((year) => year.year < firstDayun.startYear);

  if (years.length === 0) {
    return null;
  }

  return {
    key: "pre-fortune",
    kind: "preFortune",
    label: "起运前",
    startYear: years[0].year,
    endYear: years[years.length - 1].year,
    startAge: years[0].age,
    endAge: years[years.length - 1].age,
    name: "童限",
    stem: "",
    branch: "",
    tenGod: "小运",
    hiddenStems: [],
    starFortune: "",
    selfSitting: "",
    kongWang: "",
    naYin: "",
    shenSha: [],
    years,
  };
}

function buildDayunDisplay(
  dayun: ReturnType<ReturnType<typeof ChildLimit.fromSolarTime>["getStartDecadeFortune"]>,
  dayHeavenStem: HeavenStem,
  shenShaContext: BaziShenShaContext
): BaziDayunDisplay {
  const cycle = dayun.getSixtyCycle();
  const flowItem = buildFlowItemDisplay({
    key: `dayun-${dayun.getStartSixtyCycleYear().getYear()}`,
    label: "大运",
    cycle,
    dayHeavenStem,
    shenShaContext,
  });
  const startYear = dayun.getStartSixtyCycleYear().getYear();
  const startAge = dayun.getStartAge();

  return {
    ...flowItem,
    kind: "dayun",
    startYear,
    endYear: dayun.getEndSixtyCycleYear().getYear(),
    startAge,
    years: Array.from({ length: 10 }, (_, index) =>
      buildFlowYearDisplay(startYear + index, startAge + index, dayHeavenStem, shenShaContext)
    ),
  };
}

function buildFlowYearDisplay(
  year: number,
  age: number,
  dayHeavenStem: HeavenStem,
  shenShaContext: BaziShenShaContext,
  minorFortune?: BaziFlowItemDisplay
): BaziFlowYearDisplay {
  const cycle = SixtyCycleYear.fromYear(year).getSixtyCycle();
  const branch = cycle.getEarthBranch().getName();
  const flowItem = buildFlowItemDisplay({
    key: `year-${year}`,
    label: "流年",
    cycle,
    dayHeavenStem,
    shenShaContext,
  });

  return {
    ...flowItem,
    year,
    age,
    taiSui: calculateTaiSui(branch, shenShaContext.yearBranch),
    minorFortune,
  };
}

function buildMinorFortuneDisplay(
  fortune: Fortune,
  dayHeavenStem: HeavenStem,
  shenShaContext: BaziShenShaContext
): BaziFlowItemDisplay {
  return buildFlowItemDisplay({
    key: `minor-fortune-${fortune.getAge()}`,
    label: "小运",
    cycle: fortune.getSixtyCycle(),
    dayHeavenStem,
    shenShaContext,
  });
}

function buildFlowItemDisplay({
  key,
  label,
  cycle,
  dayHeavenStem,
  shenShaContext,
}: {
  key: string;
  label: string;
  cycle: SixtyCycle;
  dayHeavenStem: HeavenStem;
  shenShaContext: BaziShenShaContext;
}): BaziFlowItemDisplay {
  const heavenStem = cycle.getHeavenStem();
  const earthBranch = cycle.getEarthBranch();
  const stem = heavenStem.getName();
  const branch = earthBranch.getName();

  return {
    key,
    label,
    name: cycle.getName(),
    stem,
    branch,
    tenGod: dayHeavenStem.getTenStar(heavenStem).getName(),
    hiddenStems: buildHiddenStemDisplay(earthBranch, dayHeavenStem),
    starFortune: dayHeavenStem.getTerrain(earthBranch).getName(),
    selfSitting: heavenStem.getTerrain(earthBranch).getName(),
    kongWang: formatExtraEarthBranches(cycle),
    naYin: cycle.getSound().getName(),
    shenSha: calculateBranchShenSha(shenShaContext, branch),
  };
}

function buildHiddenStemDisplay(
  earthBranch: EarthBranch,
  dayHeavenStem: HeavenStem
): BaziHiddenStemDisplay[] {
  return earthBranch.getHideHeavenStems().map((hiddenStem) => ({
    stem: hiddenStem.getName(),
    qiType: getHiddenStemQiType(hiddenStem.getType()),
    tenGod: dayHeavenStem.getTenStar(hiddenStem.getHeavenStem()).getName(),
  }));
}

function buildShenShaContext(
  tymePillars: Record<BaziPillarKey, TymePillar>
): BaziShenShaContext {
  const yearNaYin = tymePillars.year.naYin;
  const yearNaYinElement = yearNaYin.slice(-1);

  return {
    yearStem: tymePillars.year.stem,
    yearBranch: tymePillars.year.branch,
    monthStem: tymePillars.month.stem,
    monthBranch: tymePillars.month.branch,
    dayStem: tymePillars.day.stem,
    dayBranch: tymePillars.day.branch,
    hourStem: tymePillars.hour.stem,
    hourBranch: tymePillars.hour.branch,
    kongZhi: tymePillars.day.cycle.getExtraEarthBranches().map((branch) => branch.getName()),
    yearNaYinElement: ["金", "木", "水", "火", "土"].includes(yearNaYinElement)
      ? yearNaYinElement
      : "",
  };
}

function toFlowShenShaContext(context: BaziFortuneContext): BaziShenShaContext {
  return {
    yearStem: context.yearStem,
    yearBranch: context.yearBranch,
    monthStem: context.monthStem,
    monthBranch: context.monthBranch,
    dayStem: context.dayStem,
    dayBranch: context.dayBranch,
    hourStem: context.hourStem,
    hourBranch: context.hourBranch,
    kongZhi: context.kongZhi,
    yearNaYinElement: context.yearNaYinElement,
  };
}

function calculateBranchShenSha(
  context: BaziShenShaContext,
  targetBranch: string,
  positionHint?: BaziShenShaPosition
): string[] {
  const names: string[] = [];

  matchValue(TIAN_YI_GUI_REN[context.dayStem], targetBranch, "天乙贵人", names);
  matchValue(TAI_JI_GUI_REN[context.dayStem], targetBranch, "太极贵人", names);
  matchValue(TAI_JI_GUI_REN[context.yearStem], targetBranch, "太极贵人", names);
  matchMapValue(LU_SHEN, context.dayStem, targetBranch, "禄神", names);
  matchMapValue(YANG_REN, context.dayStem, targetBranch, "羊刃", names);
  matchMapValue(WEN_CHANG, context.dayStem, targetBranch, "文昌", names);
  matchMapValue(TIAN_CHU, context.dayStem, targetBranch, "天厨", names);
  matchMapValue(GUO_YIN, context.dayStem, targetBranch, "国印贵人", names);
  matchMapValue(FU_XING, context.dayStem, targetBranch, "福星贵人", names);
  matchMapValue(LIU_XIA, context.dayStem, targetBranch, "流霞", names);
  matchMapValue(HONG_YAN, context.dayStem, targetBranch, "红艳煞", names);
  matchMapValue(FEI_REN, context.dayStem, targetBranch, "飞刃", names);
  matchMapValue(CI_GUAN, context.dayStem, targetBranch, "词馆", names);

  matchMapValue(YI_MA, context.dayBranch, targetBranch, "驿马", names);
  matchMapValue(YI_MA, context.yearBranch, targetBranch, "驿马", names);
  matchMapValue(TAO_HUA, context.dayBranch, targetBranch, "桃花", names);
  matchMapValue(TAO_HUA, context.yearBranch, targetBranch, "桃花", names);
  matchMapValue(HUA_GAI, context.dayBranch, targetBranch, "华盖", names);
  matchMapValue(HUA_GAI, context.yearBranch, targetBranch, "华盖", names);
  matchMapValue(JIANG_XING, context.dayBranch, targetBranch, "将星", names);
  matchMapValue(JIANG_XING, context.yearBranch, targetBranch, "将星", names);
  matchMapValue(JIE_SHA, context.dayBranch, targetBranch, "劫煞", names);
  matchMapValue(JIE_SHA, context.yearBranch, targetBranch, "劫煞", names);
  matchMapValue(WANG_SHEN, context.dayBranch, targetBranch, "亡神", names);
  matchMapValue(WANG_SHEN, context.yearBranch, targetBranch, "亡神", names);
  matchMapValue(ZAI_SHA, context.dayBranch, targetBranch, "灾煞", names);
  matchMapValue(ZAI_SHA, context.yearBranch, targetBranch, "灾煞", names);

  if (context.yearNaYinElement) {
    matchMapValue(XUE_TANG, context.yearNaYinElement, targetBranch, "学堂", names);
  }
  matchMapValue(HONG_LUAN, context.yearBranch, targetBranch, "红鸾", names);
  matchMapValue(TIAN_XI, context.yearBranch, targetBranch, "天喜", names);
  matchMapValue(DIAO_KE, context.yearBranch, targetBranch, "吊客", names);
  matchMapValue(SANG_MEN, context.yearBranch, targetBranch, "丧门", names);
  matchMapValue(PI_TOU, context.yearBranch, targetBranch, "披头", names);
  matchMapValue(GOU_SHA, context.yearBranch, targetBranch, "勾煞", names);
  matchMapValue(JIAO_SHA, context.yearBranch, targetBranch, "绞煞", names);

  matchMapValue(TIAN_YI, context.monthBranch, targetBranch, "天医", names);
  matchMapValue(BAI_HU, context.monthBranch, targetBranch, "白虎", names);
  matchMapValue(XUE_REN, context.dayBranch, targetBranch, "血刃", names);

  if (GU_CHEN[context.yearBranch] === targetBranch) {
    addUnique(names, "孤辰");
  }

  if (GUA_SU[context.yearBranch] === targetBranch) {
    addUnique(names, "寡宿");
  }

  if (context.kongZhi.includes(targetBranch)) {
    addUnique(names, "空亡");
  }

  if (positionHint) {
    const allBranches = [
      context.yearBranch,
      context.monthBranch,
      context.dayBranch,
      context.hourBranch,
    ];

    if (targetBranch === "戌" && allBranches.includes("亥")) addUnique(names, "天罗");
    if (targetBranch === "亥" && allBranches.includes("戌")) addUnique(names, "天罗");
    if (targetBranch === "辰" && allBranches.includes("巳")) addUnique(names, "地网");
    if (targetBranch === "巳" && allBranches.includes("辰")) addUnique(names, "地网");
  }

  if (positionHint === "day") {
    checkDayPillarShenSha(
      context.dayStem,
      context.dayBranch,
      context.monthBranch,
      names,
      true
    );
  }

  if (positionHint) {
    const stems = [context.yearStem, context.monthStem, context.dayStem, context.hourStem];
    const positions: BaziShenShaPosition[] = ["year", "month", "day", "hour"];

    for (const [qiName, qiStems] of Object.entries(SAN_QI)) {
      for (let index = 0; index <= stems.length - 3; index++) {
        if (
          stems[index] === qiStems[0] &&
          stems[index + 1] === qiStems[1] &&
          stems[index + 2] === qiStems[2] &&
          [positions[index], positions[index + 1], positions[index + 2]].includes(positionHint)
        ) {
          addUnique(names, qiName);
          break;
        }
      }
    }
  }

  if (!positionHint) {
    checkDayPillarShenSha(context.dayStem, context.dayBranch, context.monthBranch, names, false);
  }

  return names;
}

function checkDayPillarShenSha(
  dayStem: string,
  dayBranch: string,
  monthBranch: string,
  names: string[],
  includeFull: boolean
) {
  const dayPillar = `${dayStem}${dayBranch}`;

  if (KUI_GANG.includes(dayPillar)) addUnique(names, "魁罡");
  if (YIN_CHA_YANG_CUO.includes(dayPillar)) addUnique(names, "阴差阳错");
  if (SHI_E_DA_BAI.includes(dayPillar)) addUnique(names, "十恶大败");

  if (!includeFull) {
    return;
  }

  if (BA_ZHUAN.includes(dayPillar)) addUnique(names, "八专");
  if (JIN_SHEN.includes(dayPillar)) addUnique(names, "金神");
  if (GU_LUAN.includes(dayPillar)) addUnique(names, "孤鸾煞");
  if (SI_FEI_RI[monthBranch]?.includes(dayPillar)) addUnique(names, "四废");
}

function addUnique(target: string[], value: string) {
  if (value && !target.includes(value)) {
    target.push(value);
  }
}

function matchValue(
  values: string[] | undefined,
  targetBranch: string,
  label: string,
  bag: string[]
) {
  if (values?.includes(targetBranch)) {
    addUnique(bag, label);
  }
}

function matchMapValue(
  map: Record<string, string>,
  key: string,
  targetBranch: string,
  label: string,
  bag: string[]
) {
  if (map[key] === targetBranch) {
    addUnique(bag, label);
  }
}

function calculateTaiSui(flowBranch: string, yearBranch: string) {
  const result: string[] = [];

  if (flowBranch === yearBranch) {
    result.push("值太岁");
  }

  if (TAI_SUI_OPPOSITES[flowBranch] === yearBranch) {
    result.push("冲太岁");
  }

  if (TAI_SUI_COMBINES[flowBranch] === yearBranch) {
    result.push("合太岁");
  }

  if (TAI_SUI_PUNISHMENTS.some((branches) => branches.includes(flowBranch) && branches.includes(yearBranch))) {
    result.push("刑太岁");
  }

  if (TAI_SUI_HARMS[flowBranch] === yearBranch) {
    result.push("害太岁");
  }

  if (TAI_SUI_BREAKS[flowBranch] === yearBranch) {
    result.push("破太岁");
  }

  return result;
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

function HeavenStemFromName(name: string) {
  return HeavenStem.fromName(name);
}

function parseSolarDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return SolarDay.fromYmd(year, month, day);
}

function formatSolarDay(day: SolarDay) {
  return `${day.getYear()}-${pad(day.getMonth())}-${pad(day.getDay())}`;
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
