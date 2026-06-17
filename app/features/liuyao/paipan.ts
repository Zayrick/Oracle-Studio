import {
  BAGUA_XIANG,
  calcXunKong,
  dayan,
  decodePan,
  getZhiGua,
  manualQiGua,
  solarToLunar,
  timeQiGua,
  type FuShenData,
  type GuaPan,
  type LiuQin,
  type PanResult,
  type WuXing,
  type YaoData,
  type YaoString,
  type YaoValue,
} from "iching-shifa";

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

type ElementName = WuXing;
type SixRelative = LiuQin;
type HexagramPattern = "六冲" | "六合";

export interface LiuyaoHiddenGodInfo {
  relation: SixRelative;
  stem: string;
  branch: string;
  element: ElementName;
  naYin: string;
  hostPosition: number;
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
  wuXingStar: string;
  guaCi: string;
  yaoCi: string[];
  tuanCi: string;
  shenYao: number | null;
}

export interface LiuyaoChangedLineInfo {
  type: YaoType;
  yaoValue: YaoValue;
  moving: boolean;
  relation: SixRelative;
  stem: string;
  branch: string;
  element: ElementName;
  naYin: string;
  role: "" | "世" | "应";
  xingXiu: string;
  suoBo: string;
  suiXian: string;
}

export interface LiuyaoLineInfo {
  position: number;
  label: string;
  yaoValue: YaoValue;
  labelValue: string;
  type: YaoType;
  moving: boolean;
  movingSymbol: "" | "○" | "×";
  role: "" | "世" | "应";
  deity: string;
  relation: SixRelative;
  stem: string;
  branch: string;
  element: ElementName;
  naYin: string;
  xingXiu: string;
  suoBo: string;
  suiXian: string;
  hiddenGods: LiuyaoHiddenGodInfo[];
  huozhulinHiddenGod: LiuyaoHiddenGodInfo;
  regularFuShen: LiuyaoHiddenGodInfo | null;
  fuShen: LiuyaoHiddenGodInfo | null;
  pangFuShen: LiuyaoHiddenGodInfo | null;
  changed: LiuyaoChangedLineInfo | null;
}

export interface LiuyaoShenshaInfo {
  name: string;
  branches: string[];
}

export interface LiuyaoPaipan {
  question: string;
  solar: string;
  lunar: string;
  solarTerm: string;
  monthJian: string;
  dayKong: string;
  hourKong: string;
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
  mutual: LiuyaoHexagramInfo;
  lines: LiuyaoLineInfo[];
  guaBody: string;
  worldBody: string;
  shenshas: LiuyaoShenshaInfo[];
  regularFuShen: LiuyaoHiddenGodInfo[];
  fuShen: LiuyaoHiddenGodInfo[];
  pangFuShen: LiuyaoHiddenGodInfo[];
  yaoString: YaoString;
  zhiYaoString: YaoString;
  huYaoString: YaoString;
  dongYaoCount: number;
  explanation: string;
  raw: PanResult;
}

export const YAO_NAMES = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"];

type TrigramInfo = {
  name: string;
  image: string;
};

const TRIGRAM_BY_STATIC_YAO: Partial<Record<string, TrigramInfo>> = {
  "777": { name: "乾", image: BAGUA_XIANG["1"] },
  "778": { name: "兑", image: BAGUA_XIANG["2"] },
  "787": { name: "离", image: BAGUA_XIANG["3"] },
  "788": { name: "震", image: BAGUA_XIANG["4"] },
  "877": { name: "巽", image: BAGUA_XIANG["5"] },
  "878": { name: "坎", image: BAGUA_XIANG["6"] },
  "887": { name: "艮", image: BAGUA_XIANG["7"] },
  "888": { name: "坤", image: BAGUA_XIANG["8"] },
};

const HEXAGRAM_PATTERNS: Partial<Record<string, HexagramPattern>> = {
  乾: "六冲",
  坤: "六冲",
  震: "六冲",
  巽: "六冲",
  坎: "六冲",
  离: "六冲",
  艮: "六冲",
  兑: "六冲",
  无妄: "六冲",
  大壮: "六冲",
  否: "六合",
  泰: "六合",
  困: "六合",
  节: "六合",
  贲: "六合",
  旅: "六合",
  豫: "六合",
  复: "六合",
};

