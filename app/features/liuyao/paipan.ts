import { SolarTime } from "tyme4ts";

export type YaoType = "阴" | "阳";

export interface LiuyaoInputYao {
  type: YaoType;
  moving: boolean;
}

export interface LiuyaoPaipanInput {
  question: string;
  date: Date;
  time: string;
  yaos: LiuyaoInputYao[];
}

type ElementName = "木" | "火" | "土" | "金" | "水";
type SixRelative = "兄弟" | "子孙" | "妻财" | "官鬼" | "父母";
type HexagramPattern = "六冲" | "六合";

export interface LiuyaoHiddenGodInfo {
  relation: SixRelative;
  stem: string;
  branch: string;
}

export interface LiuyaoHexagramInfo {
  code: string;
  name: string;
  palace: string;
  palaceElement: ElementName;
  stage: string;
  upperTrigram: string;
  lowerTrigram: string;
  worldPosition: number;
  responsePosition: number;
  pattern: HexagramPattern | "";
}

export interface LiuyaoLineInfo {
  position: number;
  label: string;
  type: YaoType;
  moving: boolean;
  movingSymbol: "" | "○" | "×";
  role: "" | "世" | "应";
  deity: string;
  relation: SixRelative;
  stem: string;
  branch: string;
  element: ElementName;
  hiddenGods: LiuyaoHiddenGodInfo[];
  changed: {
    type: YaoType;
    relation: SixRelative;
    stem: string;
    branch: string;
    element: ElementName;
    role: "" | "世" | "应";
  } | null;
}

export interface LiuyaoShenshaInfo {
  name: string;
  branches: string[];
}

export interface LiuyaoPaipan {
  question: string;
  solar: string;
  lunar: string;
  pillars: {
    year: string;
    month: string;
    day: string;
    hour: string;
  };
  pillarVoids: {
    year: string;
    month: string;
    day: string;
    hour: string;
  };
  primary: LiuyaoHexagramInfo;
  changed: LiuyaoHexagramInfo | null;
  lines: LiuyaoLineInfo[];
  shenshas: LiuyaoShenshaInfo[];
}

export const YAO_NAMES = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"];

const TRIGRAMS = {
  qian: { name: "乾", image: "天", code: "111", element: "金" },
  dui: { name: "兑", image: "泽", code: "110", element: "金" },
  li: { name: "离", image: "火", code: "101", element: "火" },
  zhen: { name: "震", image: "雷", code: "100", element: "木" },
  xun: { name: "巽", image: "风", code: "011", element: "木" },
  kan: { name: "坎", image: "水", code: "010", element: "水" },
  gen: { name: "艮", image: "山", code: "001", element: "土" },
  kun: { name: "坤", image: "地", code: "000", element: "土" },
} as const;

type TrigramKey = keyof typeof TRIGRAMS;
type Trigram = (typeof TRIGRAMS)[TrigramKey];

const TRIGRAM_BY_CODE = Object.fromEntries(
  (Object.entries(TRIGRAMS) as Array<[TrigramKey, Trigram]>).map(
    ([key, trigram]) => [trigram.code, key]
  )
) as Record<string, TrigramKey>;

const HEXAGRAM_GRID: Record<TrigramKey, Record<TrigramKey, string>> = {
  qian: {
    qian: "乾为天",
    dui: "天泽履",
    li: "天火同人",
    zhen: "天雷无妄",
    xun: "天风姤",
    kan: "天水讼",
    gen: "天山遯",
    kun: "天地否",
  },
  dui: {
    qian: "泽天夬",
    dui: "兑为泽",
    li: "泽火革",
    zhen: "泽雷随",
    xun: "泽风大过",
    kan: "泽水困",
    gen: "泽山咸",
    kun: "泽地萃",
  },
  li: {
    qian: "火天大有",
    dui: "火泽睽",
    li: "离为火",
    zhen: "火雷噬嗑",
    xun: "火风鼎",
    kan: "火水未济",
    gen: "火山旅",
    kun: "火地晋",
  },
  zhen: {
    qian: "雷天大壮",
    dui: "雷泽归妹",
    li: "雷火丰",
    zhen: "震为雷",
    xun: "雷风恒",
    kan: "雷水解",
    gen: "雷山小过",
    kun: "雷地豫",
  },
  xun: {
    qian: "风天小畜",
    dui: "风泽中孚",
    li: "风火家人",
    zhen: "风雷益",
    xun: "巽为风",
    kan: "风水涣",
    gen: "风山渐",
    kun: "风地观",
  },
  kan: {
    qian: "水天需",
    dui: "水泽节",
    li: "水火既济",
    zhen: "水雷屯",
    xun: "水风井",
    kan: "坎为水",
    gen: "水山蹇",
    kun: "水地比",
  },
  gen: {
    qian: "山天大畜",
    dui: "山泽损",
    li: "山火贲",
    zhen: "山雷颐",
    xun: "山风蛊",
    kan: "山水蒙",
    gen: "艮为山",
    kun: "山地剥",
  },
  kun: {
    qian: "地天泰",
    dui: "地泽临",
    li: "地火明夷",
    zhen: "地雷复",
    xun: "地风升",
    kan: "地水师",
    gen: "地山谦",
    kun: "坤为地",
  },
};

