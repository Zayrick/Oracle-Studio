import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { format } from "date-fns";
import { motion, useReducedMotion } from "motion/react";
import { CornerLeftUpIcon } from "lucide-react";
import { Marked, type RendererObject } from "marked";
import type { Route } from "./+types/liuyao";

import { DivinationAIChatPanel } from "@/components/divination-ai-chat";
import { DivinationPageFrame } from "@/components/divination-page-frame";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
  activateLiuyaoAIHistorySession,
  createEmptyLiuyaoAIHistoryState,
  createLiuyaoAISessionId,
  createLiuyaoHistoryRecord,
  getLiuyaoHistoryRecord,
  getLiuyaoAIHistorySession,
  restoreLiuyaoHistoryRecord,
  updateLiuyaoHistoryRecordAI,
  upsertLiuyaoAIHistorySession,
  type LiuyaoAIHistoryState,
  type LiuyaoAIMessage as AIDivinationMessage,
  type LiuyaoCastingMethod,
  type LiuyaoHistoryRecord,
} from "@/features/liuyao/history";
import {
  appendAIChatEventToMessage,
  buildAIChatRequestMessages,
  getNextAIChatMessageId,
  markStreamingAIChatMessagesStopped,
  readAIErrorMessage,
} from "@/features/ai/chat";
import {
  readAIStreamEvents,
} from "@/features/ai/timeline";
import {
  buildLiuyaoPaipan,
  createLiuyaoRandomYaos,
  createLiuyaoTimeCastingYaos,
  YAO_NAMES,
  type LiuyaoInputYao,
  type LiuyaoLineInfo,
  type LiuyaoPaipan,
  type YaoType,
} from "@/features/liuyao/paipan";
import { runDivinationViewTransition } from "@/lib/divination-view-transition";
import { cn } from "@/lib/utils";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "云占·六爻" },
    { name: "description", content: "六爻占卜" },
  ];
}