const YAO_VALUE_LABELS: Record<YaoValue, string> = {
  6: "老阴",
  7: "少阳",
  8: "少阴",
  9: "老阳",
};

export function createLiuyaoTimeCastingYaos(date: Date, time: string): LiuyaoInputYao[] {
  const options = createDivinationOptions(date, time);
  const lunar = solarToLunar(options.year, options.month, options.day, options.hour);
  const yaoString = timeQiGua(
    options.year,
    options.month,
    options.day,
    options.hour,
    lunar.month,
    lunar.day,
    lunar.yearGanZhi.di,
    lunar.hourGanZhi.di
  );

  return createInputYaosFromYaoString(yaoString);
}

export function createLiuyaoRandomYaos(): LiuyaoInputYao[] {
  return createInputYaosFromYaoString(dayan());
}

export function buildLiuyaoPaipan(input: LiuyaoPaipanInput): LiuyaoPaipan {
  if (input.yaos.length !== 6) {
    throw new Error("六爻排盘需要完整的六个爻位。");
  }

  const options = createDivinationOptions(input.date, input.time);
  const yaoString = manualQiGua(formatYaoString(input.yaos));
  const pan = decodePan(yaoString, options);
  const zhiYaoString = getZhiGua(yaoString);
  const huYaoString = formatGuaYaoString(pan.huGua.yaoList);
  const hasMovingLine = input.yaos.some((yao) => yao.moving);
  const fuShen = mapFuShenList(pan.benGua.fuShen);
  const regularFuShen = filterRegularFuShen(pan.benGua.yaoList, fuShen);
  const pangFuShen = mapFuShenList(pan.benGua.pangFuShen);
  const lines = pan.benGua.yaoList.map((yao, index) =>
    createLineInfo({
      benYao: yao,
      zhiYao: pan.zhiGua.yaoList[index],
      regularFuShen: findHiddenGodByHost(regularFuShen, yao.position),
      fuShen: findHiddenGodByHost(fuShen, yao.position),
      pangFuShen: findHiddenGodByHost(pangFuShen, yao.position),
      includeChanged: true,
    })
  );

  return {
    question: input.question.trim(),
    solar: formatSolarTime(options),
    lunar: formatLunarDate(pan),
    solarTerm: pan.solarTerm,
    monthJian: pan.monthJian,
    dayKong: pan.dayKong,
    hourKong: pan.hourKong,
    pillars: {
      year: pan.ganZhiYear.gz,
      month: pan.ganZhiMonth.gz,
      day: pan.ganZhiDay.gz,
      hour: pan.ganZhiHour.gz,
    },
    pillarVoids: {
      year: calcXunKong(pan.ganZhiYear.gz),
      month: calcXunKong(pan.ganZhiMonth.gz),
      day: pan.dayKong,
      hour: pan.hourKong,
    },
    primary: createHexagramInfo(pan.benGua, yaoString),
    changed: hasMovingLine ? createHexagramInfo(pan.zhiGua, zhiYaoString) : null,
    mutual: createHexagramInfo(pan.huGua, huYaoString),
    lines,
    guaBody: formatShenYao(pan.benGua),
    worldBody: formatWorldYao(pan.benGua),
    shenshas: createShenshas(pan),
    regularFuShen,
    fuShen,
    pangFuShen,
    yaoString,
    zhiYaoString,
    huYaoString,
    dongYaoCount: pan.dongYaoCount,
    explanation: pan.explanation,
    raw: pan,
  };
}

function createDivinationOptions(date: Date, time: string) {
  const { hour, minute } = parseTime(time);

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour,
    minute,
  };
}