const PALACE_ORDER: TrigramKey[] = [
  "qian",
  "dui",
  "li",
  "zhen",
  "xun",
  "kan",
  "gen",
  "kun",
];

const PALACE_STAGES = ["本宫", "一世", "二世", "三世", "四世", "五世", "游魂", "归魂"];
const WORLD_POSITIONS = [6, 1, 2, 3, 4, 5, 4, 3];

const HEXAGRAM_PATTERNS: Partial<Record<string, HexagramPattern>> = {
  乾为天: "六冲",
  坤为地: "六冲",
  震为雷: "六冲",
  巽为风: "六冲",
  坎为水: "六冲",
  离为火: "六冲",
  艮为山: "六冲",
  兑为泽: "六冲",
  天雷无妄: "六冲",
  雷天大壮: "六冲",
  天地否: "六合",
  地天泰: "六合",
  泽水困: "六合",
  水泽节: "六合",
  山火贲: "六合",
  火山旅: "六合",
  雷地豫: "六合",
  地雷复: "六合",
};

const NAJIA: Record<
  TrigramKey,
  {
    innerStem: string;
    outerStem: string;
    innerBranches: [string, string, string];
    outerBranches: [string, string, string];
  }
> = {
  qian: {
    innerStem: "甲",
    outerStem: "壬",
    innerBranches: ["子", "寅", "辰"],
    outerBranches: ["午", "申", "戌"],
  },
  dui: {
    innerStem: "丁",
    outerStem: "丁",
    innerBranches: ["巳", "卯", "丑"],
    outerBranches: ["亥", "酉", "未"],
  },
  li: {
    innerStem: "己",
    outerStem: "己",
    innerBranches: ["卯", "丑", "亥"],
    outerBranches: ["酉", "未", "巳"],
  },
  zhen: {
    innerStem: "庚",
    outerStem: "庚",
    innerBranches: ["子", "寅", "辰"],
    outerBranches: ["午", "申", "戌"],
  },
  xun: {
    innerStem: "辛",
    outerStem: "辛",
    innerBranches: ["丑", "亥", "酉"],
    outerBranches: ["未", "巳", "卯"],
  },
  kan: {
    innerStem: "戊",
    outerStem: "戊",
    innerBranches: ["寅", "辰", "午"],
    outerBranches: ["申", "戌", "子"],
  },
  gen: {
    innerStem: "丙",
    outerStem: "丙",
    innerBranches: ["辰", "午", "申"],
    outerBranches: ["戌", "子", "寅"],
  },
  kun: {
    innerStem: "乙",
    outerStem: "癸",
    innerBranches: ["未", "巳", "卯"],
    outerBranches: ["丑", "亥", "酉"],
  },
};

const BRANCH_ELEMENTS: Record<string, ElementName> = {
  子: "水",
  丑: "土",
  寅: "木",
  卯: "木",
  辰: "土",
  巳: "火",
  午: "火",
  未: "土",
  申: "金",
  酉: "金",
  戌: "土",
  亥: "水",
};

const GENERATES: Record<ElementName, ElementName> = {
  木: "火",
  火: "土",
  土: "金",
  金: "水",
  水: "木",
};

const CONTROLS: Record<ElementName, ElementName> = {
  木: "土",
  土: "水",
  水: "火",
  火: "金",
  金: "木",
};

const SIX_DEITY_START_BY_DAY_STEM: Record<string, number> = {
  甲: 0,
  乙: 0,
  丙: 1,
  丁: 1,
  戊: 2,
  己: 3,
  庚: 4,
  辛: 4,
  壬: 5,
  癸: 5,
};

