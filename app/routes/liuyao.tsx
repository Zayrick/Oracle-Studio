import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Link } from "react-router";
import { format } from "date-fns";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeftIcon, ArrowUpIcon, CheckIcon, CopyIcon, CornerLeftUpIcon, PlusIcon, SparklesIcon, SquareIcon } from "lucide-react";
import { Marked, type RendererObject } from "marked";
import type { Route } from "./+types/liuyao";

import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { DateTimeWheelPicker } from "@/components/date-time-wheel-picker";
import {
  buildLiuyaoPaipan,
  createLiuyaoTimeCastingYaos,
  YAO_NAMES,
  type LiuyaoInputYao,
  type LiuyaoLineInfo,
  type LiuyaoPaipan,
  type YaoType,
} from "@/features/liuyao/paipan";
import { cn } from "@/lib/utils";
import { PAGE_TITLES } from "@/lib/page-titles";

export function meta({}: Route.MetaArgs) {
  return [
    { title: PAGE_TITLES.liuyao },
    { name: "description", content: "六爻占卜" },
  ];
}

const YAO_INDEXES_TOP_DOWN = [5, 4, 3, 2, 1, 0];
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type LiuyaoCastingMethod = "manual" | "random" | "online" | "time";
type OnlineCoinSide = "front" | "back";
type OnlineCoinState = {
  side: OnlineCoinSide;
  rotation: number;
  tosses: number;
  drift: number;
};
type CopyElementName = LiuyaoLineInfo["element"];
type CopyRelative = LiuyaoLineInfo["relation"];
type CopyStemBasis = "yearStem" | "dayStem";
type CopyBranchBasis = "yearBranch" | "dayBranch";
type CopyTargetToken = { type: "stem" | "branch"; name: string };
type CopyStatus = "idle" | "copied" | "error";
type AIDivinationMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  status?: "streaming" | "complete" | "stopped" | "error";
};

const LIUYAO_AI_ENDPOINT = "/api/liuyao/ai";
const MAX_LIUYAO_AI_CONTEXT_MESSAGES = 12;
const MAX_LIUYAO_AI_MESSAGE_CONTENT_LENGTH = 4_000;
const MARKDOWN_ZERO_WIDTH_PREFIX_PATTERN = /^[\u200B\u200C\u200D\u200E\u200F\uFEFF]/;
const LIUYAO_CASTING_METHOD_ITEMS = [
  { label: "手动指定", value: "manual" },
  { label: "随机起卦", value: "random" },
  { label: "在线摇卦", value: "online" },
  { label: "时间起卦", value: "time" },
] satisfies Array<{ label: string; value: LiuyaoCastingMethod }>;
const ONLINE_CASTING_LINE_COUNT = 6;
const ONLINE_COIN_BASE_DRIFTS = [-10, 0, 10];

const liuyaoMarkdownRenderer: RendererObject = {
  html({ text }) {
    return escapeHtml(text);
  },
  link({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    const safeHref = normalizeMarkdownUrl(href);

    if (!safeHref) {
      return text;
    }

    const titleAttribute = title ? ` title="${escapeHtmlAttribute(title)}"` : "";

    return `<a href="${escapeHtmlAttribute(safeHref)}"${titleAttribute} target="_blank" rel="noreferrer noopener nofollow">${text}</a>`;
  },
  image({ text }) {
    return text ? escapeHtml(`[图片：${text}]`) : "";
  },
};

const liuyaoMarkdown = new Marked({
  async: false,
  breaks: true,
  gfm: true,
  renderer: liuyaoMarkdownRenderer,
  silent: true,
});

const COPY_BRANCH_ELEMENTS: Record<string, CopyElementName> = {
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

const COPY_GENERATES: Record<CopyElementName, CopyElementName> = {
  木: "火",
  火: "土",
  土: "金",
  金: "水",
  水: "木",
};

const COPY_CONTROLS: Record<CopyElementName, CopyElementName> = {
  木: "土",
  土: "水",
  水: "火",
  火: "金",
  金: "木",
};

const COPY_BRANCH_OPPOSITES: Record<string, string> = {
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

const COPY_BRANCH_COMBINES: Record<string, string> = {
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

const COPY_CHANGSHENG_BY_ELEMENT: Record<CopyElementName, Record<string, string>> = {
  木: { 亥: "长生", 子: "沐浴", 丑: "冠带", 寅: "临官", 卯: "帝旺", 辰: "衰", 巳: "病", 午: "死", 未: "墓", 申: "绝", 酉: "胎", 戌: "养" },
  火: { 寅: "长生", 卯: "沐浴", 辰: "冠带", 巳: "临官", 午: "帝旺", 未: "衰", 申: "病", 酉: "死", 戌: "墓", 亥: "绝", 子: "胎", 丑: "养" },
  土: { 申: "长生", 酉: "沐浴", 戌: "冠带", 亥: "临官", 子: "帝旺", 丑: "衰", 寅: "病", 卯: "死", 辰: "墓", 巳: "绝", 午: "胎", 未: "养" },
  金: { 巳: "长生", 午: "沐浴", 未: "冠带", 申: "临官", 酉: "帝旺", 戌: "衰", 亥: "病", 子: "死", 丑: "墓", 寅: "绝", 卯: "胎", 辰: "养" },
  水: { 申: "长生", 酉: "沐浴", 戌: "冠带", 亥: "临官", 子: "帝旺", 丑: "衰", 寅: "病", 卯: "死", 辰: "墓", 巳: "绝", 午: "胎", 未: "养" },
};

const COPY_STEM_BRANCH_SHENSHA_RULES: Array<{
  name: string;
  basis: CopyStemBasis[];
  targets: Record<string, string[]>;
}> = [
  {
    name: "天乙贵人",
    basis: ["yearStem", "dayStem"],
    targets: {
      甲: ["丑", "未"],
      戊: ["丑", "未"],
      庚: ["丑", "未"],
      乙: ["子", "申"],
      己: ["子", "申"],
      丙: ["亥", "酉"],
      丁: ["亥", "酉"],
      壬: ["卯", "巳"],
      癸: ["卯", "巳"],
      辛: ["寅", "午"],
    },
  },
  {
    name: "文昌贵人",
    basis: ["yearStem", "dayStem"],
    targets: {
      甲: ["巳"],
      乙: ["午"],
      丙: ["申"],
      丁: ["酉"],
      戊: ["申"],
      己: ["酉"],
      庚: ["亥"],
      辛: ["子"],
      壬: ["寅"],
      癸: ["卯"],
    },
  },
  {
    name: "羊刃",
    basis: ["dayStem"],
    targets: {
      甲: ["卯"],
      乙: ["寅"],
      丙: ["午"],
      丁: ["巳"],
      戊: ["午"],
      己: ["巳"],
      庚: ["酉"],
      辛: ["申"],
      壬: ["子"],
      癸: ["亥"],
    },
  },
  {
    name: "禄神",
    basis: ["dayStem"],
    targets: {
      甲: ["寅"],
      乙: ["卯"],
      丙: ["巳"],
      丁: ["午"],
      戊: ["巳"],
      己: ["午"],
      庚: ["申"],
      辛: ["酉"],
      壬: ["亥"],
      癸: ["子"],
    },
  },
];

const COPY_BRANCH_GROUP_SHENSHA_RULES: Array<{
  name: string;
  basis: CopyBranchBasis[];
  targetsByGroup: Record<string, string>;
}> = [
  { name: "桃花/咸池", basis: ["yearBranch", "dayBranch"], targetsByGroup: { 申子辰: "酉", 寅午戌: "卯", 巳酉丑: "午", 亥卯未: "子" } },
  { name: "驿马", basis: ["yearBranch", "dayBranch"], targetsByGroup: { 申子辰: "寅", 寅午戌: "申", 巳酉丑: "亥", 亥卯未: "巳" } },
  { name: "华盖", basis: ["yearBranch", "dayBranch"], targetsByGroup: { 申子辰: "辰", 寅午戌: "戌", 巳酉丑: "丑", 亥卯未: "未" } },
  { name: "劫煞", basis: ["yearBranch", "dayBranch"], targetsByGroup: { 申子辰: "巳", 寅午戌: "亥", 巳酉丑: "寅", 亥卯未: "申" } },
  { name: "将星", basis: ["yearBranch", "dayBranch"], targetsByGroup: { 申子辰: "子", 寅午戌: "午", 巳酉丑: "酉", 亥卯未: "卯" } },
];

const COPY_MONTH_BRANCH_SHENSHA_RULES: Array<{
  name: string;
  targets: Record<string, CopyTargetToken[]>;
}> = [
  {
    name: "天德贵人",
    targets: {
      寅: [{ type: "stem", name: "丁" }],
      卯: [{ type: "branch", name: "申" }],
      辰: [{ type: "stem", name: "壬" }],
      巳: [{ type: "stem", name: "辛" }],
      午: [{ type: "branch", name: "亥" }],
      未: [{ type: "stem", name: "甲" }],
      申: [{ type: "stem", name: "癸" }],
      酉: [{ type: "branch", name: "寅" }],
      戌: [{ type: "stem", name: "丙" }],
      亥: [{ type: "stem", name: "乙" }],
      子: [{ type: "branch", name: "巳" }],
      丑: [{ type: "stem", name: "庚" }],
    },
  },
  {
    name: "月德贵人",
    targets: {
      寅: [{ type: "stem", name: "丙" }],
      午: [{ type: "stem", name: "丙" }],
      戌: [{ type: "stem", name: "丙" }],
      申: [{ type: "stem", name: "壬" }],
      子: [{ type: "stem", name: "壬" }],
      辰: [{ type: "stem", name: "壬" }],
      亥: [{ type: "stem", name: "甲" }],
      卯: [{ type: "stem", name: "甲" }],
      未: [{ type: "stem", name: "甲" }],
      巳: [{ type: "stem", name: "庚" }],
      酉: [{ type: "stem", name: "庚" }],
      丑: [{ type: "stem", name: "庚" }],
    },
  },
];

type ViewTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void) => ViewTransition;
};

function runLiuyaoViewTransition(update: () => void) {
  if (typeof document === "undefined") {
    update();
    return;
  }

  const viewTransitionDocument = document as ViewTransitionDocument;

  if (!viewTransitionDocument.startViewTransition) {
    update();
    return;
  }

  document.documentElement.dataset.liuyaoTransition = "active";

  const transition = viewTransitionDocument.startViewTransition(() => {
    flushSync(update);
  });

  transition.finished.finally(() => {
    delete document.documentElement.dataset.liuyaoTransition;
  });
}

function useLiuyaoResultCopy(result: LiuyaoPaipan | null) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const resetTimerRef = useRef<number | null>(null);

  const clearResetTimer = () => {
    if (resetTimerRef.current === null) {
      return;
    }

    window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = null;
  };

  const scheduleReset = (delay: number) => {
    clearResetTimer();

    resetTimerRef.current = window.setTimeout(() => {
      setCopyStatus("idle");
      resetTimerRef.current = null;
    }, delay);
  };

  const resetCopyStatus = () => {
    clearResetTimer();
    setCopyStatus("idle");
  };

  const copyResult = async () => {
    if (!result) {
      return;
    }

    try {
      await copyTextToClipboard(formatLiuyaoCopyMarkdown(result));
      setCopyStatus("copied");
      scheduleReset(1600);
    } catch {
      setCopyStatus("error");
      scheduleReset(2200);
    }
  };

  useEffect(() => {
    return () => {
      clearResetTimer();
    };
  }, []);

  return {
    copyStatus,
    copyResult,
    resetCopyStatus,
  };
}

function createDefaultLiuyaoYaos(): LiuyaoInputYao[] {
  return Array.from({ length: ONLINE_CASTING_LINE_COUNT }, () => ({ type: "阳", moving: false }));
}

function createManualYaoSelectionState(selected: boolean) {
  return Array.from({ length: ONLINE_CASTING_LINE_COUNT }, () => selected);
}

function createRandomLiuyaoYaos(): LiuyaoInputYao[] {
  return Array.from({ length: ONLINE_CASTING_LINE_COUNT }, () =>
    createLiuyaoYaoFromCoinScore(getRandomCoinScore())
  );
}

function createRandomCoinThrow(): OnlineCoinSide[] {
  return Array.from({ length: 3 }, () => (getRandomBit() === 1 ? "front" : "back"));
}

function getCoinThrowScore(coins: OnlineCoinSide[]) {
  return coins.filter((coin) => coin === "back").length;
}

function getRandomCoinScore() {
  return getCoinThrowScore(createRandomCoinThrow());
}

function createLiuyaoYaoFromCoinScore(coinScore: number): LiuyaoInputYao {
  if (coinScore === 0) {
    return { type: "阴", moving: true };
  }

  if (coinScore === 1) {
    return { type: "阳", moving: false };
  }

  if (coinScore === 2) {
    return { type: "阴", moving: false };
  }

  return { type: "阳", moving: true };
}

function createInitialOnlineCoins(): OnlineCoinState[] {
  return [
    { side: "front", rotation: 0, tosses: 0, drift: ONLINE_COIN_BASE_DRIFTS[0] },
    { side: "back", rotation: 180, tosses: 0, drift: ONLINE_COIN_BASE_DRIFTS[1] },
    { side: "front", rotation: 0, tosses: 0, drift: ONLINE_COIN_BASE_DRIFTS[2] },
  ];
}

function getCoinSideRotation(side: OnlineCoinSide) {
  return side === "front" ? 0 : 180;
}

function getNextCoinRotation(currentRotation: number, nextSide: OnlineCoinSide) {
  const normalizedRotation = ((currentRotation % 360) + 360) % 360;
  const targetRotation = getCoinSideRotation(nextSide);
  const deltaToTarget = (targetRotation - normalizedRotation + 360) % 360;

  return currentRotation + (4 + getRandomInt(3)) * 360 + deltaToTarget;
}

function getNextCoinDrift(index: number) {
  return ONLINE_COIN_BASE_DRIFTS[index] + getRandomInt(7) - 3;
}

function formatYaoResultName(yao: LiuyaoInputYao) {
  return yao.type === "阳"
    ? yao.moving ? "老阳" : "少阳"
    : yao.moving ? "老阴" : "少阴";
}

function formatCoinThrowScore(score: number) {
  return `${3 - score}字 ${score}花`;
}

function getRandomBit() {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0] % 2;
  }

  return Math.random() < 0.5 ? 0 : 1;
}

