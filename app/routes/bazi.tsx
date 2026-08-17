import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { format } from "date-fns";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/bazi";

import { BaziPaipanTable } from "@/components/bazi-paipan-table";
import { DateTimeWheelPicker } from "@/components/date-time-wheel-picker";
import { DivinationAIChatPanel } from "@/components/divination-ai-chat";
import { DivinationPageFrame } from "@/components/divination-page-frame";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  appendAIChatEventToMessage,
  buildAIChatRequestMessages,
  getNextAIChatMessageId,
  markStreamingAIChatMessagesStopped,
  readAIErrorMessage,
} from "@/features/ai/chat";
import { readAIStreamEvents } from "@/features/ai/timeline";
import { formatBaziAISystemPrompt } from "@/features/bazi/ai-format";
import {
  activateBaziAIHistorySession,
  createBaziAISessionId,
  createBaziHistoryRecord,
  createEmptyBaziAIHistoryState,
  getBaziAIHistorySession,
  getBaziHistoryRecord,
  restoreBaziHistoryRecord,
  updateBaziHistoryRecordAI,
  upsertBaziAIHistorySession,
  type BaziAIHistoryState,
  type BaziAIMessage,
  type BaziHistoryRecord,
} from "@/features/bazi/history";
import type { BaziGender, BaziPaipan } from "@/features/bazi/paipan";
import { runDivinationViewTransition } from "@/lib/divination-view-transition";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "云占·八字" },
    { name: "description", content: "八字占卜" },
  ];
}