const SIX_DEITIES = ["青龙", "朱雀", "勾陈", "螣蛇", "白虎", "玄武"];

const TIAN_YI_GUI_REN_BY_DAY_STEM: Record<string, string[]> = {
  甲: ["丑", "未"],
  戊: ["丑", "未"],
  乙: ["子", "申"],
  己: ["子", "申"],
  丙: ["亥", "酉"],
  丁: ["亥", "酉"],
  庚: ["午", "寅"],
  辛: ["午", "寅"],
  壬: ["卯", "巳"],
  癸: ["卯", "巳"],
};

const WENCHANG_BY_DAY_STEM: Record<string, string> = {
  甲: "巳",
  乙: "午",
  丙: "申",
  戊: "申",
  丁: "酉",
  己: "酉",
  庚: "亥",
  辛: "子",
  壬: "寅",
  癸: "卯",
};

const DAY_LU_BY_STEM: Record<string, string> = {
  甲: "寅",
  乙: "卯",
  丙: "巳",
  戊: "巳",
  丁: "午",
  己: "午",
  庚: "申",
  辛: "酉",
  壬: "亥",
  癸: "子",
};

const YANG_REN_BY_STEM: Record<string, string> = {
  甲: "卯",
  乙: "寅",
  丙: "午",
  戊: "午",
  丁: "巳",
  己: "巳",
  庚: "酉",
  辛: "申",
  壬: "子",
  癸: "亥",
};

const DAY_BRANCH_SHENSHA_GROUPS = [
  { branches: ["申", "子", "辰"], yima: "寅", taohua: "酉", huagai: "辰" },
  { branches: ["寅", "午", "戌"], yima: "申", taohua: "卯", huagai: "戌" },
  { branches: ["亥", "卯", "未"], yima: "巳", taohua: "子", huagai: "未" },
  { branches: ["巳", "酉", "丑"], yima: "亥", taohua: "午", huagai: "丑" },
];

interface PalaceLookupItem {
  trigramKey: TrigramKey;
  stage: string;
  worldPosition: number;
  responsePosition: number;
}

const PALACE_BY_CODE = buildPalaceLookup();

export function buildLiuyaoPaipan(input: LiuyaoPaipanInput): LiuyaoPaipan {
  if (input.yaos.length !== 6) {
    throw new Error("六爻排盘需要完整的六个爻位。");
  }

  const timeContext = buildTimeContext(input.date, input.time);
  const primaryCode = input.yaos.map((yao) => (yao.type === "阳" ? "1" : "0")).join("");
  const changedCode = input.yaos
    .map((yao) => {
      const bit = yao.type === "阳" ? "1" : "0";
      return yao.moving ? flipBit(bit) : bit;
    })
    .join("");
  const hasMovingLine = input.yaos.some((yao) => yao.moving);
  const primary = buildHexagramInfo(primaryCode);
  const changed = hasMovingLine ? buildHexagramInfo(changedCode) : null;
  const deities = sixDeitiesForDayStem(timeContext.dayStem);
  const rawLines: Array<Omit<LiuyaoLineInfo, "hiddenGods">> = input.yaos.map((yao, index) => {
    const position = index + 1;
    const najia = getNajia(primary.code, index);
    const changedNajia = getNajia(changedCode, index);
    const lineElement = BRANCH_ELEMENTS[najia.branch];
    const changedElement = BRANCH_ELEMENTS[changedNajia.branch];

    return {
      position,
      label: YAO_NAMES[index],
      type: yao.type,
      moving: yao.moving,
      movingSymbol: yao.moving ? (yao.type === "阳" ? "○" : "×") : "",
      role: roleForPosition(position, primary),
      deity: deities[index],
      relation: relationFor(primary.palaceElement, lineElement),
      stem: najia.stem,
      branch: najia.branch,
      element: lineElement,
      changed: changed
        ? {
            type: changedCode[index] === "1" ? "阳" : "阴",
            relation: relationFor(changed.palaceElement, changedElement),
            stem: changedNajia.stem,
            branch: changedNajia.branch,
            element: changedElement,
            role: roleForPosition(position, changed),
          }
        : null,
    };
  });
  const hiddenGods = calculateHiddenGods(rawLines, primary);
  const lines = rawLines.map((line) => ({
    ...line,
    hiddenGods: hiddenGods.get(line.position) ?? [],
  }));

  return {
    question: input.question.trim(),
    solar: timeContext.solar,
    lunar: timeContext.lunar,
    pillars: timeContext.pillars,
    pillarVoids: timeContext.pillarVoids,
    primary,
    changed,
    lines,
    shenshas: calculateShenshas(timeContext),
  };
}

