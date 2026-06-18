import type {
  BaziFlowItemDisplay,
  BaziFlowYearDisplay,
  BaziHiddenStemDisplay,
  BaziPaipan,
  BaziPillarDisplay,
} from "@/features/bazi/paipan";

type ElementName = "木" | "火" | "土" | "金" | "水";
type PillarLike = Pick<
  BaziPillarDisplay,
  "label" | "name" | "stem" | "branch" | "hiddenStems" | "mainStar" | "starFortune" | "selfSitting" | "kongWang" | "naYin" | "shenSha"
>;

const ELEMENT_NAMES: ElementName[] = ["木", "火", "土", "金", "水"];

const STEM_ELEMENTS: Record<string, ElementName> = {
  甲: "木",
  乙: "木",
  丙: "火",
  丁: "火",
  戊: "土",
  己: "土",
  庚: "金",
  辛: "金",
  壬: "水",
  癸: "水",
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

const STEM_COMBINES: Record<string, string> = {
  甲己: "土",
  乙庚: "金",
  丙辛: "水",
  丁壬: "木",
  戊癸: "火",
};

const BRANCH_COMBINES: Record<string, string> = {
  子丑: "土",
  寅亥: "木",
  卯戌: "火",
  辰酉: "金",
  巳申: "水",
  午未: "土",
};

const BRANCH_OPPOSITES: Record<string, string> = {
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

const BRANCH_HARMS: Record<string, string> = {
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

const BRANCH_ORDER = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

const PUNISHMENT_PAIRS: Record<string, string> = {
  子卯: "无礼刑",
  寅巳: "无恩刑",
  寅申: "无恩刑",
  巳申: "无恩刑",
  丑未: "恃势刑",
  丑戌: "恃势刑",
  未戌: "恃势刑",
};

const BREAK_PAIRS: Record<string, string> = {
  子酉: "破",
  丑辰: "破",
  寅亥: "破",
  卯午: "破",
  巳申: "破",
  未戌: "破",
};

const BRANCH_TRIPLE_COMBOS = [
  { type: "三合", branches: ["申", "子", "辰"], element: "水" },
  { type: "三合", branches: ["亥", "卯", "未"], element: "木" },
  { type: "三合", branches: ["寅", "午", "戌"], element: "火" },
  { type: "三合", branches: ["巳", "酉", "丑"], element: "金" },
  { type: "三会", branches: ["寅", "卯", "辰"], element: "木" },
  { type: "三会", branches: ["巳", "午", "未"], element: "火" },
  { type: "三会", branches: ["申", "酉", "戌"], element: "金" },
  { type: "三会", branches: ["亥", "子", "丑"], element: "水" },
];

export function formatBaziAISystemPrompt(paipan: BaziPaipan) {
  return joinSections([
    [
      "你是 Oracle Studio 的八字命理分析助手。",
      "你可以依据传统八字命理做结构化解读，但必须把结论绑定到已给出的排盘证据、工具结果和用户问题。",
      "回答时先判断用户关注点，再组织证据；不要把娱乐性命理解读包装成医学、法律、投资或其他现实高风险领域的确定建议。",
      "若用户询问具体年份、月份、日期或时辰，优先调用内置工具核对阶段和周期证据，再回答。",
      "系统提示词已经包含八字基础盘，因此不存在 bazi_chart 工具，也不要要求用户重新提供基础排盘。",
    ].join("\n"),
    formatBaziChartMarkdown(paipan),
  ]);
}

export function formatBaziChartMarkdown(paipan: BaziPaipan) {
  return joinSections([
    "八字本命基础盘",
    [
      `命主: ${paipan.name || "未署名"}`,
      `性别: ${paipan.gender === "male" ? "男" : "女"}`,
      `公历: ${paipan.solarText}`,
      `四柱: ${paipan.tymeEightChar}`,
      `日主: ${paipan.dayMaster}`,
      `日柱空亡: ${paipan.kongWangText}`,
      `司令: ${paipan.commanderText}`,
    ].join("\n"),
    formatPillarsTable(paipan.pillars),
    mdTable(
      ["胎元", "胎息", "命宫", "身宫"],
      [[
        getAuxiliaryPillarValue(paipan, "fetalOrigin"),
        getAuxiliaryPillarValue(paipan, "fetalBreath"),
        getAuxiliaryPillarValue(paipan, "ownSign"),
        getAuxiliaryPillarValue(paipan, "bodySign"),
      ]]
    ),
    `起运: ${paipan.fortuneStartText}`,
    formatDayunTable(paipan),
    paipan.warnings.length > 0 ? `排盘警告: ${paipan.warnings.join(" ")}` : undefined,
    "边界: 此基础盘只提供本命底稿。判断旺衰取用请结合 bazi_structure；看阶段触发请调用 bazi_timeline 或 bazi_period_detail；神煞只作辅助。",
  ]);
}

export function formatBaziStructureMarkdown(paipan: BaziPaipan, focus?: string) {
  const scores = calculateElementScores(paipan);
  const totalScore = ELEMENT_NAMES.reduce((sum, name) => sum + scores[name], 0) || 1;
  const dayElement = STEM_ELEMENTS[paipan.dayMaster] ?? "";
  const monthPillar = paipan.pillars.find((pillar) => pillar.key === "month");
  const relations = calculateOriginalRelations(paipan);

  return joinSections([
    "八字命局结构证据",
    [
      `四柱: ${paipan.tymeEightChar}`,
      `日主: ${paipan.dayMaster}${dayElement ? `(${dayElement})` : ""}`,
      `月令: ${monthPillar?.branch ?? "-"}${monthPillar ? `(${BRANCH_ELEMENTS[monthPillar.branch] ?? "-"})` : ""}`,
      focus ? `用户关注点: ${focus}` : undefined,
      "说明: 此工具提供证据，不直接替代完整断语；身强身弱、格局、用神需综合月令、透干、通根、组合与流运。",
    ].filter(Boolean).join("\n"),
    mdTable(
      ["五行", "分数", "占比", "备注"],
      ELEMENT_NAMES.map((name) => [
        name,
        scores[name].toFixed(1),
        `${((scores[name] / totalScore) * 100).toFixed(1)}%`,
        name === dayElement ? "日主五行" : "",
      ])
    ),
    mdTable(
      ["十神", "权重"],
      collectTenGodDistribution(paipan).map((item) => [item.tenGod, item.score.toFixed(1)])
    ),
    mdTable(
      ["柱", "地支", "同五行根气", "同干根气", "命中藏干"],
      collectRootEvidence(paipan).map((item) => [
        item.label,
        item.branch,
        item.sameElementRoots.length > 0 ? "有" : "无",
        item.exactRoots.length > 0 ? "有" : "无",
        item.sameElementRoots.map(formatHiddenStem).join("、") || "-",
      ])
    ),
    mdTable(
      ["透干位置", "天干", "十神"],
      paipan.pillars
        .filter((pillar) => pillar.key !== "day")
        .map((pillar) => [pillar.label, pillar.stem, pillar.mainStar])
    ),
    relations.length > 0
      ? mdTable(["类型", "关系"], relations.map((item) => [item.type, item.text]))
      : "刑冲合害: 原局未见明显天干五合、六合、三合、三会、六冲、六害、相刑、破。",
    "下一步: 涉及年份、月份、日期或时辰时调用 bazi_timeline 或 bazi_period_detail 验证触发点。",
  ]);
}

export function formatBaziTimelineMarkdown(paipan: BaziPaipan, startYear: number, count: number) {
  const requestedCount = Number.isFinite(count) && count > 0 ? Math.trunc(count) : 10;
  const rows = paipan.fortune.periods
    .flatMap((period) =>
      period.years.map((year) => ({
        period,
        year,
      }))
    )
    .filter(({ year }) => year.year >= startYear)
    .slice(0, requestedCount);

  return joinSections([
    "八字大运流年时间轴",
    `出生: ${paipan.solarText}\n四柱: ${paipan.tymeEightChar}\n日主: ${paipan.dayMaster}\n查询: ${startYear} 起 ${requestedCount} 年`,
    rows.length > 0
      ? mdTable(
          ["年份", "年龄", "阶段", "流年", "小运", "流年十神", "星运", "纳音", "太岁"],
          rows.map(({ period, year }) => [
            year.year,
            `${year.age}岁`,
            formatFortunePeriodLabel(period),
            year.name,
            year.minorFortune?.name ?? "-",
            year.tenGod,
            year.starFortune,
            year.naYin,
            year.taiSui.join("、") || "-",
          ])
        )
      : "未在当前排盘的起运前或大运流年范围内找到对应年份。",
    rows.length > 0
      ? mdTable(
          ["年份", "流年", "与原局四柱关系"],
          rows.map(({ year }) => [
            year.year,
            year.name,
            summarizeTargetRelations(paipan, year.stem, year.branch),
          ])
        )
      : undefined,
    "边界: 此工具只给阶段时间轴和触发关系。若要展开某个年、月、日或时，请继续调用 bazi_period_detail。",
  ]);
}

export function formatBaziPeriodDetailMarkdown(
  paipan: BaziPaipan,
  options: {
    scope: string;
    label: string;
    item: BaziFlowItemDisplay;
    extra?: Array<[string, string | number]>;
  }
) {
  return joinSections([
    "八字单一周期详盘",
    [
      `出生: ${paipan.solarText}`,
      `四柱: ${paipan.tymeEightChar}`,
      `日主: ${paipan.dayMaster}`,
      `周期层级: ${options.scope}`,
      `周期: ${options.label}`,
      `干支: ${options.item.name}`,
      `十神: ${options.item.tenGod}`,
      `星运: ${options.item.starFortune}`,
      `自坐: ${options.item.selfSitting}`,
      `空亡: ${options.item.kongWang || "-"}`,
      `纳音: ${options.item.naYin || "-"}`,
    ].join("\n"),
    options.extra && options.extra.length > 0 ? mdTable(["项目", "值"], options.extra) : undefined,
    formatFlowItemEvidenceTable(options.item),
    `与原局四柱关系: ${summarizeTargetRelations(paipan, options.item.stem, options.item.branch)}`,
    options.item.shenSha.length > 0 ? `周期神煞: ${options.item.shenSha.join("、")}` : "周期神煞: 无",
    "边界: 此工具只展开指定周期证据，不替代 bazi_structure 的命局结构判断。",
  ]);
}

export function formatBaziShenshaMarkdown(paipan: BaziPaipan, onlyHits = false) {
  const rows = paipan.pillars.flatMap((pillar) =>
    pillar.shenSha.map((name) => [name, pillar.label, pillar.name])
  );

  return joinSections([
    "常用八字神煞辅助表",
    `四柱: ${paipan.tymeEightChar}`,
    rows.length > 0 || !onlyHits
      ? mdTable(
          ["神煞", "命中位置", "干支"],
          rows.length > 0 ? rows : [["无", "-", "-"]]
        )
      : "命中神煞: 无",
    "边界: 神煞为辅助参考，不可单独断事；必须回到十神、五行、月令、组合和流运同看。",
  ]);
}

export function summarizeTargetRelations(paipan: BaziPaipan, stem: string, branch: string) {
  const targetName = `${stem}${branch}`;
  const relations = paipan.pillars.map((pillar) => {
    const text = pairRelationSummary(
      { stem: pillar.stem, branch: pillar.branch },
      { stem, branch }
    );

    return `${pillar.label}${pillar.name}:${text}`;
  });

  return `${targetName} -> ${relations.join("；")}`;
}

function formatPillarsTable(pillars: BaziPillarDisplay[]) {
  return mdTable(
    ["柱", "干支", "主星", "天干", "地支", "藏干", "星运", "自坐", "空亡", "纳音", "神煞"],
    pillars.map((pillar) => [
      pillar.label,
      pillar.name,
      pillar.mainStar,
      pillar.stem,
      pillar.branch,
      pillar.hiddenStems.map(formatHiddenStem).join("、") || "-",
      pillar.starFortune,
      pillar.selfSitting,
      pillar.kongWang || "-",
      pillar.naYin,
      pillar.shenSha.join("、") || "-",
    ])
  );
}

function formatDayunTable(paipan: BaziPaipan) {
  if (paipan.fortune.periods.length === 0) {
    return "运限: 无";
  }

  return mdTable(
    ["阶段", "干支", "十神", "年龄", "年份", "星运", "纳音"],
    paipan.fortune.periods.map((period) => [
      period.key === paipan.fortune.period?.key
        ? period.kind === "preFortune"
          ? "当前起运前"
          : "当前大运"
        : period.kind === "preFortune"
          ? "起运前"
          : "大运",
      period.name,
      period.tenGod,
      period.kind === "preFortune"
        ? `${period.startAge}-${period.endAge}岁`
        : `${period.startAge}岁起`,
      `${period.startYear}-${period.endYear}`,
      period.starFortune,
      period.naYin,
    ])
  );
}

function formatFortunePeriodLabel(period: BaziPaipan["fortune"]["periods"][number]) {
  if (period.kind === "preFortune") {
    return `起运前 ${period.startYear}-${period.endYear}`;
  }

  return `${period.name} ${period.startYear}-${period.endYear}`;
}

function formatFlowItemEvidenceTable(item: BaziFlowItemDisplay) {
  return mdTable(
    ["项目", "值"],
    [
      ["天干", item.stem],
      ["地支", item.branch],
      ["藏干", item.hiddenStems.map(formatHiddenStem).join("、") || "-"],
      ["星运", item.starFortune || "-"],
      ["自坐", item.selfSitting || "-"],
      ["空亡", item.kongWang || "-"],
      ["纳音", item.naYin || "-"],
    ]
  );
}

function getAuxiliaryPillarValue(
  paipan: BaziPaipan,
  key: BaziPaipan["auxiliaryPillars"][number]["key"]
) {
  return paipan.auxiliaryPillars.find((item) => item.key === key)?.value ?? "-";
}

function formatHiddenStem(item: BaziHiddenStemDisplay) {
  return [item.stem, item.qiType, item.tenGod].filter(Boolean).join("/");
}

function calculateElementScores(paipan: BaziPaipan) {
  const scores: Record<ElementName, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };

  for (const pillar of paipan.pillars) {
    addElementScore(scores, STEM_ELEMENTS[pillar.stem], 1);
    addElementScore(scores, BRANCH_ELEMENTS[pillar.branch], 1);

    for (const hiddenStem of pillar.hiddenStems) {
      addElementScore(scores, STEM_ELEMENTS[hiddenStem.stem], getHiddenStemWeight(hiddenStem.qiType));
    }
  }

  return scores;
}

function addElementScore(scores: Record<ElementName, number>, element: ElementName | undefined, value: number) {
  if (!element) {
    return;
  }

  scores[element] += value;
}

function getHiddenStemWeight(qiType: string) {
  if (qiType === "本气") {
    return 0.6;
  }

  if (qiType === "中气") {
    return 0.3;
  }

  return 0.1;
}

function collectTenGodDistribution(paipan: BaziPaipan) {
  const counts = new Map<string, number>();
  const add = (name: string, weight: number) => {
    if (!name) {
      return;
    }

    counts.set(name, (counts.get(name) ?? 0) + weight);
  };

  for (const pillar of paipan.pillars) {
    add(pillar.mainStar, 1);

    for (const hiddenStem of pillar.hiddenStems) {
      add(hiddenStem.tenGod, getHiddenStemWeight(hiddenStem.qiType));
    }
  }

  return [...counts.entries()]
    .map(([tenGod, score]) => ({ tenGod, score }))
    .sort((left, right) => right.score - left.score);
}

function collectRootEvidence(paipan: BaziPaipan) {
  const dayElement = STEM_ELEMENTS[paipan.dayMaster];

  return paipan.pillars.map((pillar) => {
    const sameElementRoots = pillar.hiddenStems.filter(
      (hiddenStem) => STEM_ELEMENTS[hiddenStem.stem] === dayElement
    );

    return {
      label: pillar.label,
      branch: pillar.branch,
      sameElementRoots,
      exactRoots: sameElementRoots.filter((hiddenStem) => hiddenStem.stem === paipan.dayMaster),
    };
  });
}

function calculateOriginalRelations(paipan: BaziPaipan) {
  const rows: Array<{ type: string; text: string }> = [];
  const branchMap = new Map<string, string[]>();

  for (let leftIndex = 0; leftIndex < paipan.pillars.length; leftIndex++) {
    const left = paipan.pillars[leftIndex];
    branchMap.set(left.branch, [...(branchMap.get(left.branch) ?? []), `${left.label}${left.name}`]);

    for (let rightIndex = leftIndex + 1; rightIndex < paipan.pillars.length; rightIndex++) {
      const right = paipan.pillars[rightIndex];
      const stemCombine = getStemCombine(left.stem, right.stem);

      if (stemCombine) {
        rows.push({
          type: "天干五合",
          text: `${left.label}${left.name} 与 ${right.label}${right.name}: ${left.stem}${right.stem}合${stemCombine}`,
        });
      }

      for (const relation of getBranchPairRelations(left.branch, right.branch)) {
        rows.push({
          type: "地支关系",
          text: `${left.label}${left.name} 与 ${right.label}${right.name}: ${relation}`,
        });
      }
    }
  }

  for (const [branch, labels] of branchMap.entries()) {
    if (labels.length > 1 && ["辰", "午", "酉", "亥"].includes(branch)) {
      rows.push({ type: "地支自刑", text: `${labels.join("、")}: ${branch}${branch}自刑` });
    }
  }

  for (const combo of BRANCH_TRIPLE_COMBOS) {
    if (combo.branches.every((branch) => branchMap.has(branch))) {
      const locations = combo.branches
        .map((branch) => `${branch}:${(branchMap.get(branch) ?? []).join("/")}`)
        .join("；");
      rows.push({
        type: combo.type,
        text: `${combo.branches.join("")}成${combo.element}局（${locations}）`,
      });
    }
  }

  return rows;
}

function pairRelationSummary(
  left: Pick<PillarLike, "stem" | "branch">,
  right: Pick<PillarLike, "stem" | "branch">
) {
  const relations: string[] = [];
  const stemCombine = getStemCombine(left.stem, right.stem);

  if (stemCombine) {
    relations.push(`${left.stem}${right.stem}合${stemCombine}`);
  }

  relations.push(...getBranchPairRelations(left.branch, right.branch));

  return relations.length > 0 ? relations.join("、") : "无";
}

function getStemCombine(left: string, right: string) {
  return STEM_COMBINES[sortStemPair(left, right)];
}

function sortStemPair(left: string, right: string) {
  const stems = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];

  return [left, right]
    .sort((a, b) => stems.indexOf(a) - stems.indexOf(b))
    .join("");
}

function getBranchPairRelations(left: string, right: string) {
  const relations: string[] = [];
  const pairName = `${left}${right}`;
  const pairKey = branchPairKey(left, right);
  const combine = BRANCH_COMBINES[pairKey];

  if (combine) {
    relations.push(`六合${combine}(${pairName})`);
  }

  if (BRANCH_OPPOSITES[left] === right) {
    relations.push(`六冲(${pairName})`);
  }

  if (BRANCH_HARMS[left] === right) {
    relations.push(`六害(${pairName})`);
  }

  if (PUNISHMENT_PAIRS[pairKey]) {
    relations.push(`${PUNISHMENT_PAIRS[pairKey]}(${pairName})`);
  }

  if (BREAK_PAIRS[pairKey]) {
    relations.push(`破(${pairName})`);
  }

  return relations;
}

function branchPairKey(left: string, right: string) {
  return [left, right]
    .sort((a, b) => BRANCH_ORDER.indexOf(a) - BRANCH_ORDER.indexOf(b))
    .join("");
}

function mdTable(headers: string[], rows: Array<Array<unknown>>) {
  return [
    `| ${headers.map(mdValue).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(mdValue).join(" | ")} |`),
  ].join("\n");
}

function mdValue(value: unknown) {
  const text = value === undefined || value === null || value === "" ? "-" : String(value);

  return text.replace(/\r?\n/g, "<br>").replace(/\|/g, "\\|");
}

function joinSections(sections: Array<string | undefined | null | false>) {
  return sections.filter(Boolean).join("\n\n");
}