function createHexagramInfo(gua: GuaPan, yaoString: YaoString): LiuyaoHexagramInfo {
  const staticYaoString = normalizeStaticYaoString(yaoString);
  const lowerTrigram = TRIGRAM_BY_STATIC_YAO[staticYaoString.slice(0, 3)];
  const upperTrigram = TRIGRAM_BY_STATIC_YAO[staticYaoString.slice(3, 6)];

  return {
    code: toBinaryCode(staticYaoString),
    name: formatFullHexagramName(gua.guaName, upperTrigram, lowerTrigram),
    palace: `${gua.palace}宫`,
    palaceElement: gua.palaceWuXing,
    stage: gua.palaceLevel,
    upperTrigram: upperTrigram?.name ?? "",
    lowerTrigram: lowerTrigram?.name ?? "",
    worldPosition: findShiYingPosition(gua.yaoList, "世"),
    responsePosition: findShiYingPosition(gua.yaoList, "应"),
    pattern: HEXAGRAM_PATTERNS[gua.guaName] ?? "",
    wuXingStar: gua.wuXingStar,
    guaCi: gua.guaCi,
    yaoCi: gua.yaoCi,
    tuanCi: gua.tuanCi,
    shenYao: gua.shenYao ?? null,
  };
}

function formatFullHexagramName(
  guaName: string,
  upperTrigram: TrigramInfo | undefined,
  lowerTrigram: TrigramInfo | undefined
) {
  if (!upperTrigram || !lowerTrigram) {
    return guaName;
  }

  if (upperTrigram.name === lowerTrigram.name && guaName === upperTrigram.name) {
    return `${guaName}为${upperTrigram.image}`;
  }

  return `${upperTrigram.image}${lowerTrigram.image}${guaName}`;
}

function createLineInfo({
  benYao,
  zhiYao,
  regularFuShen,
  fuShen,
  pangFuShen,
  includeChanged,
}: {
  benYao: YaoData;
  zhiYao: YaoData;
  regularFuShen: LiuyaoHiddenGodInfo | null;
  fuShen: LiuyaoHiddenGodInfo | null;
  pangFuShen: LiuyaoHiddenGodInfo | null;
  includeChanged: boolean;
}): LiuyaoLineInfo {
  const type = yaoTypeFromValue(benYao.yaoValue);
  const fallbackFuShen = fuShen ?? createHiddenGodFromYao(benYao);

  return {
    position: benYao.position,
    label: YAO_NAMES[benYao.position - 1],
    yaoValue: benYao.yaoValue,
    labelValue: YAO_VALUE_LABELS[benYao.yaoValue],
    type,
    moving: benYao.isMoving,
    movingSymbol: benYao.isMoving ? (type === "阳" ? "○" : "×") : "",
    role: normalizeShiYing(benYao.shiYing),
    deity: benYao.liuShou,
    relation: benYao.liuQin,
    stem: getStem(benYao.naJia),
    branch: getBranch(benYao.naJia),
    element: benYao.wuXing,
    naYin: benYao.naYin ?? "",
    xingXiu: benYao.xingXiu ?? "",
    suoBo: benYao.suoBo ?? "",
    suiXian: formatSuiXian(benYao),
    hiddenGods: regularFuShen ? [regularFuShen] : [],
    huozhulinHiddenGod: fallbackFuShen,
    regularFuShen,
    fuShen,
    pangFuShen,
    changed: includeChanged ? createChangedLineInfo(zhiYao) : null,
  };
}

function createChangedLineInfo(yao: YaoData): LiuyaoChangedLineInfo {
  return {
    type: yaoTypeFromValue(yao.yaoValue),
    yaoValue: yao.yaoValue,
    moving: yao.isMoving,
    relation: yao.liuQin,
    stem: getStem(yao.naJia),
    branch: getBranch(yao.naJia),
    element: yao.wuXing,
    naYin: yao.naYin ?? "",
    role: normalizeShiYing(yao.shiYing),
    xingXiu: yao.xingXiu ?? "",
    suoBo: yao.suoBo ?? "",
    suiXian: formatSuiXian(yao),
  };
}

function createInputYaosFromYaoString(yaoString: YaoString): LiuyaoInputYao[] {
  return yaoString.split("").map((char) => {
    const value = Number(char) as YaoValue;

    return {
      type: yaoTypeFromValue(value),
      moving: value === 6 || value === 9,
    };
  });
}