function getRandomInt(maxExclusive: number) {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0] % maxExclusive;
  }

  return Math.floor(Math.random() * maxExclusive);
}

export default function Liuyao() {
  const [question, setQuestion] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [time, setTime] = useState(format(new Date(), "HH:mm"));
  const [castingMethod, setCastingMethod] = useState<LiuyaoCastingMethod>("manual");
  const [yaos, setYaos] = useState<LiuyaoInputYao[]>(() => createDefaultLiuyaoYaos());
  const [manualYaoSelections, setManualYaoSelections] = useState(() =>
    createManualYaoSelectionState(false)
  );
  const [onlineCoins, setOnlineCoins] = useState<OnlineCoinState[]>(() => createInitialOnlineCoins());
  const [onlineCastCount, setOnlineCastCount] = useState(0);
  const [onlineLastCoinScore, setOnlineLastCoinScore] = useState<number | null>(null);
  const [onlineRolling, setOnlineRolling] = useState(false);
  const [result, setResult] = useState<LiuyaoPaipan | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [error, setError] = useState("");
  const { copyStatus, copyResult, resetCopyStatus } = useLiuyaoResultCopy(result);
  const reduceMotion = useReducedMotion();
  const onlineRollingRef = useRef(false);
  const onlineRollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (onlineRollingTimeoutRef.current) {
        clearTimeout(onlineRollingTimeoutRef.current);
      }
    };
  }, []);

  const handleSetNow = () => {
    const now = new Date();
    setDate(now);
    setTime(format(now, "HH:mm"));
  };

  const clearOnlineRollingTimeout = () => {
    if (onlineRollingTimeoutRef.current) {
      clearTimeout(onlineRollingTimeoutRef.current);
      onlineRollingTimeoutRef.current = null;
    }
  };

  const resetOnlineCastingState = () => {
    clearOnlineRollingTimeout();
    onlineRollingRef.current = false;
    setOnlineRolling(false);
    setOnlineCoins(createInitialOnlineCoins());
    setOnlineCastCount(0);
    setOnlineLastCoinScore(null);
    setYaos(createDefaultLiuyaoYaos());
    setManualYaoSelections(createManualYaoSelectionState(false));
  };

  const handleCastingMethodChange = (value: LiuyaoCastingMethod) => {
    setCastingMethod(value);
    setError("");

    if (value === "online") {
      resetOnlineCastingState();
      return;
    }

    clearOnlineRollingTimeout();
    onlineRollingRef.current = false;
    setOnlineRolling(false);
  };

  const handleOnlineCoinCast = () => {
    if (onlineRollingRef.current || onlineCastCount >= ONLINE_CASTING_LINE_COUNT) {
      return;
    }

    const coinThrow = createRandomCoinThrow();
    const coinScore = getCoinThrowScore(coinThrow);
    const nextLineIndex = onlineCastCount;
    const nextYao = createLiuyaoYaoFromCoinScore(coinScore);
    const shouldReduceMotion = Boolean(reduceMotion);

    clearOnlineRollingTimeout();
    onlineRollingRef.current = true;
    setError("");
    setOnlineRolling(true);
    setOnlineCoins((coins) =>
      coins.map((coin, index) => {
        const nextSide = coinThrow[index];

        return {
          side: nextSide,
          rotation: shouldReduceMotion
            ? getCoinSideRotation(nextSide)
            : getNextCoinRotation(coin.rotation, nextSide),
          tosses: coin.tosses + 1,
          drift: shouldReduceMotion ? 0 : getNextCoinDrift(index),
        };
      })
    );

    onlineRollingTimeoutRef.current = setTimeout(() => {
      setYaos((prev) =>
        prev.map((yao, index) => (index === nextLineIndex ? nextYao : yao))
      );
      setManualYaoSelections((prev) =>
        prev.map((selected, index) => (index === nextLineIndex ? true : selected))
      );
      setOnlineLastCoinScore(coinScore);
      setOnlineCastCount(nextLineIndex + 1);
      onlineRollingRef.current = false;
      onlineRollingTimeoutRef.current = null;
      setOnlineRolling(false);
    }, shouldReduceMotion ? 140 : 860);
  };

  const toggleYaoType = (index: number) => {
    const selected = manualYaoSelections[index];

    setManualYaoSelections((prev) =>
      prev.map((isSelected, i) => (i === index ? true : isSelected))
    );

    if (!selected) {
      return;
    }

    setYaos((prev) =>
      prev.map((yao, i) =>
        i === index
          ? { ...yao, type: yao.type === "阳" ? "阴" : "阳" }
          : yao
      )
    );
  };

  const toggleYaoMoving = (index: number) => {
    const selected = manualYaoSelections[index];

    setManualYaoSelections((prev) =>
      prev.map((isSelected, i) => (i === index ? true : isSelected))
    );
    setYaos((prev) =>
      prev.map((yao, i) =>
        i === index ? { ...yao, moving: selected ? !yao.moving : true } : yao
      )
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (castingMethod === "manual" && !manualYaoSelections.every(Boolean)) {
      const missingYaos = YAO_NAMES.filter((_, index) => !manualYaoSelections[index]);
      setError(`请先完成手动指定：${missingYaos.join("、")}。`);
      return;
    }

    if (castingMethod === "online" && onlineCastCount < ONLINE_CASTING_LINE_COUNT) {
      setError(`请先完成六次在线摇卦，还差 ${ONLINE_CASTING_LINE_COUNT - onlineCastCount} 爻。`);
      return;
    }

    try {
      const submittedYaos =
        castingMethod === "random"
          ? createRandomLiuyaoYaos()
          : castingMethod === "time"
            ? createLiuyaoTimeCastingYaos(date, time)
            : yaos;
      const nextResult = buildLiuyaoPaipan({ question, date, time, yaos: submittedYaos });

      runLiuyaoViewTransition(() => {
        resetCopyStatus();
        if (castingMethod === "random" || castingMethod === "time") {
          setYaos(submittedYaos);
          setManualYaoSelections(createManualYaoSelectionState(true));
        }
        setResult(nextResult);
        setAiPanelOpen(false);
      });
    } catch (err) {
      resetCopyStatus();
      setResult(null);
      setAiPanelOpen(false);
      setError(err instanceof Error ? err.message : "排盘失败，请检查输入。");
    }
  };

  const handleStartOver = () => {
    runLiuyaoViewTransition(() => {
      resetCopyStatus();
      setResult(null);
      setAiPanelOpen(false);
      setError("");
      if (castingMethod === "online") {
        resetOnlineCastingState();
      }
    });
  };

  const mobileAiChatActive = Boolean(result && aiPanelOpen);
  const onlineCastingComplete = onlineCastCount >= ONLINE_CASTING_LINE_COUNT;
  const submitDisabled = castingMethod === "online" && (!onlineCastingComplete || onlineRolling);

  return (
    <div
      className={cn(
        "container relative mx-auto flex min-h-svh px-4 py-16 md:min-h-[calc(100svh-3.5rem)] md:py-20 lg:py-10",
        result ? "items-start" : "items-center",
        mobileAiChatActive && "max-lg:h-svh max-lg:min-h-0 max-lg:items-stretch max-lg:overflow-hidden max-lg:pb-0"
      )}
    >
      <LiuyaoMobilePageActions
        result={result}
        actions={
          <LiuyaoResultActions
            layout="mobile"
            copyStatus={copyStatus}
            aiPanelOpen={aiPanelOpen}
            onCopy={copyResult}
            onStartOver={handleStartOver}
            onToggleAiPanel={() => setAiPanelOpen((open) => !open)}
          />
        }
      />
      <div
        className={cn(
          "mx-auto flex w-full max-w-6xl flex-col gap-6 lg:gap-8",
          mobileAiChatActive && "max-lg:h-full max-lg:min-h-0 max-lg:flex-1 max-lg:gap-0"
        )}
      >
        {!result ? (
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">六爻排盘</h1>
            <p className="text-sm text-muted-foreground">本卦、变卦、纳甲、六亲、六神与旬空</p>
          </div>
        ) : null}

        <div
          className={cn(
            "liuyao-transition-content",
            mobileAiChatActive && "max-lg:flex max-lg:h-full max-lg:min-h-0 max-lg:flex-1"
          )}
        >
          {result ? (
            <div
              className={cn(
                "liuyao-ai-motion flex w-full flex-col lg:mx-auto lg:w-fit lg:flex-row lg:items-stretch lg:justify-center lg:gap-0",
                mobileAiChatActive && "max-lg:h-full max-lg:min-h-0 max-lg:flex-1",
                aiPanelOpen ? "liuyao-ai-layout-open" : "liuyao-ai-layout-closed"
              )}
            >
              <PaipanResult
                result={result}
                aiPanelOpen={aiPanelOpen}
                actions={
                  <LiuyaoResultActions
                    layout="desktop"
                    copyStatus={copyStatus}
                    aiPanelOpen={aiPanelOpen}
                    onCopy={copyResult}
                    onStartOver={handleStartOver}
                    onToggleAiPanel={() => setAiPanelOpen((open) => !open)}
                  />
                }
              />
              <AIDivinationPanel
                open={aiPanelOpen}
                result={result}
                onClose={() => setAiPanelOpen(false)}
              />
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="mx-auto flex w-full max-w-md flex-col gap-5 text-card-foreground animate-in fade-in-0 slide-in-from-bottom-3 duration-300 lg:gap-6"
            >
            <Field>
              <FieldLabel htmlFor="question">所问之事</FieldLabel>
              <Input
                id="question"
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="请输入您要占问的事情"
                required
              />
            </Field>

            <div className="flex flex-col gap-2">
              <FieldGroup className="flex-row items-end gap-2">
                <Field className="min-w-0 flex-1">
                  <FieldLabel htmlFor="date-time-picker">占问时间</FieldLabel>
                  <DateTimeWheelPicker
                    id="date-time-picker"
                    date={date}
                    time={time}
                    onChange={(nextValue) => {
                      setDate(nextValue.date);
                      setTime(nextValue.time);
                    }}
                  />
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSetNow}
                  className="shrink-0"
                >
                  现在
                </Button>
              </FieldGroup>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <FieldLabel className="block">起卦方式</FieldLabel>
                <Field className="w-36 gap-1">
                  <FieldLabel htmlFor="liuyao-casting-method" className="sr-only">
                    起卦方式
                  </FieldLabel>
                  <Select
                    items={LIUYAO_CASTING_METHOD_ITEMS}
                    value={castingMethod}
                    onValueChange={(value) => {
                      if (value) {
                        handleCastingMethodChange(value);
                      }
                    }}
                  >
                    <SelectTrigger
                      id="liuyao-casting-method"
                      size="sm"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {LIUYAO_CASTING_METHOD_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {castingMethod === "manual" ? (
                <div className="flex flex-col gap-1.5 rounded-lg bg-muted/40 p-2 [--liuyao-yao-gap:clamp(0.35rem,1vw,0.75rem)] [--liuyao-yao-width:100%] lg:gap-2 lg:p-3">
                  {YAO_INDEXES_TOP_DOWN.map((index) => {
                    const yao = yaos[index];
                    const yaoSelected = manualYaoSelections[index];

                    return (
                      <div
                        key={index}
                        className="grid grid-cols-[3rem_minmax(0,1fr)_3.25rem] items-center gap-10 lg:grid-cols-[3.5rem_9rem_3.5rem] lg:justify-center lg:gap-5"
                      >
                        <div className="text-right text-xs font-medium lg:text-sm">
                          {YAO_NAMES[index]}
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleYaoType(index)}
                          aria-label={`${YAO_NAMES[index]}爻象，${yaoSelected ? formatYaoResultName(yao) : "未选择"}`}
                          className="relative flex h-9 w-full cursor-pointer items-center justify-center rounded-md hover:bg-background/70 lg:h-10"
                        >
                          {yaoSelected ? <YaoGlyph type={yao.type} /> : <YaoPlaceholderGlyph />}
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleYaoMoving(index)}
                          className={cn(
                            "flex h-8 items-center justify-center rounded-md border text-xs font-medium transition-colors lg:h-9 lg:text-sm",
                            yaoSelected && yao.moving
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background hover:bg-muted"
                          )}
                        >
                          {yaoSelected ? formatYaoResultName(yao) : "无"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {castingMethod === "online" ? (
                <OnlineCoinCastingPanel
                  coins={onlineCoins}
                  yaos={yaos}
                  castCount={onlineCastCount}
                  rolling={onlineRolling}
                  lastCoinScore={onlineLastCoinScore}
                  onCast={handleOnlineCoinCast}
                  onReset={resetOnlineCastingState}
                />
              ) : null}
            </div>

            {error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div className="flex justify-center pt-1">
              <Button type="submit" size="lg" className="w-full max-w-xs" disabled={submitDisabled}>
                开始排盘
              </Button>
            </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function LiuyaoMobilePageActions({
  result,
  actions,
}: {
  result: LiuyaoPaipan | null;
  actions: ReactNode;
}) {
  if (result) {
    return (
      <div className="absolute left-4 right-4 top-4 md:hidden">
        {actions}
      </div>
    );
  }

  return (
    <Link
      to="/"
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "absolute left-4 top-4 md:hidden"
      )}
    >
      <ArrowLeftIcon data-icon="inline-start" />
      返回主页
    </Link>
  );
}

function OnlineCoinCastingPanel({
  coins,
  yaos,
  castCount,
  rolling,
  lastCoinScore,
  onCast,
  onReset,
}: {
  coins: OnlineCoinState[];
  yaos: LiuyaoInputYao[];
  castCount: number;
  rolling: boolean;
  lastCoinScore: number | null;
  onCast: () => void;
  onReset: () => void;
}) {
  const complete = castCount >= ONLINE_CASTING_LINE_COUNT;
  const activeYaoName = complete ? "六爻" : YAO_NAMES[castCount];
  const lastYao = castCount > 0 ? yaos[castCount - 1] : null;
  const lastYaoName = castCount > 0 ? YAO_NAMES[castCount - 1] : "";
  const coinButtonsDisabled = rolling || complete;

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {rolling ? "摇卦中" : complete ? "六爻已成" : `下一爻：${activeYaoName}`}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {rolling
              ? `正在决定：${activeYaoName}`
              : lastYao && lastCoinScore !== null
              ? `${lastYaoName}：${formatYaoResultName(lastYao)} · ${formatCoinThrowScore(lastCoinScore)}`
              : "从初爻起"}
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onReset} disabled={rolling}>
          重摇
        </Button>
      </div>

      <div className="flex items-center justify-center gap-3 py-1 [perspective:900px]">
        {coins.map((coin, index) => (
          <OnlineCoinButton
            key={index}
            coin={coin}
            index={index}
            rolling={rolling}
            disabled={coinButtonsDisabled}
            onCast={onCast}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {YAO_NAMES.map((name, index) => {
          const done = index < castCount;
          const active = !complete && index === castCount;
          const yao = yaos[index];

          return (
            <div
              key={name}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border px-1.5 py-2 text-center",
                done ? "border-border bg-background" : "border-dashed border-border/70 text-muted-foreground",
                active && "border-primary/50 bg-background/80 text-foreground"
              )}
            >
              <span className="text-[0.68rem] font-medium">{name}</span>
              {done ? (
                <>
                  <YaoGlyph
                    type={yao.type}
                    className="[--liuyao-yao-gap:0.32rem] [--liuyao-yao-width:2.25rem]"
                  />
                  <span className="text-[0.68rem] text-muted-foreground">
                    {formatYaoResultName(yao)}
                  </span>
                </>
              ) : (
                <span className="text-xs">待定</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-center text-xs text-muted-foreground">
        {complete ? "可开始排盘" : `${castCount}/${ONLINE_CASTING_LINE_COUNT}`}
      </div>
    </div>
  );
}

function OnlineCoinButton({
  coin,
  index,
  rolling,
  disabled,
  onCast,
}: {
  coin: OnlineCoinState;
  index: number;
  rolling: boolean;
  disabled: boolean;
  onCast: () => void;
}) {
  const sideLabel = coin.side === "front" ? "字" : "花";

  return (
    <motion.button
      type="button"
      aria-label={`硬币${index + 1}，${sideLabel}面`}
      onClick={onCast}
      disabled={disabled}
      className={cn(
        "relative size-16 shrink-0 rounded-full outline-none transition-opacity focus-visible:ring-3 focus-visible:ring-ring/30 sm:size-20",
        disabled && !rolling ? "cursor-default" : "cursor-pointer"
      )}
      animate={
        rolling
          ? {
              y: [0, -42 - index * 8, -18, 0],
              x: [0, coin.drift, coin.drift / 2, 0],
              scale: [1, 1.08, 1.02, 1],
            }
          : { y: 0, x: 0, scale: 1 }
      }
      transition={{ duration: 0.86, times: [0, 0.34, 0.72, 1], ease: "easeOut" }}
    >
      <motion.span
        className="relative block size-full rounded-full [transform-style:preserve-3d]"
        animate={{ rotateY: coin.rotation }}
        transition={{ duration: rolling ? 0.84 : 0.35, ease: "easeOut" }}
      >
        <span className="absolute inset-0 overflow-hidden rounded-full border border-border bg-background ring-1 ring-foreground/5 [backface-visibility:hidden]">
          <img
            src="/assets/0.png"
            alt=""
            draggable={false}
            className="size-full select-none object-cover"
          />
        </span>
        <span className="absolute inset-0 overflow-hidden rounded-full border border-border bg-secondary ring-1 ring-foreground/5 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <img
            src="/assets/1.png"
            alt=""
            draggable={false}
            className="size-full select-none object-cover"
          />
        </span>
      </motion.span>
    </motion.button>
  );
}

function LiuyaoResultActions({
  layout,
  copyStatus,
  aiPanelOpen,
  onCopy,
  onStartOver,
  onToggleAiPanel,
}: {
  layout: "mobile" | "desktop";
  copyStatus: CopyStatus;
  aiPanelOpen: boolean;
  onCopy: () => void;
  onStartOver: () => void;
  onToggleAiPanel: () => void;
}) {
  const compact = layout === "mobile";

  return (
    <div
      className={cn(
        "flex max-w-full items-center gap-2",
        compact ? "justify-between" : "justify-between gap-3"
      )}
    >
      <Button
        type="button"
        variant="outline"
        size={compact ? "sm" : "default"}
        onClick={onStartOver}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        再起一卦
      </Button>
      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon-sm" : "icon"}
          aria-label={copyStatus === "copied" ? "已复制排盘结果" : "复制排盘结果"}
          onClick={onCopy}
        >
          {copyStatus === "copied" ? <CheckIcon /> : <CopyIcon />}
        </Button>
        {copyStatus === "error" ? (
          <span className="text-xs text-destructive">复制失败</span>
        ) : null}
        <Button
          type="button"
          size={compact ? "sm" : "default"}
          aria-expanded={aiPanelOpen}
          onClick={onToggleAiPanel}
        >
          <SparklesIcon data-icon="inline-start" />
          {aiPanelOpen ? "收起AI" : "询问AI"}
        </Button>
      </div>
    </div>
  );
}

function PaipanResult({
  result,
  aiPanelOpen,
  actions,
}: {
  result: LiuyaoPaipan;
  aiPanelOpen: boolean;
  actions: ReactNode;
}) {
  const showChangedColumns = Boolean(result.changed);
  const hexagramTitle = formatHexagramTransition(result);

  return (
    <section
      className={cn(
        "flex w-full flex-col gap-4 text-card-foreground animate-in fade-in-0 slide-in-from-bottom-3 duration-300 sm:gap-6 lg:w-fit lg:max-w-full lg:flex-none",
        aiPanelOpen && "max-lg:gap-0"
      )}
    >
      <div className="hidden md:block">
        {actions}
      </div>

      <div
        className={cn(
          "flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-stretch lg:justify-between lg:gap-10",
          aiPanelOpen && "max-lg:gap-0"
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:gap-3 lg:w-max lg:max-w-[36rem] lg:flex-none">
          <div className={cn("flex flex-col lg:gap-2", aiPanelOpen ? "gap-2" : "gap-0")}>
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <div className="min-w-0 flex-1 truncate">{result.solar}</div>
              {aiPanelOpen ? (
                <div className="max-w-[50%] shrink-0 truncate text-right lg:hidden">
                  {hexagramTitle}
                </div>
              ) : null}
            </div>
            <AutoFitQuestionText compactOnMobile={aiPanelOpen}>{result.question}</AutoFitQuestionText>
          </div>

          <div className={cn("flex flex-col", aiPanelOpen ? "gap-1" : "gap-2 sm:gap-3")}>
            <div
              className={cn(
                "liuyao-mobile-ai-title",
                aiPanelOpen && "max-lg:hidden",
                aiPanelOpen ? "liuyao-mobile-ai-title-open" : "liuyao-mobile-ai-title-closed"
              )}
            >
              <h2 className="text-lg font-semibold tracking-tight">
                {hexagramTitle}
              </h2>
            </div>
            <PillarTimeSummary result={result} compactOnMobile={aiPanelOpen} />
            {!aiPanelOpen ? <BodySummary result={result} /> : null}
          </div>
        </div>

        <div
          className={cn(
            "liuyao-mobile-ai-collapse lg:contents",
            aiPanelOpen ? "liuyao-mobile-ai-collapse-closed" : "liuyao-mobile-ai-collapse-open"
          )}
        >
          <ShenshaPanel result={result} />
        </div>
      </div>

      <div
        className={cn(
          "liuyao-mobile-ai-collapse",
          aiPanelOpen ? "liuyao-mobile-ai-collapse-closed" : "liuyao-mobile-ai-collapse-open"
        )}
      >
        <div className="flex flex-col gap-4 sm:gap-6">
          <Separator />

          <div className="overflow-x-auto">
            <table
              className={cn(
                "border-collapse text-xs leading-tight [--liuyao-cell-x:0.125rem] [--liuyao-yao-gap:clamp(0.25rem,1.5vw,0.75rem)] [--liuyao-yao-width:clamp(2rem,calc((100vw_-_15.5rem)/2),4.5rem)] sm:text-base sm:[--liuyao-cell-x:0.5rem] sm:[--liuyao-yao-gap:0.75rem] sm:[--liuyao-yao-width:5rem] lg:mx-auto lg:w-max lg:min-w-0 lg:[--liuyao-cell-x:0.375rem]",
                showChangedColumns ? "w-full min-w-0 sm:min-w-[720px]" : "mx-auto w-max min-w-0 sm:min-w-[440px]"
              )}
            >
              <thead className="text-muted-foreground">
                <tr>
                  <td className="px-[var(--liuyao-cell-x)] py-0.5 sm:py-1" aria-hidden="true" />
                  <td className="px-[var(--liuyao-cell-x)] py-0.5 sm:py-1" aria-hidden="true" />
                  <th className="px-[var(--liuyao-cell-x)] py-0.5 text-center font-medium sm:py-1 lg:w-[clamp(7rem,11vw,10rem)]" scope="col">
                    <HexagramTableHeading hexagram={result.primary} fallback="本卦" />
                  </th>
                  <td className="px-[var(--liuyao-cell-x)] py-0.5 sm:py-1" aria-hidden="true" />
                  {showChangedColumns ? (
                    <>
                      <td className="px-[var(--liuyao-cell-x)] py-0.5 sm:py-1" aria-hidden="true" />
                      <td className="px-[var(--liuyao-cell-x)] py-0.5 sm:py-1" aria-hidden="true" />
                      <th className="px-[var(--liuyao-cell-x)] py-0.5 text-center font-medium sm:py-1 lg:w-[clamp(7rem,11vw,10rem)]" scope="col">
                        <HexagramTableHeading hexagram={result.changed} fallback="变卦" />
                      </th>
                      <td className="px-[var(--liuyao-cell-x)] py-0.5 sm:py-1" aria-hidden="true" />
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {[...result.lines].reverse().map((line) => (
                  <PaipanLineRow
                    key={line.position}
                    line={line}
                    showChangedColumns={showChangedColumns}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function AIDivinationPanel({
  open,
  result,
  onClose,
}: {
  open: boolean;
  result: LiuyaoPaipan;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<AIDivinationMessage[]>([]);
  const [sessionId, setSessionId] = useState(createLiuyaoAISessionId);
  const [isSending, setIsSending] = useState(false);
  const nextMessageIdRef = useRef(1);
  const activeRequestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const content = message.trim();

    if (!content || isSending) {
      return;
    }

    const userMessageId = nextMessageIdRef.current++;
    const assistantMessageId = nextMessageIdRef.current++;
    const requestMessages = buildLiuyaoAIRequestMessages(messages, content);
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;

    setMessages((prev) => [
      ...prev,
      {
        id: userMessageId,
        role: "user",
        content,
      },
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        status: "streaming",
      },
    ]);
    setMessage("");
    setIsSending(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const isActiveRequest = () => activeRequestIdRef.current === requestId;

    try {
      const response = await fetch(LIUYAO_AI_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payload: encodeBase64Json({
            systemPrompt: formatLiuyaoCopyMarkdown(result),
            sessionId,
            messages: requestMessages,
          }),
        }),
        signal: abortController.signal,
      });

      if (!isActiveRequest()) {
        return;
      }

      if (!response.ok || !response.body) {
        throw new Error(await readAIErrorMessage(response));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          const chunk = decoder.decode(value, { stream: true });

          if (!chunk) {
            continue;
          }

          if (isActiveRequest()) {
            setMessages((prev) => appendToMessage(prev, assistantMessageId, chunk));
          }
        }

        const rest = decoder.decode();

        if (rest && isActiveRequest()) {
          setMessages((prev) => appendToMessage(prev, assistantMessageId, rest));
        }
      } finally {
        reader.releaseLock();
      }

      if (!isActiveRequest()) {
        return;
      }

      setMessages((prev) =>
        prev.map((item) => {
          if (item.id !== assistantMessageId) {
            return item;
          }

          return {
            ...item,
            content: item.content || "AI 未返回内容。",
            status: item.content ? "complete" : "error",
          };
        })
      );
    } catch (err) {
      if (!isActiveRequest()) {
        return;
      }

      if (abortController.signal.aborted) {
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantMessageId
              ? {
                  ...item,
                  content: item.content || "已停止。",
                  status: "stopped",
                }
              : item
          )
        );
        return;
      }

      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content: err instanceof Error ? err.message : "AI 解卦失败，请稍后再试。",
                status: "error",
              }
            : item
        )
      );
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }

      if (isActiveRequest()) {
        setIsSending(false);
      }
    }
  };

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  const handleNewSession = () => {
    activeRequestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessage("");
    setMessages([]);
    setIsSending(false);
    setSessionId(createLiuyaoAISessionId());
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  return (
    <>
      <aside
        aria-hidden={!open}
        className={cn(
          "liuyao-ai-motion hidden min-h-0 w-[23rem] shrink-0 overflow-hidden rounded-2xl border bg-card shadow-sm lg:block lg:h-[clamp(28rem,calc(100vh-7rem),42rem)] lg:self-start",
          open ? "liuyao-ai-panel-open" : "liuyao-ai-panel-closed"
        )}
      >
        <AIDivinationPanelContent
          isSending={isSending}
          message={message}
          messages={messages}
          onClose={onClose}
          onNewSession={handleNewSession}
          onMessageChange={setMessage}
          onStop={handleStop}
          onSubmit={handleSubmit}
          tabIndex={open ? 0 : -1}
          variant="desktop"
        />
      </aside>
      <section
        aria-hidden={!open}
        aria-label="询问AI"
        className={cn(
          "liuyao-ai-mobile-panel liuyao-ai-motion min-h-0 w-full overflow-hidden border-t bg-background max-lg:flex max-lg:flex-col lg:hidden",
          open ? "liuyao-ai-mobile-panel-open" : "liuyao-ai-mobile-panel-closed"
        )}
      >
        <AIDivinationPanelContent
          isSending={isSending}
          message={message}
          messages={messages}
          onClose={onClose}
          onNewSession={handleNewSession}
          onMessageChange={setMessage}
          onStop={handleStop}
          onSubmit={handleSubmit}
          tabIndex={open ? 0 : -1}
          variant="mobile"
        />
      </section>
    </>
  );
}

function AIDivinationPanelContent({
  isSending,
  message,
  messages,
  onClose,
  onNewSession,
  onMessageChange,
  onStop,
  onSubmit,
  tabIndex,
  variant,
}: {
  isSending: boolean;
  message: string;
  messages: AIDivinationMessage[];
  onClose: () => void;
  onNewSession: () => void;
  onMessageChange: (value: string) => void;
  onStop: () => void;
  onSubmit: (event: FormEvent) => void;
  tabIndex: 0 | -1;
  variant: "desktop" | "mobile";
}) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const mobile = variant === "mobile";
  const messageInputId = mobile ? "liuyao-ai-message-mobile" : "liuyao-ai-message-desktop";

  useEffect(() => {
    if (tabIndex === -1) {
      return;
    }

    const viewport = getScrollAreaViewport(scrollAreaRef.current);

    if (!viewport) {
      return;
    }

    const updateShouldStick = () => {
      shouldStickToBottomRef.current = isScrolledNearBottom(viewport);
    };

    updateShouldStick();
    viewport.addEventListener("scroll", updateShouldStick, { passive: true });

    return () => {
      viewport.removeEventListener("scroll", updateShouldStick);
    };
  }, [tabIndex]);

  useEffect(() => {
    if (tabIndex === -1 || !shouldStickToBottomRef.current) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const viewport = getScrollAreaViewport(scrollAreaRef.current);

      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [messages, tabIndex]);

  return (
    <div
      className={cn(
        "grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden",
        mobile && "flex-1"
      )}
    >
      <div className={cn("flex items-center justify-between border-b", mobile ? "px-0 py-2" : "px-3 py-2")}>
        {mobile ? (
          <div className="text-xs font-medium text-muted-foreground">AI 解卦</div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="关闭询问AI"
            tabIndex={tabIndex}
            onClick={onClose}
          >
            <ArrowLeftIcon />
          </Button>
        )}
        {!mobile ? <div className="text-sm font-medium">询问AI</div> : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="新建询问AI会话"
          tabIndex={tabIndex}
          onClick={onNewSession}
        >
          <PlusIcon />
        </Button>
      </div>

      <div ref={scrollAreaRef} className="h-full min-h-0">
        <ScrollArea className="h-full min-h-0" aria-live="polite" aria-label="询问AI消息">
          <div className={cn("flex min-h-full flex-col justify-end gap-3 py-4", mobile ? "px-0" : "px-3")}>
            {messages.map((item) => (
              <div key={item.id} className={cn("flex", item.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm break-words",
                    item.role === "user"
                      ? "rounded-br-md bg-primary text-primary-foreground whitespace-pre-wrap"
                      : "liuyao-ai-markdown rounded-bl-md bg-muted text-card-foreground",
                    item.status === "error" && "bg-destructive/10 text-destructive"
                  )}
                >
                  <AIDivinationMessageContent message={item} />
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <form className={cn("border-t", mobile ? "py-3" : "p-3")} onSubmit={onSubmit}>
        <FieldGroup className="gap-0">
          <Field orientation="horizontal" className="items-center gap-2">
            <FieldLabel htmlFor={messageInputId} className="sr-only">追问内容</FieldLabel>
            <Input
              id={messageInputId}
              value={message}
              tabIndex={tabIndex}
              disabled={isSending}
              onChange={(event) => onMessageChange(event.target.value)}
              placeholder="输入你想了解的内容"
            />
            <Button
              type={isSending ? "button" : "submit"}
              size="icon"
              aria-label={isSending ? "停止输出" : "发送追问"}
              tabIndex={tabIndex}
              disabled={!isSending && !message.trim()}
              onClick={isSending ? onStop : undefined}
            >
              {isSending ? <SquareIcon /> : <ArrowUpIcon />}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
}

function AIDivinationMessageContent({ message }: { message: AIDivinationMessage }) {
  if (!message.content) {
    return message.status === "streaming" ? "正在解卦..." : null;
  }

  if (message.role === "assistant" && message.status !== "error") {
    return (
      <div
        dangerouslySetInnerHTML={{
          __html: renderLiuyaoMarkdown(message.content),
        }}
      />
    );
  }

  return message.content;
}

function getScrollAreaViewport(root: HTMLDivElement | null) {
  return root?.querySelector<HTMLElement>("[data-slot='scroll-area-viewport']") ?? null;
}

function isScrolledNearBottom(element: HTMLElement) {
  const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distanceToBottom < 32;
}

function renderLiuyaoMarkdown(content: string) {
  return liuyaoMarkdown.parse(
    content.replace(MARKDOWN_ZERO_WIDTH_PREFIX_PATTERN, ""),
    { async: false }
  );
}

function normalizeMarkdownUrl(href: string) {
  const trimmed = href.trim();

  if (!trimmed || /[\u0000-\u001F\u007F\s]/.test(trimmed)) {
    return "";
  }

  try {
    const url = new URL(trimmed, "https://oracle-studio.local");

    if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) {
      return trimmed;
    }
  } catch {
    return "";
  }

  return "";
}

const HTML_ESCAPE_REPLACEMENTS: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"'`]/g, (char) => HTML_ESCAPE_REPLACEMENTS[char] ?? char);
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value);
}

function appendToMessage(messages: AIDivinationMessage[], messageId: number, chunk: string) {
  return messages.map((item) =>
    item.id === messageId
      ? {
          ...item,
          content: item.content + chunk,
        }
      : item
  );
}

function buildLiuyaoAIRequestMessages(messages: AIDivinationMessage[], currentContent: string) {
  const history = messages
    .flatMap((item): Array<Pick<AIDivinationMessage, "role" | "content">> => {
      const content = item.content.trim();

      if (!content || (item.role === "assistant" && item.status === "error")) {
        return [];
      }

      return [
        {
          role: item.role,
          content: content.slice(0, MAX_LIUYAO_AI_MESSAGE_CONTENT_LENGTH),
        },
      ];
    })
    .slice(-(MAX_LIUYAO_AI_CONTEXT_MESSAGES - 1));

  return [
    ...history,
    {
      role: "user" as const,
      content: currentContent.slice(0, MAX_LIUYAO_AI_MESSAGE_CONTENT_LENGTH),
    },
  ];
}

function createLiuyaoAISessionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `liuyao-${globalThis.crypto.randomUUID()}`;
  }

  return `liuyao-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function encodeBase64Json(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

async function readAIErrorMessage(response: Response) {
  try {
    const data = await response.json();

    if (isRecord(data) && typeof data.error === "string") {
      return data.error;
    }
  } catch {
    // Fall through to the generic message below.
  }

  return "AI 解卦失败，请稍后再试。";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command failed");
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

function formatLiuyaoCopyMarkdown(result: LiuyaoPaipan) {
  const changed = result.changed ?? result.primary;
  const movingLines = result.lines.filter((line) => line.moving);

  return joinCopySections([
    [
      `所问之事：${result.question}`,
      `时间：${result.solar}`,
      `干支:${result.pillars.year}年 ${result.pillars.month}月 ${result.pillars.day}日 ${result.pillars.hour}时`,
      `空亡：年空亡${result.pillarVoids.year} 月空亡${result.pillarVoids.month} 日空亡${result.pillarVoids.day} 时空亡${result.pillarVoids.hour}`,
      `卦身：${result.guaBody}；世身：${result.worldBody}`,
      `动爻：${movingLines.length > 0 ? movingLines.map((line) => line.label).join("、") : "无（静卦）"}`,
    ].join("\n"),
    formatLiuyaoCopyCombinedTable(result, changed),
  ]);
}

function formatLiuyaoCopyCombinedTable(
  result: LiuyaoPaipan,
  changed: LiuyaoPaipan["primary"]
) {
  const primary = result.primary;

  return joinCopySections([
    `主卦/变卦：${primary.name} → ${changed.name}（主卦${primary.palace}${primary.palaceElement}，${primary.stage}，世在${YAO_NAMES[primary.worldPosition - 1]}，应在${YAO_NAMES[primary.responsePosition - 1]}；变卦六亲沿用主卦卦宫五行）`,
    copyMdTable(
      ["爻位", "六神", "世应", "主卦六亲", "主卦干支", "伏神", "是否变卦", "主卦神煞", "主卦长生", "变卦六亲", "变卦干支", "变卦神煞", "变卦长生"],
      [...result.lines]
        .sort((a, b) => b.position - a.position)
        .map((line) => {
          const changedLine = line.changed ?? line;

          return [
            `${line.label} ${line.type === "阳" ? "━━━ 阳" : "━ ━ 阴"}`,
            line.deity,
            line.role,
            line.relation,
            formatCopyStemBranch(line),
            formatCopyHiddenGods(line.hiddenGods),
            line.moving ? "是" : "-",
            formatCopyLineShensha(result, line),
            formatCopyLineChangsheng(result, line.element),
            copyRelationFor(primary.palaceElement, changedLine.element),
            formatCopyStemBranch(changedLine),
            formatCopyLineShensha(result, changedLine),
            formatCopyLineChangsheng(result, changedLine.element),
          ];
        })
    ),
  ]);
}

function formatCopyStemBranch(line: Pick<LiuyaoLineInfo, "stem" | "branch" | "element">) {
  return `${line.stem}${line.branch}（${line.element}）`;
}

function formatCopyHiddenGods(hiddenGods: LiuyaoLineInfo["hiddenGods"]) {
  return hiddenGods.length > 0
    ? hiddenGods.map((hiddenGod) => `${hiddenGod.relation}${hiddenGod.stem}${hiddenGod.branch}${COPY_BRANCH_ELEMENTS[hiddenGod.branch] ?? ""}`).join("、")
    : "-";
}

function formatCopyLineShensha(result: LiuyaoPaipan, line: Pick<LiuyaoLineInfo, "stem" | "branch">) {
  const basisValues = getCopyBasisValues(result);
  const monthBranch = getBranchFromPillarText(result.pillars.month);
  const dayBranch = getBranchFromPillarText(result.pillars.day);
  const { branch } = line;
  const hits: string[] = [];

  if (branch === monthBranch) hits.push("临月");
  if (branch === dayBranch) hits.push("临日");
  if (COPY_BRANCH_OPPOSITES[monthBranch] === branch) hits.push("月破");
  if (COPY_BRANCH_OPPOSITES[dayBranch] === branch) hits.push("日冲");
  if (COPY_BRANCH_COMBINES[monthBranch] === branch) hits.push("月合");
  if (COPY_BRANCH_COMBINES[dayBranch] === branch) hits.push("日合");
  if (result.pillarVoids.day.includes(branch)) hits.push("日空");

  for (const rule of COPY_STEM_BRANCH_SHENSHA_RULES) {
    for (const basis of rule.basis) {
      const basisValue = basisValues[basis];
      if ((rule.targets[basisValue.value] ?? []).includes(branch)) {
        hits.push(`${basisValue.label}${basisValue.value}:${rule.name}`);
      }
    }
  }

  for (const rule of COPY_BRANCH_GROUP_SHENSHA_RULES) {
    for (const basis of rule.basis) {
      const basisValue = basisValues[basis];
      if (copyGroupTarget(basisValue.value, rule.targetsByGroup) === branch) {
        hits.push(`${basisValue.label}${basisValue.value}:${rule.name}`);
      }
    }
  }

  for (const rule of COPY_MONTH_BRANCH_SHENSHA_RULES) {
    const targets = rule.targets[monthBranch] ?? [];

    if (copyMatchesTargets(line, targets)) {
      hits.push(`月支${monthBranch}:${rule.name}`);
    }
  }

  return [...new Set(hits)].join("、") || "-";
}

function getCopyBasisValues(result: LiuyaoPaipan) {
  return {
    yearStem: { label: "年干", value: getStemFromPillarText(result.pillars.year) },
    dayStem: { label: "日干", value: getStemFromPillarText(result.pillars.day) },
    yearBranch: { label: "年支", value: getBranchFromPillarText(result.pillars.year) },
    dayBranch: { label: "日支", value: getBranchFromPillarText(result.pillars.day) },
  } satisfies Record<CopyStemBasis | CopyBranchBasis, { label: string; value: string }>;
}

function copyGroupTarget(originBranch: string, targetsByGroup: Record<string, string>) {
  const group = Object.keys(targetsByGroup).find((item) => item.includes(originBranch));
  return group ? targetsByGroup[group] : undefined;
}

function copyMatchesTargets(line: Pick<LiuyaoLineInfo, "stem" | "branch">, targets: CopyTargetToken[]) {
  return targets.some((target) => target.type === "stem" ? line.stem === target.name : line.branch === target.name);
}

function formatCopyLineChangsheng(result: LiuyaoPaipan, element: CopyElementName) {
  const monthBranch = getBranchFromPillarText(result.pillars.month);
  const dayBranch = getBranchFromPillarText(result.pillars.day);

  return `月:${COPY_CHANGSHENG_BY_ELEMENT[element]?.[monthBranch] ?? "-"} 日:${COPY_CHANGSHENG_BY_ELEMENT[element]?.[dayBranch] ?? "-"}`;
}

function copyRelationFor(palaceElement: CopyElementName, lineElement: CopyElementName): CopyRelative {
  if (palaceElement === lineElement) return "兄弟";
  if (COPY_GENERATES[lineElement] === palaceElement) return "父母";
  if (COPY_GENERATES[palaceElement] === lineElement) return "子孙";
  if (COPY_CONTROLS[lineElement] === palaceElement) return "官鬼";
  return "妻财";
}

function getBranchFromPillarText(pillar: string) {
  return pillar.slice(-1);
}

function getStemFromPillarText(pillar: string) {
  return pillar.slice(0, 1);
}

function joinCopySections(sections: Array<string | undefined | null | false>) {
  return sections.filter(Boolean).join("\n\n");
}

function copyMdValue(value: unknown) {
  const text = value === undefined || value === null || value === "" ? "-" : String(value);
  return text.replace(/\r?\n/g, "<br>").replace(/\|/g, "\\|");
}

function copyMdTable(headers: string[], rows: unknown[][]) {
  return [
    `| ${headers.map(copyMdValue).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(copyMdValue).join(" | ")} |`),
  ].join("\n");
}

function AutoFitQuestionText({
  children,
  compactOnMobile = false,
}: {
  children: string;
  compactOnMobile?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    const textElement = textRef.current;

    if (!container || !textElement) {
      return;
    }

    let frameId = 0;
    const fitText = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const isDesktop = window.matchMedia("(min-width: 640px)").matches;
        const isMobileAiLayout = !window.matchMedia("(min-width: 1024px)").matches;

        if (compactOnMobile && isMobileAiLayout) {
          container.style.height = "1.25rem";
          container.style.overflow = "hidden";
          textElement.style.fontSize = "0.75rem";
          textElement.style.lineHeight = "1.25rem";
          textElement.style.overflow = "hidden";
          textElement.style.textOverflow = "ellipsis";
          textElement.style.whiteSpace = "nowrap";
          return;
        }

        const maxFontSize = isDesktop ? 24 : 20;
        const minFontSize = isDesktop ? 12 : 14;
        const targetHeight = isDesktop ? 64 : 56;
        let nextFontSize = maxFontSize;

        container.style.height = "auto";
        container.style.overflow = "visible";
        textElement.style.overflow = "visible";
        textElement.style.textOverflow = "clip";
        textElement.style.whiteSpace = "normal";
        textElement.style.fontSize = `${nextFontSize}px`;
        textElement.style.lineHeight = "1.3";

        if (!isDesktop && textElement.scrollHeight <= targetHeight) {
          return;
        }

        container.style.height = `${targetHeight}px`;
        container.style.overflow = "hidden";

        while (nextFontSize > minFontSize && textElement.scrollHeight > container.clientHeight) {
          nextFontSize -= 1;
          textElement.style.fontSize = `${nextFontSize}px`;
        }

        if (!isDesktop && textElement.scrollHeight > container.clientHeight) {
          container.style.height = "auto";
          container.style.overflow = "visible";
        }
      });
    };

    fitText();

    window.addEventListener("resize", fitText);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", fitText);
    };
  }, [children, compactOnMobile]);

  return (
    <div ref={containerRef} className="overflow-hidden transition-[height] duration-500 ease-out">
      <div ref={textRef} className="whitespace-normal break-words text-xl font-medium leading-tight text-foreground transition-[font-size,line-height] duration-500 ease-out sm:text-2xl">
        {children}
      </div>
    </div>
  );
}

function ShenshaPanel({ result }: { result: LiuyaoPaipan }) {
  const shenshaItems = result.shenshas.flatMap((shensha) =>
    shensha.branches.map((branch) => ({ branch, name: shensha.name }))
  );

  return (
    <aside className="flex w-full flex-col gap-2 sm:gap-3 sm:rounded-lg sm:bg-muted/35 sm:p-4 lg:w-max lg:min-w-0">
      <div className="hidden text-sm font-semibold tracking-tight sm:block">神煞</div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(4.75rem,1fr))] gap-x-1.5 gap-y-1.5 text-xs sm:gap-x-3 sm:gap-y-2 sm:text-sm lg:w-max lg:grid-cols-[max-content_max-content]">
        {shenshaItems.map((item) => (
          <div
            key={`${item.branch}-${item.name}`}
            className="grid grid-cols-[1.125rem_minmax(0,1fr)] items-baseline gap-0.5 sm:grid-cols-[1.25rem_minmax(0,1fr)] sm:gap-1 lg:grid-cols-[1.25rem_max-content]"
          >
            <span className="font-medium text-foreground">{item.branch}</span>
            <span className="truncate text-muted-foreground">{item.name}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function PillarTimeSummary({
  result,
  compactOnMobile = false,
}: {
  result: LiuyaoPaipan;
  compactOnMobile?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-x-5 gap-y-2 sm:gap-x-8 sm:gap-y-3",
        compactOnMobile && "max-lg:gap-x-3 max-lg:gap-y-1"
      )}
    >
      <PillarTimeItem
        label="年"
        value={result.pillars.year}
        voidValue={result.pillarVoids.year}
        compactOnMobile={compactOnMobile}
      />
      <PillarTimeItem
        label="月"
        value={result.pillars.month}
        voidValue={result.pillarVoids.month}
        compactOnMobile={compactOnMobile}
      />
      <PillarTimeItem
        label="日"
        value={result.pillars.day}
        voidValue={result.pillarVoids.day}
        compactOnMobile={compactOnMobile}
      />
      <PillarTimeItem
        label="时"
        value={result.pillars.hour}
        voidValue={result.pillarVoids.hour}
        compactOnMobile={compactOnMobile}
      />
    </div>
  );
}

function PillarTimeItem({
  label,
  value,
  voidValue,
  compactOnMobile = false,
}: {
  label: string;
  value: string;
  voidValue: string;
  compactOnMobile?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-12 flex-col gap-1 leading-none sm:min-w-14",
        compactOnMobile && "max-lg:min-w-0 max-lg:gap-0.5"
      )}
    >
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "text-base font-semibold text-foreground",
            compactOnMobile && "max-lg:text-xs max-lg:font-normal"
          )}
        >
          {value}
        </span>
        <span
          className={cn(
            "text-xs font-medium text-muted-foreground",
            compactOnMobile && "max-lg:font-normal"
          )}
        >
          {label}
        </span>
      </div>
      <div className={cn("text-[11px] text-muted-foreground", compactOnMobile && "max-lg:hidden")}>
        {voidValue}空
      </div>
    </div>
  );
}

function BodySummary({
  result,
}: {
  result: LiuyaoPaipan;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs leading-tight sm:text-sm">
      <BodySummaryItem label="卦身" value={result.guaBody} />
      <BodySummaryItem label="世身" value={result.worldBody} />
    </div>
  );
}

function BodySummaryItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className="shrink-0 font-medium text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words font-medium text-foreground">{value}</span>
    </div>
  );
}

function PaipanLineRow({
  line,
  showChangedColumns,
}: {
  line: LiuyaoLineInfo;
  showChangedColumns: boolean;
}) {
  const hiddenGodsText = formatHiddenGods(line.hiddenGods);

  return (
    <>
      <tr className="bg-background">
        <td className="w-0 whitespace-nowrap px-[var(--liuyao-cell-x)] pt-0.5 text-center font-medium sm:pt-1">{line.deity}</td>
        <td className="w-0 whitespace-nowrap px-[var(--liuyao-cell-x)] pt-0.5 sm:pt-1">
          <LineRelativeCell line={line} />
        </td>
        <td className="px-[var(--liuyao-cell-x)] pt-0.5 sm:pt-1 lg:w-[clamp(7rem,11vw,10rem)]">
          <div className="flex items-center justify-center">
            <YaoGlyph type={line.type} />
          </div>
        </td>
        <td className="w-0 whitespace-nowrap px-[var(--liuyao-cell-x)] pt-0.5 text-center font-medium sm:pt-1">{line.role}</td>
        {showChangedColumns ? (
          <>
            <td className="w-0 whitespace-nowrap px-[var(--liuyao-cell-x)] pt-0.5 text-center font-medium sm:pt-1">{line.movingSymbol}</td>
            <td className="w-0 whitespace-nowrap px-[var(--liuyao-cell-x)] pt-0.5 sm:pt-1">
              {line.changed ? <LineRelativeCell line={line.changed} /> : null}
            </td>
            <td className="px-[var(--liuyao-cell-x)] pt-0.5 sm:pt-1 lg:w-[clamp(7rem,11vw,10rem)]">
              <div className="flex items-center justify-center">
                {line.changed ? <YaoGlyph type={line.changed.type} /> : null}
              </div>
            </td>
            <td className="w-0 whitespace-nowrap px-[var(--liuyao-cell-x)] pt-0.5 text-center font-medium sm:pt-1">
              {line.changed?.role ?? ""}
            </td>
          </>
        ) : null}
      </tr>
      <tr className="bg-background text-[11px] leading-tight text-muted-foreground sm:text-sm">
        <td className="px-[var(--liuyao-cell-x)] pb-0.5 pt-0 sm:pb-1" aria-hidden="true" />
        <td className="h-3 w-0 whitespace-nowrap px-[var(--liuyao-cell-x)] pb-0.5 pt-0 sm:h-4 sm:pb-1">
          <span
            className={cn(
              "inline-flex shrink-0 items-center whitespace-nowrap",
              !hiddenGodsText && "invisible"
            )}
            aria-hidden={!hiddenGodsText}
          >
            <CornerLeftUpIcon className="size-[1em] shrink-0" aria-hidden="true" />
            {hiddenGodsText || "占位"}
          </span>
        </td>
        <td className="px-[var(--liuyao-cell-x)] pb-0.5 pt-0 sm:pb-1" aria-hidden="true" />
        <td className="px-[var(--liuyao-cell-x)] pb-0.5 pt-0 sm:pb-1" aria-hidden="true" />
        {showChangedColumns ? (
          <>
            <td className="px-[var(--liuyao-cell-x)] pb-0.5 pt-0 sm:pb-1" aria-hidden="true" />
            <td className="px-[var(--liuyao-cell-x)] pb-0.5 pt-0 sm:pb-1" aria-hidden="true" />
            <td className="px-[var(--liuyao-cell-x)] pb-0.5 pt-0 sm:pb-1" aria-hidden="true" />
            <td className="px-[var(--liuyao-cell-x)] pb-0.5 pt-0 sm:pb-1" aria-hidden="true" />
          </>
        ) : null}
      </tr>
    </>
  );
}

function HexagramTableHeading({
  hexagram,
  fallback,
}: {
  hexagram: LiuyaoPaipan["primary"] | null;
  fallback: string;
}) {
  if (!hexagram) {
    return <span className="block text-center">{fallback}</span>;
  }

  return (
    <div className="flex flex-col items-center gap-0.5 text-center leading-tight">
      <span className="text-foreground">{formatHexagramName(hexagram)}</span>
      <span className="text-[11px] font-normal leading-tight text-muted-foreground sm:text-sm">
        {formatHexagramMeta(hexagram)}
      </span>
    </div>
  );
}

function LineRelativeCell({
  line,
}: {
  line: Pick<LiuyaoLineInfo, "relation" | "stem" | "branch">;
}) {
  return (
    <div className="leading-tight">
      <span className="font-medium">
        {line.relation}·{line.stem}{line.branch}
      </span>
    </div>
  );
}

function formatHiddenGods(hiddenGods: LiuyaoLineInfo["hiddenGods"]) {
  return hiddenGods
    .map((hiddenGod) => `${hiddenGod.relation}·${hiddenGod.stem}${hiddenGod.branch}`)
    .join("、");
}

function formatHexagramName(hexagram: Pick<LiuyaoPaipan["primary"], "name" | "pattern">) {
  return `${hexagram.name}${hexagram.pattern ? `·${hexagram.pattern}` : ""}`;
}

function formatHexagramTransition(result: Pick<LiuyaoPaipan, "primary" | "changed">) {
  return `${formatHexagramName(result.primary)}${
    result.changed ? ` 之 ${formatHexagramName(result.changed)}` : ""
  }`;
}

function formatHexagramMeta(hexagram: Pick<LiuyaoPaipan["primary"], "palace" | "stage" | "pattern">) {
  return `${hexagram.palace}·${hexagram.stage}`;
}

function YaoGlyph({ type, className }: { type: YaoType; className?: string }) {
  return (
    <div className={cn("flex h-4 w-[var(--liuyao-yao-width,5rem)] min-w-0 items-center", className)}>
      {type === "阳" ? (
        <div className="h-2 w-full rounded bg-foreground" />
      ) : (
        <div className="flex w-full gap-[var(--liuyao-yao-gap,0.75rem)]">
          <div className="h-2 flex-1 rounded bg-foreground" />
          <div className="h-2 flex-1 rounded bg-foreground" />
        </div>
      )}
    </div>
  );
}

function YaoPlaceholderGlyph({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-4 w-[var(--liuyao-yao-width,5rem)] min-w-0 items-center", className)}>
      <div className="h-2 w-full rounded border border-dashed border-muted-foreground/60" />
    </div>
  );
}