const YAO_INDEXES_TOP_DOWN = [5, 4, 3, 2, 1, 0];
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

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
const LIUYAO_AI_ENDPOINT = "/api/liuyao/ai";
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const historyId = searchParams.get("history");
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
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [aiHistory, setAiHistory] = useState<LiuyaoAIHistoryState>(() =>
    createEmptyLiuyaoAIHistoryState()
  );
  const [error, setError] = useState("");
  const { copyStatus, copyResult, resetCopyStatus } = useLiuyaoResultCopy(result);
  const reduceMotion = useReducedMotion();
  const onlineRollingRef = useRef(false);
  const onlineRollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiHistoryRef = useRef(aiHistory);

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

  const resetFormState = () => {
    const now = new Date();

    setQuestion("");
    setDate(now);
    setTime(format(now, "HH:mm"));
    setCastingMethod("manual");
    resetOnlineCastingState();
  };

  useEffect(() => {
    return () => {
      if (onlineRollingTimeoutRef.current) {
        clearTimeout(onlineRollingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    aiHistoryRef.current = aiHistory;
  }, [aiHistory]);

  useEffect(() => {
    if (!historyId) {
      if (activeHistoryId) {
        runDivinationViewTransition(() => {
          resetCopyStatus();
          resetFormState();
          setResult(null);
          setActiveHistoryId(null);
          setAiHistory(createEmptyLiuyaoAIHistoryState());
          setAiPanelOpen(false);
          setError("");
        });
      }
      return;
    }

    if (historyId === activeHistoryId) {
      return;
    }

    const record = getLiuyaoHistoryRecord(historyId);

    if (!record) {
      runDivinationViewTransition(() => {
        resetCopyStatus();
        resetFormState();
        setResult(null);
        setActiveHistoryId(null);
        setAiHistory(createEmptyLiuyaoAIHistoryState());
        setAiPanelOpen(false);
        setError("历史记录不存在或已删除。");
      });
      return;
    }

    handleRestoreHistoryRecord(record);
  }, [historyId]);

  const handleSetNow = () => {
    const now = new Date();
    setDate(now);
    setTime(format(now, "HH:mm"));
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
          ? createLiuyaoRandomYaos()
          : castingMethod === "time"
            ? createLiuyaoTimeCastingYaos(date, time)
            : yaos;
      const nextResult = buildLiuyaoPaipan({ question, date, time, yaos: submittedYaos });
      const nextAiHistory = createEmptyLiuyaoAIHistoryState();
      let nextHistoryRecord: LiuyaoHistoryRecord | null = null;

      try {
        nextHistoryRecord = createLiuyaoHistoryRecord({
          question: nextResult.question,
          date,
          time,
          castingMethod,
          yaos: submittedYaos,
          result: nextResult,
          ai: nextAiHistory,
        }) ?? null;
      } catch {
        nextHistoryRecord = null;
      }

      runDivinationViewTransition(() => {
        resetCopyStatus();
        if (castingMethod === "random" || castingMethod === "time") {
          setYaos(submittedYaos);
          setManualYaoSelections(createManualYaoSelectionState(true));
        }
        setResult(nextResult);
        setActiveHistoryId(nextHistoryRecord?.id ?? null);
        setAiHistory(nextAiHistory);
        setAiPanelOpen(false);
      });

      if (nextHistoryRecord) {
        navigate(`/liuyao?history=${encodeURIComponent(nextHistoryRecord.id)}`, { replace: true });
      }
    } catch (err) {
      resetCopyStatus();
      setResult(null);
      setAiPanelOpen(false);
      setError(err instanceof Error ? err.message : "排盘失败，请检查输入。");
    }
  };

  const handleStartOver = () => {
    runDivinationViewTransition(() => {
      resetCopyStatus();
      resetFormState();
      setResult(null);
      setActiveHistoryId(null);
      setAiHistory(createEmptyLiuyaoAIHistoryState());
      setAiPanelOpen(false);
      setError("");
    });
    navigate("/liuyao", { replace: true });
  };

  const handleRestoreHistoryRecord = (record: LiuyaoHistoryRecord) => {
    try {
      const restored = restoreLiuyaoHistoryRecord(record);

      clearOnlineRollingTimeout();
      onlineRollingRef.current = false;
      runDivinationViewTransition(() => {
        resetCopyStatus();
        setQuestion(restored.question);
        setDate(restored.date);
        setTime(restored.time);
        setCastingMethod(restored.castingMethod);
        setYaos(restored.yaos);
        setManualYaoSelections(createManualYaoSelectionState(true));
        setOnlineCoins(createInitialOnlineCoins());
        setOnlineCastCount(restored.castingMethod === "online" ? ONLINE_CASTING_LINE_COUNT : 0);
        setOnlineLastCoinScore(null);
        setOnlineRolling(false);
        setResult(restored.result);
        setActiveHistoryId(record.id);
        setAiHistory(restored.ai);
        setAiPanelOpen(false);
        setError("");
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "历史记录恢复失败。");
    }
  };

  const handleAIHistoryChange = (
    updater: (current: LiuyaoAIHistoryState) => LiuyaoAIHistoryState,
    options?: { touch?: boolean }
  ) => {
    const next = updater(aiHistoryRef.current);

    aiHistoryRef.current = next;
    setAiHistory(next);

    if (activeHistoryId) {
      updateLiuyaoHistoryRecordAI(activeHistoryId, next, options);
    }
  };

  const onlineCastingComplete = onlineCastCount >= ONLINE_CASTING_LINE_COUNT;
  const submitDisabled = castingMethod === "online" && (!onlineCastingComplete || onlineRolling);

  return (
    <DivinationPageFrame
      form={{
        title: "六爻排盘",
        description: "本卦、变卦、纳甲、六亲、六神与旬空",
        content: (
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
        ),
      }}
      result={
        result
          ? {
              ariaLabel: "六爻解卦结果",
              content: <PaipanResult result={result} />,
              pageClassName: "lg:items-center lg:justify-center",
              restartLabel: "再起一卦",
              onRestart: handleStartOver,
              copy: {
                status: copyStatus,
                onCopy: copyResult,
              },
              ai: {
                open: aiPanelOpen,
                onToggle: () => setAiPanelOpen((open) => !open),
                panel: (
                  <AIDivinationPanel
                    open={aiPanelOpen}
                    result={result}
                    historyRecordId={activeHistoryId}
                    aiHistory={aiHistory}
                    onClose={() => setAiPanelOpen(false)}
                    onAIHistoryChange={handleAIHistoryChange}
                  />
                ),
              },
            }
          : undefined
      }
    />
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

function PaipanResult({
  result,
}: {
  result: LiuyaoPaipan;
}) {
  const showChangedColumns = Boolean(result.changed);
  const hexagramTitle = formatHexagramTransition(result);

  return (
    <section
      className="flex w-full flex-col gap-4 text-card-foreground animate-in fade-in-0 slide-in-from-bottom-3 duration-300 sm:gap-6 lg:mx-auto lg:max-w-[46rem]"
    >
      <div
        className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:gap-3">
          <div className="flex flex-col gap-2 lg:gap-2">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <div className="min-w-0 flex-1 truncate">{result.solar}</div>
            </div>
            <AutoFitQuestionText>{result.question}</AutoFitQuestionText>
          </div>

          <div className="flex flex-col gap-2 sm:gap-3">
            <div className="hidden lg:block">
              <h2 className="text-lg font-semibold tracking-tight">
                {hexagramTitle}
              </h2>
            </div>
            <PillarTimeSummary result={result} />
            <BodySummary result={result} />
          </div>
        </div>

        <div>
          <ShenshaPanel result={result} />
        </div>
      </div>

      <div>
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
  historyRecordId,
  aiHistory,
  onClose,
  onAIHistoryChange,
}: {
  open: boolean;
  result: LiuyaoPaipan;
  historyRecordId: string | null;
  aiHistory: LiuyaoAIHistoryState;
  onClose: () => void;
  onAIHistoryChange: (
    updater: (current: LiuyaoAIHistoryState) => LiuyaoAIHistoryState,
    options?: { touch?: boolean }
  ) => void;
}) {
  const activeSession = getLiuyaoAIHistorySession(aiHistory, aiHistory.activeSessionId);
  const [message, setMessage] = useState("");
  const [messages, setMessagesState] = useState<AIDivinationMessage[]>(
    () => activeSession?.messages ?? []
  );
  const [sessionId, setSessionIdState] = useState(aiHistory.activeSessionId);
  const [isSending, setIsSending] = useState(false);
  const messagesRef = useRef(messages);
  const sessionIdRef = useRef(sessionId);
  const nextMessageIdRef = useRef(getNextAIChatMessageId(messages));
  const activeRequestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mobileTitle = formatHexagramTransition(result);

  const setMessages = (
    updater:
      | AIDivinationMessage[]
      | ((current: AIDivinationMessage[]) => AIDivinationMessage[])
  ) => {
    const nextMessages = typeof updater === "function"
      ? updater(messagesRef.current)
      : updater;

    messagesRef.current = nextMessages;
    setMessagesState(nextMessages);

    return nextMessages;
  };

  const setSessionId = (nextSessionId: string) => {
    sessionIdRef.current = nextSessionId;
    setSessionIdState(nextSessionId);
  };

  const persistSession = (
    nextMessages: AIDivinationMessage[],
    options?: { touch?: boolean }
  ) => {
    if (nextMessages.length === 0) {
      return;
    }

    onAIHistoryChange(
      (current) =>
        upsertLiuyaoAIHistorySession(current, {
          sessionId: sessionIdRef.current,
          messages: nextMessages,
        }),
      options
    );
  };

  useEffect(() => {
    const nextSessionId = aiHistory.activeSessionId || createLiuyaoAISessionId();
    const nextSession = getLiuyaoAIHistorySession(aiHistory, nextSessionId);
    const nextMessages = nextSession?.messages ?? [];

    activeRequestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessage("");
    setMessages(nextMessages);
    setSessionId(nextSessionId);
    setIsSending(false);
    nextMessageIdRef.current = getNextAIChatMessageId(nextMessages);
  }, [aiHistory.activeSessionId, historyRecordId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const content = message.trim();

    if (!content || isSending) {
      return;
    }

    const userMessageId = nextMessageIdRef.current++;
    const assistantMessageId = nextMessageIdRef.current++;
    const requestMessages = buildAIChatRequestMessages(messagesRef.current, content);
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;

    const nextMessages = setMessages([
      ...messagesRef.current,
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
    persistSession(nextMessages);
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
          systemPrompt: formatLiuyaoCopyMarkdown(result),
          sessionId,
          messages: requestMessages,
        }),
        signal: abortController.signal,
      });

      if (!isActiveRequest()) {
        return;
      }

      if (!response.ok || !response.body) {
        throw new Error(await readAIErrorMessage(response, "AI 解卦失败，请稍后再试。"));
      }

      await readAIStreamEvents(response.body, (event) => {
        if (event.type === "error") {
          throw new Error(event.message);
        }

        if (isActiveRequest()) {
          setMessages((prev) => appendAIChatEventToMessage(prev, assistantMessageId, event));
        }
      });

      if (!isActiveRequest()) {
        return;
      }

      const finalMessages = setMessages((prev) =>
        prev.map((item) => {
          if (item.id !== assistantMessageId) {
            return item;
          }

          const hasOutput = Boolean(item.content || item.parts?.length);

          return {
            ...item,
            content: hasOutput ? item.content : "AI 未返回内容。",
            status: hasOutput ? "complete" : "error",
          };
        })
      );
      persistSession(finalMessages);
    } catch (err) {
      if (!isActiveRequest()) {
        return;
      }

      if (abortController.signal.aborted) {
        const stoppedMessages = setMessages((prev) =>
          prev.map((item) => {
            if (item.id !== assistantMessageId) {
              return item;
            }

            return {
              ...item,
              content: item.content || "已停止。",
              status: "stopped",
            };
          })
        );
        persistSession(stoppedMessages);
        return;
      }

      const errorMessages = setMessages((prev) =>
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
      persistSession(errorMessages);
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
    const stoppedMessages = markStreamingAIChatMessagesStopped(messagesRef.current);

    if (stoppedMessages !== messagesRef.current) {
      persistSession(stoppedMessages);
    }

    const nextSessionId = createLiuyaoAISessionId();
    activeRequestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessage("");
    setMessages([]);
    setIsSending(false);
    setSessionId(nextSessionId);
    nextMessageIdRef.current = 1;
    onAIHistoryChange(
      (current) => activateLiuyaoAIHistorySession(current, nextSessionId),
      { touch: false }
    );
  };

  const handleRestoreSession = (restoredSessionId: string) => {
    const session = getLiuyaoAIHistorySession(aiHistory, restoredSessionId);

    if (!session) {
      return;
    }

    activeRequestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessage("");
    setMessages(session.messages);
    setSessionId(session.sessionId);
    setIsSending(false);
    nextMessageIdRef.current = getNextAIChatMessageId(session.messages);
    onAIHistoryChange(
      (current) => activateLiuyaoAIHistorySession(current, session.sessionId),
      { touch: false }
    );
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
    <DivinationAIChatPanel
      open={open}
      desktopTitle="AI 解卦"
      mobileTitle={mobileTitle}
      pendingLabel="正在解卦..."
      inputValue={message}
      messages={messages}
      isSending={isSending}
      history={{
        sessions: aiHistory.sessions,
        activeSessionId: sessionId,
        description: "恢复此卦中过去的询问会话。",
        emptyDescription: "此卦还没有保存过询问会话。",
        onRestoreSession: handleRestoreSession,
      }}
      onInputChange={setMessage}
      onNewSession={handleNewSession}
      onStop={handleStop}
      onSubmit={handleSubmit}
      renderMarkdown={renderLiuyaoMarkdown}
    />
  );
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
  const movingLines = result.lines.filter((line) => line.moving);

  return joinCopySections([
    [
      `所问之事：${result.question}  `,
      `时间：${result.solar}  `,
      `农历：${result.lunar}  `,
      `节气：${result.solarTerm || "-"}  `,
      `月建：${result.monthJian}  `,
      `干支:${result.pillars.year}年 ${result.pillars.month}月 ${result.pillars.day}日 ${result.pillars.hour}时  `,
      `空亡：年空亡${result.pillarVoids.year} 月空亡${result.pillarVoids.month} 日空亡${result.pillarVoids.day} 时空亡${result.pillarVoids.hour}  `,
      `身爻：${result.guaBody}；世爻：${result.worldBody}  `,
      `动爻：${movingLines.length > 0 ? movingLines.map((line) => line.label).join("、") : "无（静卦）"}  `,
    ].join("\n"),
    // 暂不放入系统提示词，后续需要时再恢复。
    // formatLiuyaoCopyGuaOverview(result),
    formatLiuyaoCopyCombinedTable(result),
    // 暂不放入系统提示词，后续需要时再恢复。
    // formatLiuyaoCopyGuaTexts(result),
  ]);
}

function formatLiuyaoCopyGuaOverview(result: LiuyaoPaipan) {
  const zhiHexagram = result.changed ?? result.primary;

  return joinCopySections([
    "## 三卦概览",
    copyMdTable(
      ["项目", "本卦", "之卦", "互卦"],
      [
        ["卦名", formatHexagramName(result.primary), formatHexagramName(zhiHexagram), formatHexagramName(result.mutual)],
        ["卦宫", result.primary.palace, zhiHexagram.palace, result.mutual.palace],
        ["宫五行", result.primary.palaceElement, zhiHexagram.palaceElement, result.mutual.palaceElement],
        ["宫位", result.primary.stage, zhiHexagram.stage, result.mutual.stage],
        ["上下卦", `${result.primary.upperTrigram}上${result.primary.lowerTrigram}下`, `${zhiHexagram.upperTrigram}上${zhiHexagram.lowerTrigram}下`, `${result.mutual.upperTrigram}上${result.mutual.lowerTrigram}下`],
        ["五星", result.primary.wuXingStar, zhiHexagram.wuXingStar, result.mutual.wuXingStar],
        ["身爻", result.guaBody, formatCopyRawShenYao(result.raw.zhiGua), formatCopyRawShenYao(result.raw.huGua)],
        ["卦辞", result.primary.guaCi, zhiHexagram.guaCi, result.mutual.guaCi],
        ["彖辞", result.primary.tuanCi, zhiHexagram.tuanCi, result.mutual.tuanCi],
      ]
    ),
  ]);
}

function formatLiuyaoCopyCombinedTable(result: LiuyaoPaipan) {
  const primary = result.primary;
  const zhiHexagram = result.changed ?? result.primary;

  return joinCopySections([
    `## 六爻明细\n主卦/之卦：${formatHexagramName(primary)} → ${formatHexagramName(zhiHexagram)}（主卦${primary.palace}${primary.palaceElement}，${primary.stage}，世在${YAO_NAMES[primary.worldPosition - 1]}，应在${YAO_NAMES[primary.responsePosition - 1]}；之卦六亲沿用本卦卦宫五行）\n伏神说明：常规伏神=本卦中缺少的六亲；完整伏神=本宫纯卦逐爻排入的伏神；旁伏神=对宫纯卦体系排出的伏神。`,
    copyMdTable(
      ["爻位", "本卦爻", "六兽", "世应", "本卦六亲", "本卦纳甲", "本卦纳音", "本卦五行", "星宿/锁泊", "岁限", "常规伏神", "完整伏神", "旁伏神", "是否动爻", "本卦状态", "本卦神煞辅助", "本卦长生", "之卦爻", "之卦世应", "之卦六亲", "之卦纳甲", "之卦纳音", "之卦五行", "之卦星宿/锁泊", "之卦岁限", "之卦状态", "之卦神煞辅助", "之卦长生"],
      [...result.lines]
        .sort((a, b) => b.position - a.position)
        .map((line) => {
          const changedLine = line.changed;

          return [
            line.label,
            formatCopyYao(line),
            line.deity,
            line.role,
            line.relation,
            formatCopyStemBranch(line),
            line.naYin,
            line.element,
            formatCopyXingXiu(line),
            line.suiXian,
            formatCopyHiddenGod(line.regularFuShen),
            formatCopyHiddenGod(line.fuShen),
            formatCopyHiddenGod(line.pangFuShen),
            line.moving ? "是" : "-",
            formatCopyLineStatuses(result, line),
            formatCopyAllLineShensha(result, line),
            formatCopyLineChangsheng(result, line.element),
            changedLine ? formatCopyChangedYao(changedLine) : "-",
            changedLine?.role ?? "-",
            changedLine?.relation ?? "-",
            changedLine ? formatCopyStemBranch(changedLine) : "-",
            changedLine?.naYin ?? "-",
            changedLine?.element ?? "-",
            changedLine ? formatCopyXingXiu(changedLine) : "-",
            changedLine?.suiXian ?? "-",
            changedLine ? formatCopyLineStatuses(result, changedLine) : "-",
            changedLine ? formatCopyAllLineShensha(result, changedLine) : "-",
            changedLine ? formatCopyLineChangsheng(result, changedLine.element) : "-",
          ];
        })
    ),
  ]);
}

function formatLiuyaoCopyGuaTexts(result: LiuyaoPaipan) {
  return joinCopySections([
    "## 卦爻辞",
    formatCopyGuaText("本卦", result.raw.benGua, result.primary),
    formatCopyGuaText("之卦", result.raw.zhiGua, result.changed ?? result.primary),
    formatCopyGuaText("互卦", result.raw.huGua, result.mutual),
  ]);
}

function formatCopyGuaText(
  title: string,
  gua: LiuyaoPaipan["raw"]["benGua"],
  hexagram: LiuyaoPaipan["primary"]
) {
  return joinCopySections([
    `### ${title}：${formatHexagramName(hexagram)}`,
    `卦辞：${gua.guaCi || "-"}`,
    `彖辞：${gua.tuanCi || "-"}`,
    copyMdTable(
      ["爻位", "爻辞"],
      gua.yaoCi.map((text, index) => [YAO_NAMES[index], text || "-"])
    ),
  ]);
}

function formatCopyStemBranch(line: Pick<LiuyaoLineInfo, "stem" | "branch" | "element">) {
  return `${line.stem}${line.branch}（${line.element}）`;
}

function formatCopyHiddenGod(hiddenGod: LiuyaoLineInfo["fuShen"]) {
  if (!hiddenGod) {
    return "-";
  }

  const host = YAO_NAMES[hiddenGod.hostPosition - 1] ?? `${hiddenGod.hostPosition}爻`;

  return `${hiddenGod.relation}${hiddenGod.stem}${hiddenGod.branch}（${hiddenGod.element}，${hiddenGod.naYin}，伏于${host}）`;
}

function formatCopyHiddenGods(hiddenGods: LiuyaoLineInfo["hiddenGods"]) {
  return hiddenGods.length > 0
    ? hiddenGods.map(formatCopyHiddenGod).join("、")
    : "-";
}

function formatCopyYao(line: Pick<LiuyaoLineInfo, "type" | "yaoValue" | "labelValue" | "moving">) {
  return `${line.labelValue}${line.type === "阳" ? " ━━━" : " ━ ━"}${line.moving ? "（动）" : ""}（${line.yaoValue}）`;
}

function formatCopyChangedYao(line: NonNullable<LiuyaoLineInfo["changed"]>) {
  return `${formatCopyYaoValue(line.yaoValue)}${line.type === "阳" ? " ━━━" : " ━ ━"}（${line.yaoValue}）`;
}

function formatCopyYaoValue(value: number) {
  if (value === 6) return "老阴";
  if (value === 7) return "少阳";
  if (value === 8) return "少阴";
  if (value === 9) return "老阳";

  return String(value);
}

function formatCopyXingXiu(line: Pick<LiuyaoLineInfo, "xingXiu" | "suoBo"> | NonNullable<LiuyaoLineInfo["changed"]>) {
  return [line.xingXiu, line.suoBo ? `锁泊:${line.suoBo}` : ""].filter(Boolean).join("；") || "-";
}

function formatCopyAllLineShensha(result: LiuyaoPaipan, line: Pick<LiuyaoLineInfo, "stem" | "branch">) {
  const libraryHits = result.shenshas
    .filter((item) => item.branches.includes(line.branch))
    .map((item) => item.name);
  const helperHits = formatCopyLineShensha(result, line);

  return [
    ...libraryHits,
    ...(helperHits === "-" ? [] : helperHits.split("、")),
  ].filter((item, index, list) => item && list.indexOf(item) === index).join("、") || "-";
}

function formatCopyLineStatuses(result: LiuyaoPaipan, line: Pick<LiuyaoLineInfo, "branch">) {
  const hits: string[] = [];

  if (result.pillarVoids.year.includes(line.branch)) hits.push("年空");
  if (result.pillarVoids.month.includes(line.branch)) hits.push("月空");
  if (result.pillarVoids.day.includes(line.branch)) hits.push("日空");
  if (result.pillarVoids.hour.includes(line.branch)) hits.push("时空");

  return [...new Set(hits)].join("、") || "-";
}

function formatCopyRawShenYao(gua: LiuyaoPaipan["raw"]["benGua"]) {
  if (!gua.shenYao) {
    return "-";
  }

  const yao = gua.yaoList[gua.shenYao - 1];

  return `${YAO_NAMES[gua.shenYao - 1]}${yao ? `（${yao.naJia}）` : ""}`;
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

function AutoFitQuestionText({ children }: { children: string }) {
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
  }, [children]);

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

function PillarTimeSummary({ result }: { result: LiuyaoPaipan }) {
  return (
    <div className="flex flex-wrap items-start gap-x-5 gap-y-2 sm:gap-x-8 sm:gap-y-3">
      <PillarTimeItem
        label="年"
        value={result.pillars.year}
        voidValue={result.pillarVoids.year}
      />
      <PillarTimeItem
        label="月"
        value={result.pillars.month}
        voidValue={result.pillarVoids.month}
      />
      <PillarTimeItem
        label="日"
        value={result.pillars.day}
        voidValue={result.pillarVoids.day}
      />
      <PillarTimeItem
        label="时"
        value={result.pillars.hour}
        voidValue={result.pillarVoids.hour}
      />
    </div>
  );
}

function PillarTimeItem({
  label,
  value,
  voidValue,
}: {
  label: string;
  value: string;
  voidValue: string;
}) {
  return (
    <div className="flex min-w-12 flex-col gap-1 leading-none sm:min-w-14">
      <div className="flex items-baseline gap-1">
        <span className="text-base font-semibold text-foreground">
          {value}
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground">
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
      <BodySummaryItem label="身爻" value={result.guaBody} />
      <BodySummaryItem label="世爻" value={result.worldBody} />
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
  const regularFuShenText = formatRegularFuShen(line.regularFuShen);

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
              !regularFuShenText && "invisible"
            )}
            aria-hidden={!regularFuShenText}
          >
            <CornerLeftUpIcon className="size-[1em] shrink-0" aria-hidden="true" />
            {regularFuShenText || "占位"}
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

function formatRegularFuShen(hiddenGod: LiuyaoLineInfo["regularFuShen"]) {
  return hiddenGod ? `${hiddenGod.relation}·${hiddenGod.stem}${hiddenGod.branch}` : "";
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