function formatYaoString(yaos: LiuyaoInputYao[]): YaoString {
  return yaos
    .map((yao) => {
      if (yao.type === "阳") {
        return yao.moving ? "9" : "7";
      }

      return yao.moving ? "6" : "8";
    })
    .join("");
}

function formatGuaYaoString(yaoList: YaoData[]): YaoString {
  return yaoList.map((yao) => String(yao.yaoValue)).join("");
}

function mapFuShenList(items: FuShenData[] | undefined): LiuyaoHiddenGodInfo[] {
  return (items ?? []).map((item) => ({
    relation: item.fuLiuQin,
    stem: getStem(item.fuNaJia),
    branch: getBranch(item.fuNaJia),
    element: item.fuWuXing,
    naYin: item.fuNaYin,
    hostPosition: item.hostPosition,
  }));
}

function findHiddenGodByHost(items: LiuyaoHiddenGodInfo[], position: number) {
  return items.find((item) => item.hostPosition === position) ?? null;
}

function filterRegularFuShen(yaoList: YaoData[], fuShen: LiuyaoHiddenGodInfo[]) {
  const presentRelatives = new Set(yaoList.map((yao) => yao.liuQin));

  return fuShen.filter((hiddenGod) => !presentRelatives.has(hiddenGod.relation));
}

function createHiddenGodFromYao(yao: YaoData): LiuyaoHiddenGodInfo {
  return {
    relation: yao.liuQin,
    stem: getStem(yao.naJia),
    branch: getBranch(yao.naJia),
    element: yao.wuXing,
    naYin: yao.naYin ?? "",
    hostPosition: yao.position,
  };
}

function createShenshas(pan: PanResult): LiuyaoShenshaInfo[] {
  const shenshas = Object.entries(pan.shenSha).map(([name, branches]) => ({
    name,
    branches: [...branches],
  }));

  return shenshas.filter((shensha) => shensha.branches.length > 0);
}

function formatSolarTime(options: ReturnType<typeof createDivinationOptions>) {
  return `${options.year}年${pad(options.month)}月${pad(options.day)}日 ${pad(options.hour)}:${pad(options.minute ?? 0)}`;
}

function formatLunarDate(pan: PanResult) {
  const { lunarDate } = pan;

  return `${lunarDate.year}年${lunarDate.isLeap ? "闰" : ""}${lunarDate.month}月${lunarDate.day}日`;
}

function formatShenYao(gua: GuaPan) {
  if (!gua.shenYao) {
    return "-";
  }

  const yao = gua.yaoList[gua.shenYao - 1];

  return `${YAO_NAMES[gua.shenYao - 1]}${yao ? `（${yao.naJia}）` : ""}`;
}

function formatWorldYao(gua: GuaPan) {
  const yao = gua.yaoList.find((item) => item.shiYing === "世");

  if (!yao) {
    return "-";
  }

  return `${YAO_NAMES[yao.position - 1]}（${yao.naJia}）`;
}

function formatSuiXian(yao: YaoData) {
  return yao.suiXian ? `${yao.suiXian.startAge}-${yao.suiXian.endAge}岁` : "";
}

function normalizeShiYing(value: string): "" | "世" | "应" {
  if (value === "世" || value === "应") {
    return value;
  }

  return "";
}

function findShiYingPosition(yaoList: YaoData[], mark: "世" | "应") {
  return yaoList.find((yao) => yao.shiYing === mark)?.position ?? 0;
}

function yaoTypeFromValue(value: YaoValue): YaoType {
  return value === 7 || value === 9 ? "阳" : "阴";
}

function normalizeStaticYaoString(yaoString: string) {
  return yaoString.replace(/9/g, "7").replace(/6/g, "8");
}

function toBinaryCode(yaoString: string) {
  return yaoString
    .split("")
    .map((char) => (char === "7" || char === "9" ? "1" : "0"))
    .join("");
}

function getStem(naJia: string) {
  return naJia.slice(0, 1);
}

function getBranch(naJia: string) {
  return naJia.slice(1, 2);
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

function pad(value: number) {
  return String(value).padStart(2, "0");
}