function buildHexagramInfo(code: string): LiuyaoHexagramInfo {
  const lowerKey = trigramKeyFromCode(code.slice(0, 3));
  const upperKey = trigramKeyFromCode(code.slice(3, 6));
  const palace = PALACE_BY_CODE[code];

  if (!palace) {
    throw new Error("无法识别卦象。");
  }

  const palaceTrigram = TRIGRAMS[palace.trigramKey];
  const name = HEXAGRAM_GRID[upperKey][lowerKey];

  return {
    code,
    name,
    palace: `${palaceTrigram.name}宫`,
    palaceElement: palaceTrigram.element,
    stage: palace.stage,
    upperTrigram: TRIGRAMS[upperKey].name,
    lowerTrigram: TRIGRAMS[lowerKey].name,
    worldPosition: palace.worldPosition,
    responsePosition: palace.responsePosition,
    pattern: HEXAGRAM_PATTERNS[name] ?? "",
  };
}

function buildTimeContext(date: Date, time: string) {
  const { hour, minute, second } = parseTime(time);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const solarTime = SolarTime.fromYmdHms(year, month, day, hour, minute, second);
  const lunarHour = solarTime.getLunarHour();
  const lunarDay = solarTime.getSolarDay().getLunarDay();
  const lunarMonth = lunarDay.getLunarMonth();
  const eightChar = lunarHour.getEightChar();
  const yearPillar = eightChar.getYear();
  const monthPillar = eightChar.getMonth();
  const dayPillar = eightChar.getDay();
  const hourPillar = eightChar.getHour();

  return {
    solar: `${year}年${pad(month)}月${pad(day)}日 ${pad(hour)}:${pad(minute)}`,
    lunar: `${lunarDay.getYear()}年${lunarMonth.isLeap() ? "闰" : ""}${lunarMonth.getName()}${lunarDay.getName()}`,
    pillars: {
      year: yearPillar.getName(),
      month: monthPillar.getName(),
      day: dayPillar.getName(),
      hour: hourPillar.getName(),
    },
    pillarVoids: {
      year: formatVoidBranches(yearPillar),
      month: formatVoidBranches(monthPillar),
      day: formatVoidBranches(dayPillar),
      hour: formatVoidBranches(hourPillar),
    },
    dayStem: dayPillar.getHeavenStem().getName(),
    dayBranch: dayPillar.getName().slice(1, 2),
  };
}

function calculateShenshas(timeContext: ReturnType<typeof buildTimeContext>): LiuyaoShenshaInfo[] {
  const branchGroup = getDayBranchShenshaGroup(timeContext.dayBranch);
  const dayVoidBranches = splitBranches(timeContext.pillarVoids.day);

  return [
    { name: "天乙贵人", branches: TIAN_YI_GUI_REN_BY_DAY_STEM[timeContext.dayStem] ?? [] },
    { name: "驿马", branches: branchGroup ? [branchGroup.yima] : [] },
    { name: "桃花", branches: branchGroup ? [branchGroup.taohua] : [] },
    { name: "华盖", branches: branchGroup ? [branchGroup.huagai] : [] },
    { name: "文昌", branches: WENCHANG_BY_DAY_STEM[timeContext.dayStem] ? [WENCHANG_BY_DAY_STEM[timeContext.dayStem]] : [] },
    { name: "日禄", branches: DAY_LU_BY_STEM[timeContext.dayStem] ? [DAY_LU_BY_STEM[timeContext.dayStem]] : [] },
    { name: "羊刃", branches: YANG_REN_BY_STEM[timeContext.dayStem] ? [YANG_REN_BY_STEM[timeContext.dayStem]] : [] },
    { name: "日空", branches: dayVoidBranches },
  ].filter((shensha) => shensha.branches.length > 0);
}

function getDayBranchShenshaGroup(dayBranch: string) {
  return DAY_BRANCH_SHENSHA_GROUPS.find((group) => group.branches.includes(dayBranch));
}

function splitBranches(branches: string) {
  return branches.split("").filter(Boolean);
}

function formatVoidBranches(pillar: { getExtraEarthBranches(): Array<{ getName(): string }> }) {
  return pillar
    .getExtraEarthBranches()
    .map((branch) => branch.getName())
    .join("");
}

