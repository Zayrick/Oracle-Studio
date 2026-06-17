import { calculateBazi, type BaziOutput } from "taibu-core/bazi";
import { calculateTenGod, getDiShi } from "taibu-core/utils";
import { SolarTime, type SixtyCycle } from "tyme4ts";

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
  name: string;
  stem: string;
  branch: string;
  naYin: string;
};
type BaziPillarInfo = BaziOutput["fourPillars"][BaziPillarKey];

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

  const dayMaster = chart.dayMaster;
  const warnings = buildPillarConsistencyWarnings(chart, tymePillars);
  const pillars = PILLAR_META.map(({ key, label }) =>
    buildPillarDisplay(key, label, chart, tymePillars[key])
  );

  return {
    name: input.name?.trim() ?? "",
    gender: input.gender,
    solarText: formatDateTimeParts(parts),
    dayMaster,
    kongWangText: `${chart.kongWang.xun} ${chart.kongWang.kongZhi.join("、")}空`,
    tymeEightChar: eightChar.getName(),
    pillars,
    warnings,
  };
}

function buildPillarDisplay(
  key: BaziPillarKey,
  label: string,
  chart: BaziOutput,
  tymePillar: TymePillar
): BaziPillarDisplay {
  const pillar = chart.fourPillars[key];
  const stem = pillar.stem || tymePillar.stem;
  const branch = pillar.branch || tymePillar.branch;

  return {
    key,
    label,
    name: `${stem}${branch}`,
    mainStar: getMainStar(key, chart.dayMaster, pillar),
    stem,
    branch,
    hiddenStems: pillar.hiddenStems.map((hiddenStem) => ({
      stem: hiddenStem.stem,
      qiType: hiddenStem.qiType,
      tenGod: hiddenStem.tenGod,
    })),
    starFortune: pillar.diShi || getDiShi(chart.dayMaster, branch),
    selfSitting: getDiShi(stem, branch),
    kongWang: pillar.kongWang.isKong
      ? `是（${chart.kongWang.kongZhi.join("、")}）`
      : `否（${chart.kongWang.kongZhi.join("、")}）`,
    naYin: pillar.naYin || tymePillar.naYin,
    shenSha: pillar.shenSha,
  };
}

function buildTymePillar(pillar: SixtyCycle): TymePillar {
  return {
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

function getMainStar(key: BaziPillarKey, dayMaster: string, pillar: BaziPillarInfo) {
  if (key === "day") {
    return "日主";
  }

  return pillar.tenGod || calculateTenGod(dayMaster, pillar.stem);
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
