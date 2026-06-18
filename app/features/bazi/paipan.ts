import { calculateBazi, type BaziOutput } from "taibu-core/bazi";
import { HideHeavenStemType, SolarTime, type HeavenStem, type SixtyCycle } from "tyme4ts";

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

export interface BaziPaipan {
  name: string;
  gender: BaziGender;
  solarText: string;
  dayMaster: string;
  kongWangText: string;
  tymeEightChar: string;
  pillars: BaziPillarDisplay[];
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

  return {
    name: input.name?.trim() ?? "",
    gender: input.gender,
    solarText: formatDateTimeParts(parts),
    dayMaster,
    kongWangText: formatPillarKongWangText(eightChar.getDay()),
    tymeEightChar: eightChar.getName(),
    pillars,
    warnings,
  };
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

function formatPillarKongWangText(pillar: SixtyCycle) {
  return `${pillar.getTen().getName()}旬 ${formatExtraEarthBranches(pillar, "、")}空`;
}

function formatExtraEarthBranches(pillar: SixtyCycle, separator = "") {
  return pillar
    .getExtraEarthBranches()
    .map((branch) => branch.getName())
    .join(separator);
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