function parseTime(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  if (!match) {
    throw new Error("时间格式应为 HH:mm 或 HH:mm:ss。");
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] ? Number(match[3]) : 0;

  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error("请输入有效的占问时间。");
  }

  return { hour, minute, second };
}

function getNajia(code: string, lineIndex: number) {
  const isInner = lineIndex < 3;
  const trigramCode = isInner ? code.slice(0, 3) : code.slice(3, 6);
  const trigram = trigramKeyFromCode(trigramCode);
  const najia = NAJIA[trigram];
  const branchIndex = isInner ? lineIndex : lineIndex - 3;

  return {
    stem: isInner ? najia.innerStem : najia.outerStem,
    branch: isInner
      ? najia.innerBranches[branchIndex]
      : najia.outerBranches[branchIndex],
  };
}

function relationFor(palaceElement: ElementName, lineElement: ElementName): SixRelative {
  if (palaceElement === lineElement) return "兄弟";
  if (GENERATES[palaceElement] === lineElement) return "子孙";
  if (GENERATES[lineElement] === palaceElement) return "父母";
  if (CONTROLS[palaceElement] === lineElement) return "妻财";
  return "官鬼";
}

function roleForPosition(
  position: number,
  hexagram: Pick<LiuyaoHexagramInfo, "worldPosition" | "responsePosition">
) {
  if (position === hexagram.worldPosition) return "世";
  if (position === hexagram.responsePosition) return "应";
  return "";
}

function calculateHiddenGods(
  lines: Array<Pick<LiuyaoLineInfo, "position" | "relation">>,
  hexagram: LiuyaoHexagramInfo
) {
  const presentRelatives = new Set(lines.map((line) => line.relation));
  const palace = PALACE_BY_CODE[hexagram.code];
  const palaceCode = TRIGRAMS[palace.trigramKey].code.repeat(2);
  const hiddenGods = new Map<number, LiuyaoHiddenGodInfo[]>();

  YAO_NAMES.forEach((_, index) => {
    const najia = getNajia(palaceCode, index);
    const relation = relationFor(hexagram.palaceElement, BRANCH_ELEMENTS[najia.branch]);

    if (!presentRelatives.has(relation)) {
      const position = index + 1;

      hiddenGods.set(position, [
        ...(hiddenGods.get(position) ?? []),
        {
          relation,
          stem: najia.stem,
          branch: najia.branch,
        },
      ]);
    }
  });

  return hiddenGods;
}

function sixDeitiesForDayStem(dayStem: string) {
  const start = SIX_DEITY_START_BY_DAY_STEM[dayStem] ?? 0;

  return Array.from(
    { length: 6 },
    (_, index) => SIX_DEITIES[(start + index) % SIX_DEITIES.length]
  );
}

function buildPalaceLookup() {
  const lookup: Record<string, PalaceLookupItem> = {};

  for (const trigramKey of PALACE_ORDER) {
    const palaceTrigram = TRIGRAMS[trigramKey];
    const sequence = palaceSequence(palaceTrigram.code);

    sequence.forEach((code, index) => {
      const worldPosition = WORLD_POSITIONS[index];

      lookup[code] = {
        trigramKey,
        stage: PALACE_STAGES[index],
        worldPosition,
        responsePosition: worldPosition > 3 ? worldPosition - 3 : worldPosition + 3,
      };
    });
  }

  return lookup;
}

function palaceSequence(trigramCode: string) {
  let code = `${trigramCode}${trigramCode}`;
  const sequence = [code];

  for (let lineIndex = 0; lineIndex < 5; lineIndex += 1) {
    code = flipLine(code, lineIndex);
    sequence.push(code);
  }

  code = flipLine(code, 3);
  sequence.push(code);

  code = [0, 1, 2].reduce((current, lineIndex) => flipLine(current, lineIndex), code);
  sequence.push(code);

  return sequence;
}

function trigramKeyFromCode(code: string): TrigramKey {
  const trigram = TRIGRAM_BY_CODE[code];

  if (!trigram) {
    throw new Error("无法识别三爻卦。");
  }

  return trigram;
}

function flipLine(code: string, lineIndex: number) {
  return code
    .split("")
    .map((bit, index) => (index === lineIndex ? flipBit(bit) : bit))
    .join("");
}

function flipBit(bit: string) {
  return bit === "1" ? "0" : "1";
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}