const BAZI_GENDER_OPTIONS = [
  { label: "男", value: "male" },
  { label: "女", value: "female" },
] satisfies Array<{ label: string; value: BaziGender }>;
const BAZI_AI_ENDPOINT = "/api/bazi/ai";
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function Bazi() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const historyId = searchParams.get("history");
  const fromHistory = location.state?.returnTo === "/history";
  const [name, setName] = useState("");
  const [gender, setGender] = useState<BaziGender | "">("");
  const [date, setDate] = useState<Date>(() => new Date(2000, 0, 1, 12));
  const [time, setTime] = useState("12:00");
  const [genderError, setGenderError] = useState("");
  const [calculationError, setCalculationError] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);
  const [paipan, setPaipan] = useState<BaziPaipan | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [aiHistory, setAiHistory] = useState<BaziAIHistoryState>(() =>
    createEmptyBaziAIHistoryState()
  );
  const mountedRef = useRef(false);
  const aiHistoryRef = useRef(aiHistory);

  useIsomorphicLayoutEffect(() => {
    if (historyId) {
      return;
    }

    const now = new Date();
    setDate(now);
    setTime(format(now, "HH:mm"));
  }, []);

  useEffect(() => {
    aiHistoryRef.current = aiHistory;
  }, [aiHistory]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resetFormState = () => {
    const now = new Date();

    setName("");
    setGender("");
    setDate(now);
    setTime(format(now, "HH:mm"));
    setGenderError("");
    setCalculationError("");
  };

  const handleBackToForm = () => {
    runDivinationViewTransition(() => {
      resetFormState();
      setPaipan(null);
      setActiveHistoryId(null);
      setAiHistory(createEmptyBaziAIHistoryState());
      setAiPanelOpen(false);
      navigate("/bazi", { replace: true });
    });
  };

  const handleRestoreHistoryRecord = (record: BaziHistoryRecord) => {
    try {
      const restored = restoreBaziHistoryRecord(record);

      setName(restored.name);
      setGender(restored.gender);
      setDate(restored.date);
      setTime(restored.time);
      setPaipan(restored.result);
      setActiveHistoryId(record.id);
      setAiHistory(restored.ai);
      setAiPanelOpen(false);
      setGenderError("");
      setCalculationError("");
    } catch (error) {
      resetFormState();
      setPaipan(null);
      setActiveHistoryId(null);
      setAiHistory(createEmptyBaziAIHistoryState());
      setAiPanelOpen(false);
      setCalculationError(
        error instanceof Error ? error.message : "历史记录恢复失败。"
      );
    }
  };

  useIsomorphicLayoutEffect(() => {
    if (!historyId) {
      if (activeHistoryId) {
        resetFormState();
        setPaipan(null);
        setActiveHistoryId(null);
        setAiHistory(createEmptyBaziAIHistoryState());
        setAiPanelOpen(false);
      }
      return;
    }

    if (historyId === activeHistoryId) {
      return;
    }

    const record = getBaziHistoryRecord(historyId);
    if (!record) {
      resetFormState();
      setPaipan(null);
      setActiveHistoryId(null);
      setAiHistory(createEmptyBaziAIHistoryState());
      setAiPanelOpen(false);
      setCalculationError("历史记录不存在或已删除。");
      return;
    }

    handleRestoreHistoryRecord(record);
  }, [historyId]);

  const handleSetNow = () => {
    const now = new Date();
    setDate(now);
    setTime(format(now, "HH:mm"));
    setCalculationError("");
  };

  const handleGenderChange = (values: string[]) => {
    const nextGender = values[values.length - 1] as BaziGender | undefined;

    if (!nextGender) {
      return;
    }

    setGender(nextGender);
    setGenderError("");
    setCalculationError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!gender) {
      setGenderError("请选择性别。");
      setPaipan(null);
      return;
    }

    setGenderError("");

    try {
      setIsCalculating(true);
      const { buildBaziPaipan } = await import("@/features/bazi/paipan");

      if (!mountedRef.current) {
        return;
      }

      const nextPaipan = buildBaziPaipan({ name, gender, date, time });
      const nextAiHistory = createEmptyBaziAIHistoryState();
      const nextHistoryRecord = createBaziHistoryRecord({
        name,
        gender,
        date,
        time,
        result: nextPaipan,
        ai: nextAiHistory,
      });

      runDivinationViewTransition(() => {
        setPaipan(nextPaipan);
        setActiveHistoryId(nextHistoryRecord?.id ?? null);
        setAiHistory(nextAiHistory);
        setAiPanelOpen(false);
        setCalculationError("");

        if (nextHistoryRecord) {
          navigate(`/bazi?history=${encodeURIComponent(nextHistoryRecord.id)}`, {
            replace: true,
          });
        }
      });
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      console.error(error);
      setPaipan(null);
      setAiPanelOpen(false);
      setCalculationError("排盘失败，请检查出生时间后重试。");
    } finally {
      if (mountedRef.current) {
        setIsCalculating(false);
      }
    }
  };

  const handleAIHistoryChange = (
    updater: (current: BaziAIHistoryState) => BaziAIHistoryState,
    options?: { touch?: boolean }
  ) => {
    const next = updater(aiHistoryRef.current);
    aiHistoryRef.current = next;
    setAiHistory(next);

    if (activeHistoryId) {
      updateBaziHistoryRecordAI(activeHistoryId, next, options);
    }
  };

  return (
    <DivinationPageFrame
      homeHref={fromHistory ? "/history" : "/"}
      homeLabel={fromHistory ? "返回历史" : "返回主页"}
      form={{
        title: "八字排盘",
        description: "填写命主信息与出生时间",
        content: (
          <form
            onSubmit={handleSubmit}
            className="mobile-divination-form mx-auto flex w-full max-w-md flex-col gap-5 text-card-foreground lg:gap-6"
          >
            <Field>
              <FieldLabel htmlFor="bazi-name">命主姓名（可选）</FieldLabel>
              <Input
                id="bazi-name"
                name="name"
                type="text"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setCalculationError("");
                }}
                placeholder="请输入命主姓名"
                autoComplete="name"
              />
            </Field>

            <Field data-invalid={Boolean(genderError)}>
              <FieldLabel id="bazi-gender-label">性别</FieldLabel>
              <ToggleGroup
                aria-labelledby="bazi-gender-label"
                aria-invalid={Boolean(genderError) || undefined}
                value={gender ? [gender] : []}
                onValueChange={handleGenderChange}
                variant="outline"
                spacing={0}
                className="w-full"
              >
                {BAZI_GENDER_OPTIONS.map((option) => (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    className="flex-1"
                  >
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <input type="hidden" name="gender" value={gender} />
              {genderError ? <FieldError>{genderError}</FieldError> : null}
            </Field>

            <FieldGroup className="flex-row items-end gap-2">
              <Field className="min-w-0 flex-1">
                <FieldLabel htmlFor="bazi-date-time-picker">出生时间</FieldLabel>
                <DateTimeWheelPicker
                  id="bazi-date-time-picker"
                  date={date}
                  time={time}
                  onChange={(nextValue) => {
                    setDate(nextValue.date);
                    setTime(nextValue.time);
                    setCalculationError("");
                  }}
                />
                <input type="hidden" name="birthDate" value={format(date, "yyyy-MM-dd")} />
                <input type="hidden" name="birthTime" value={time} />
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

            <div className="flex justify-center pt-1">
              <Button type="submit" size="lg" disabled={isCalculating} className="w-full max-w-xs">
                {isCalculating ? "排盘中..." : "开始排盘"}
              </Button>
            </div>

            {calculationError ? (
              <p role="alert" className="text-center text-sm text-destructive">
                {calculationError}
              </p>
            ) : null}
          </form>
        ),
      }}
      result={
        paipan
          ? {
              ariaLabel: "八字排盘结果",
              content: <BaziPaipanTable paipan={paipan} />,
              contentClassName: "lg:mx-auto lg:max-w-6xl",
              restartLabel: "返回填写",
              onRestart: handleBackToForm,
              ai: {
                open: aiPanelOpen,
                onToggle: () => setAiPanelOpen((open) => !open),
                panel: (
                  <BaziAIPanel
                    open={aiPanelOpen}
                    paipan={paipan}
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

function BaziAIPanel({
  open,
  paipan,
  historyRecordId,
  aiHistory,
  onClose,
  onAIHistoryChange,
}: {
  open: boolean;
  paipan: BaziPaipan;
  historyRecordId: string | null;
  aiHistory: BaziAIHistoryState;
  onClose: () => void;
  onAIHistoryChange: (
    updater: (current: BaziAIHistoryState) => BaziAIHistoryState,
    options?: { touch?: boolean }
  ) => void;
}) {
  const activeSession = getBaziAIHistorySession(
    aiHistory,
    aiHistory.activeSessionId
  );
  const [message, setMessage] = useState("");
  const [messages, setMessagesState] = useState<BaziAIMessage[]>(
    () => activeSession?.messages ?? []
  );
  const [sessionId, setSessionIdState] = useState(aiHistory.activeSessionId);
  const [isSending, setIsSending] = useState(false);
  const messagesRef = useRef(messages);
  const sessionIdRef = useRef(sessionId);
  const nextMessageIdRef = useRef(getNextAIChatMessageId(messages));
  const activeRequestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const setMessages = (
    updater: BaziAIMessage[] | ((current: BaziAIMessage[]) => BaziAIMessage[])
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
    nextMessages: BaziAIMessage[],
    options?: { touch?: boolean }
  ) => {
    if (nextMessages.length === 0) {
      return;
    }

    onAIHistoryChange(
      (current) =>
        upsertBaziAIHistorySession(current, {
          sessionId: sessionIdRef.current,
          messages: nextMessages,
        }),
      options
    );
  };

  useEffect(() => {
    const nextSessionId = aiHistory.activeSessionId || createBaziAISessionId();
    const nextSession = getBaziAIHistorySession(aiHistory, nextSessionId);
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
      const response = await fetch(BAZI_AI_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemPrompt: formatBaziAISystemPrompt(paipan),
          chart: paipan,
          sessionId,
          messages: requestMessages,
        }),
        signal: abortController.signal,
      });

      if (!isActiveRequest()) {
        return;
      }

      if (!response.ok || !response.body) {
        throw new Error(await readAIErrorMessage(response, "AI 解盘失败，请稍后再试。"));
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
                content: err instanceof Error ? err.message : "AI 解盘失败，请稍后再试。",
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
    const stoppedMessages = markStreamingAIChatMessagesStopped(
      messagesRef.current
    );
    if (stoppedMessages !== messagesRef.current) {
      persistSession(stoppedMessages);
    }

    const nextSessionId = createBaziAISessionId();
    activeRequestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessage("");
    setMessages([]);
    setIsSending(false);
    setSessionId(nextSessionId);
    nextMessageIdRef.current = 1;
    onAIHistoryChange(
      (current) => activateBaziAIHistorySession(current, nextSessionId),
      { touch: false }
    );
  };

  const handleRestoreSession = (restoredSessionId: string) => {
    const session = getBaziAIHistorySession(aiHistory, restoredSessionId);
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
      (current) => activateBaziAIHistorySession(current, session.sessionId),
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
      desktopTitle="AI 解盘"
      mobileTitle={formatBaziAITitle(paipan)}
      pendingLabel="正在解盘..."
      inputValue={message}
      messages={messages}
      isSending={isSending}
      history={{
        sessions: aiHistory.sessions,
        activeSessionId: sessionId,
        description: "恢复此八字中过去的询问会话。",
        emptyDescription: "此八字还没有保存过询问会话。",
        onRestoreSession: handleRestoreSession,
      }}
      onInputChange={setMessage}
      onNewSession={handleNewSession}
      onStop={handleStop}
      onSubmit={handleSubmit}
    />
  );
}

function formatBaziAITitle(paipan: BaziPaipan) {
  return `${paipan.name || "未署名"} · ${paipan.tymeEightChar}`;
}
