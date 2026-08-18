import { useMemo, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import {
  EarthBranch,
  EightChar,
  HeavenStem,
  LunarDay,
  LunarYear,
  SolarDay,
  SolarTime,
  type LunarMonth,
  type SixtyCycleHour,
} from "tyme4ts";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  WheelPicker,
  WheelPickerWrapper,
  type WheelPickerOption,
} from "@/components/wheel-picker";
import { cn } from "@/lib/utils";

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

type CalendarDateParts = Pick<DateTimeParts, "year" | "month" | "day">;
type DateInputMode = "solar" | "lunar" | "ganzhi";

type GanzhiDraft = {
  yearStem: string;
  yearBranch: string;
  monthStem: string;
  monthBranch: string;
  dayStem: string;
  dayBranch: string;
  hourStem: string;
  hour: number;
  minute: number;
};

type GanzhiTextField = Exclude<keyof GanzhiDraft, "hour" | "minute">;

interface DateTimeWheelPickerProps {
  date: Date;
  time: string;
  onChange: (value: { date: Date; time: string }) => void;
  id?: string;
  className?: string;
  minYear?: number;
  maxYear?: number;
}

interface WheelColumnProps<Value extends string | number> {
  options: WheelPickerOption<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
  infinite?: boolean;
}

const YEAR_OPTION_RADIUS = 120;
const MONTH_OPTIONS = buildNumberOptions(1, 12);
const HOUR_OPTIONS = buildNumberOptions(0, 23);
const MINUTE_OPTIONS = buildNumberOptions(0, 59);
const HEAVEN_STEM_OPTIONS = HeavenStem.NAMES.map((name) => toOption(name));
const EARTH_BRANCH_OPTIONS = EarthBranch.NAMES.map((name) => toOption(name));
const BRANCH_HOUR_OPTIONS = buildNumberOptions(
  0,
  23,
  (hour) => `${getHourBranch(hour)}·${padTimeUnit(hour)}`
);
const DATE_INPUT_MODE_OPTIONS = [
  { label: "公历", value: "solar" },
  { label: "农历", value: "lunar" },
  { label: "干支", value: "ganzhi" },
] satisfies Array<{ label: string; value: DateInputMode }>;
const DATE_COLUMNS = [
  { field: "year", label: "年", infinite: false },
  { field: "month", label: "月" },
  { field: "day", label: "日" },
] satisfies Array<{
  field: keyof CalendarDateParts;
  label: string;
  infinite?: boolean;
}>;
const GANZHI_TEXT_COLUMNS = [
  { field: "yearStem", label: "年干", options: HEAVEN_STEM_OPTIONS },
  { field: "yearBranch", label: "年支", options: EARTH_BRANCH_OPTIONS },
  { field: "monthStem", label: "月干", options: HEAVEN_STEM_OPTIONS },
  { field: "monthBranch", label: "月支", options: EARTH_BRANCH_OPTIONS },
  { field: "dayStem", label: "日干", options: HEAVEN_STEM_OPTIONS },
  { field: "dayBranch", label: "日支", options: EARTH_BRANCH_OPTIONS },
  { field: "hourStem", label: "时干", options: HEAVEN_STEM_OPTIONS },
] satisfies Array<{
  field: GanzhiTextField;
  label: string;
  options: WheelPickerOption<string>[];
}>;
const DATE_TIME_LABELS = [...DATE_COLUMNS.map(({ label }) => label), "时", "分"];
const GANZHI_LABELS = [
  ...GANZHI_TEXT_COLUMNS.map(({ label }) => label),
  "时支",
  "分",
];
const WHEEL_CLASS_NAMES = {
  optionItem: "font-mono !text-xs tabular-nums",
  highlightItem: "font-mono !text-xs tabular-nums",
};

function toOption<Value extends string | number>(
  value: Value,
  label = String(value)
): WheelPickerOption<Value> {
  return { label, textValue: String(value), value };
}

function buildNumberOptions(
  start: number,
  end: number,
  getLabel = padTimeUnit
): WheelPickerOption<number>[] {
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const value = start + index;

    return toOption(value, getLabel(value));
  });
}

function buildYearOptions(
  centerYear: number,
  minYear?: number,
  maxYear?: number,
  getLabel: (year: number) => string = String
): WheelPickerOption<number>[] {
  const { start, end } = getYearOptionRange(centerYear, minYear, maxYear);

  return buildNumberOptions(start, end, getLabel);
}

function getYearOptionRange(
  centerYear: number,
  minYear?: number,
  maxYear?: number
) {
  let minBound = toFiniteInteger(minYear);
  let maxBound = toFiniteInteger(maxYear);

  if (minBound !== undefined && maxBound !== undefined && minBound > maxBound) {
    [minBound, maxBound] = [maxBound, minBound];
  }

  const start = Math.max(
    centerYear - YEAR_OPTION_RADIUS,
    minBound ?? -Infinity
  );
  const end = Math.min(
    centerYear + YEAR_OPTION_RADIUS,
    maxBound ?? Infinity
  );

  return {
    start: Math.min(start, centerYear),
    end: Math.max(end, centerYear),
  };
}

function toFiniteInteger(value: number | undefined) {
  return value === undefined || !Number.isFinite(value)
    ? undefined
    : Math.trunc(value);
}

function getDaysInMonth(year: number, month: number) {
  const date = new Date(0);
  date.setFullYear(year, month, 0);
  date.setHours(0, 0, 0, 0);

  return date.getDate();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function padTimeUnit(value: number) {
  return value.toString().padStart(2, "0");
}

function parseTimeValue(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);

  if (!match) {
    return { hour: 0, minute: 0 };
  }

  return {
    hour: clamp(Number(match[1]), 0, 23),
    minute: clamp(Number(match[2]), 0, 59),
  };
}

function normalizeDateTimeParts(date: Date, time: string): DateTimeParts {
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = safeDate.getFullYear();
  const month = safeDate.getMonth() + 1;
  const day = clamp(safeDate.getDate(), 1, getDaysInMonth(year, month));
  const parsedTime = parseTimeValue(time);

  return { year, month, day, ...parsedTime };
}

function normalizeParts(parts: DateTimeParts): DateTimeParts {
  const year = Math.trunc(parts.year);
  const month = clamp(Math.trunc(parts.month), 1, 12);

  return {
    year,
    month,
    day: clamp(Math.trunc(parts.day), 1, getDaysInMonth(year, month)),
    hour: clamp(Math.trunc(parts.hour), 0, 23),
    minute: clamp(Math.trunc(parts.minute), 0, 59),
  };
}

function formatTime(parts: Pick<DateTimeParts, "hour" | "minute">) {
  return `${padTimeUnit(parts.hour)}:${padTimeUnit(parts.minute)}`;
}

function createDateFromParts(parts: CalendarDateParts) {
  const date = new Date(0);
  date.setFullYear(parts.year, parts.month - 1, parts.day);
  date.setHours(0, 0, 0, 0);

  return date;
}

function createDateFromSolarDay(solarDay: SolarDay) {
  return createDateFromParts({
    year: solarDay.getYear(),
    month: solarDay.getMonth(),
    day: solarDay.getDay(),
  });
}

function toSolarDay(parts: CalendarDateParts) {
  return SolarDay.fromYmd(parts.year, parts.month, parts.day);
}

function toSolarTime(parts: DateTimeParts) {
  return SolarTime.fromYmdHms(
    parts.year,
    parts.month,
    parts.day,
    parts.hour,
    parts.minute,
    0
  );
}

function toLunarDateParts(lunarDay: LunarDay): CalendarDateParts {
  return {
    year: lunarDay.getYear(),
    month: lunarDay.getLunarMonth().getMonthWithLeap(),
    day: lunarDay.getDay(),
  };
}

function findLunarMonth(months: LunarMonth[], month: number) {
  return (
    months.find((candidate) => candidate.getMonthWithLeap() === month) ??
    months.find(
      (candidate) =>
        !candidate.isLeap() && candidate.getMonth() === Math.abs(month)
    ) ??
    months[0]!
  );
}

function getHourBranch(hour: number) {
  return EarthBranch.fromIndex(Math.floor((hour + 1) / 2) % 12).getName();
}

function createGanzhiDraft(
  sixtyCycleHour: SixtyCycleHour,
  time: Pick<DateTimeParts, "hour" | "minute">
): GanzhiDraft {
  return {
    yearStem: sixtyCycleHour.getYear().getHeavenStem().getName(),
    yearBranch: sixtyCycleHour.getYear().getEarthBranch().getName(),
    monthStem: sixtyCycleHour.getMonth().getHeavenStem().getName(),
    monthBranch: sixtyCycleHour.getMonth().getEarthBranch().getName(),
    dayStem: sixtyCycleHour.getDay().getHeavenStem().getName(),
    dayBranch: sixtyCycleHour.getDay().getEarthBranch().getName(),
    hourStem: sixtyCycleHour.getSixtyCycle().getHeavenStem().getName(),
    ...time,
  };
}

function createEightChar(draft: GanzhiDraft) {
  return new EightChar(
    `${draft.yearStem}${draft.yearBranch}`,
    `${draft.monthStem}${draft.monthBranch}`,
    `${draft.dayStem}${draft.dayBranch}`,
    `${draft.hourStem}${getHourBranch(draft.hour)}`
  );
}

function resolveGanzhiDraft(
  draft: GanzhiDraft,
  referenceParts: DateTimeParts,
  minYear?: number,
  maxYear?: number
) {
  const { start, end } = getYearOptionRange(
    referenceParts.year,
    minYear,
    maxYear
  );
  const eightChar = createEightChar(draft);

  // 子时和节气交界可能落在相邻公历日，按用户选择的具体钟点复核。
  const candidates = eightChar
    .getSolarTimes(start, end)
    .flatMap((match) =>
      [-1, 0, 1].map((offset) => {
        const day = match.getSolarDay().next(offset);

        return SolarTime.fromYmdHms(
          day.getYear(),
          day.getMonth(),
          day.getDay(),
          draft.hour,
          draft.minute,
          0
        );
      })
    )
    .filter((candidate) =>
      candidate.getLunarHour().getEightChar().equals(eightChar)
    );

  if (candidates.length === 0) {
    return null;
  }

  const referenceDay = toSolarDay(referenceParts);
  const closest = candidates.reduce((best, candidate) =>
    Math.abs(candidate.getSolarDay().subtract(referenceDay)) <
    Math.abs(best.getSolarDay().subtract(referenceDay))
      ? candidate
      : best
  );

  return {
    date: createDateFromSolarDay(closest.getSolarDay()),
    time: formatTime(draft),
  };
}

function formatDateTimeLabel(
  mode: DateInputMode,
  parts: DateTimeParts,
  lunarDay: LunarDay,
  sixtyCycleHour: SixtyCycleHour
) {
  if (mode === "lunar") {
    return `${lunarDay.toString()} ${formatTime(parts)}`;
  }

  if (mode === "ganzhi") {
    return [
      `${sixtyCycleHour.getYear().getName()}年`,
      `${sixtyCycleHour.getMonth().getName()}月`,
      `${sixtyCycleHour.getDay().getName()}日`,
      `${sixtyCycleHour.getSixtyCycle().getName()}时`,
      `· ${formatTime(parts)}`,
    ].join(" ");
  }

  return `${parts.year}年${padTimeUnit(parts.month)}月${padTimeUnit(parts.day)}日 ${formatTime(parts)}`;
}

function WheelColumn<Value extends string | number>({
  options,
  value,
  onValueChange,
  infinite = true,
}: WheelColumnProps<Value>) {
  return (
    <WheelPicker
      options={options}
      value={value}
      onValueChange={onValueChange}
      infinite={infinite}
      visibleCount={20}
      optionItemHeight={30}
      classNames={WHEEL_CLASS_NAMES}
    />
  );
}

export function DateTimeWheelPicker({
  date,
  time,
  onChange,
  id,
  className,
  minYear,
  maxYear,
}: DateTimeWheelPickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DateInputMode>("solar");
  const selectedParts = useMemo(
    () => normalizeDateTimeParts(date, time),
    [date, time]
  );
  const { lunarDay, sixtyCycleHour } = useMemo(() => {
    const solarTime = toSolarTime(selectedParts);

    return {
      lunarDay: solarTime.getSolarDay().getLunarDay(),
      sixtyCycleHour: solarTime.getSixtyCycleHour(),
    };
  }, [selectedParts]);
  const [ganzhiDraft, setGanzhiDraft] = useState(() =>
    createGanzhiDraft(sixtyCycleHour, selectedParts)
  );
  const [conversionError, setConversionError] = useState("");

  const lunarParts = toLunarDateParts(lunarDay);
  const lunarMonths = useMemo(
    () => LunarYear.fromYear(lunarParts.year).getMonths(),
    [lunarParts.year]
  );
  const lunarMonth = findLunarMonth(lunarMonths, lunarParts.month);
  const solarYearOptions = useMemo(
    () => buildYearOptions(selectedParts.year, minYear, maxYear),
    [selectedParts.year, minYear, maxYear]
  );
  const solarDayOptions = useMemo(
    () =>
      buildNumberOptions(
        1,
        getDaysInMonth(selectedParts.year, selectedParts.month)
      ),
    [selectedParts.year, selectedParts.month]
  );
  const lunarYearOptions = useMemo(
    () =>
      buildYearOptions(
        lunarParts.year,
        minYear,
        maxYear,
        (year) => `${LunarYear.fromYear(year).getSixtyCycle().getName()}·${year}`
      ),
    [lunarParts.year, minYear, maxYear]
  );
  const lunarMonthOptions = lunarMonths.map((month) =>
    toOption(month.getMonthWithLeap(), month.getName())
  );
  const lunarDayOptions = lunarMonth
    .getDays()
    .map((day) => toOption(day.getDay(), day.getName()));
  const displayValue = formatDateTimeLabel(
    mode,
    selectedParts,
    lunarDay,
    sixtyCycleHour
  );
  const calendarDate = mode === "lunar" ? lunarParts : selectedParts;
  const calendarOptions: Record<
    keyof CalendarDateParts,
    WheelPickerOption<number>[]
  > =
    mode === "lunar"
      ? {
          year: lunarYearOptions,
          month: lunarMonthOptions,
          day: lunarDayOptions,
        }
      : {
          year: solarYearOptions,
          month: MONTH_OPTIONS,
          day: solarDayOptions,
        };
  const wheelLabels = mode === "ganzhi" ? GANZHI_LABELS : DATE_TIME_LABELS;

  const updateParts = (nextParts: DateTimeParts) => {
    const normalizedParts = normalizeParts(nextParts);

    onChange({
      date: createDateFromParts(normalizedParts),
      time: formatTime(normalizedParts),
    });
  };

  const updateLunarDate = (nextParts: CalendarDateParts) => {
    const months = LunarYear.fromYear(nextParts.year).getMonths();
    const month = findLunarMonth(months, nextParts.month);
    const day = clamp(nextParts.day, 1, month.getDayCount());
    const solarDate = LunarDay.fromYmd(
      nextParts.year,
      month.getMonthWithLeap(),
      day
    ).getSolarDay();

    onChange({
      date: createDateFromSolarDay(solarDate),
      time: formatTime(selectedParts),
    });
  };

  const updateCalendarDate = (nextParts: CalendarDateParts) => {
    if (mode === "lunar") {
      updateLunarDate(nextParts);
    } else {
      updateParts({ ...selectedParts, ...nextParts });
    }
  };

  const updateGanzhiDraft = <Key extends keyof GanzhiDraft>(
    key: Key,
    value: GanzhiDraft[Key]
  ) => {
    setGanzhiDraft((current) => ({ ...current, [key]: value }));
    setConversionError("");
  };

  const resetGanzhiDraft = () => {
    setGanzhiDraft(createGanzhiDraft(sixtyCycleHour, selectedParts));
    setConversionError("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      resetGanzhiDraft();
    }

    setOpen(nextOpen);
  };

  const handleModeChange = (values: string[]) => {
    const nextMode = values[0] as DateInputMode | undefined;

    if (!nextMode) {
      return;
    }

    setMode(nextMode);
    if (nextMode === "ganzhi") {
      resetGanzhiDraft();
    } else {
      setConversionError("");
    }
  };

  const handleComplete = () => {
    if (mode !== "ganzhi") {
      setOpen(false);
      return;
    }

    try {
      const result = resolveGanzhiDraft(
        ganzhiDraft,
        selectedParts,
        minYear,
        maxYear
      );

      if (!result) {
        setConversionError("在当前年份范围内找不到与所选四柱对应的公历时间。");
        return;
      }

      onChange(result);
      setConversionError("");
      setOpen(false);
    } catch {
      setConversionError("所选天干地支无法组成有效四柱，请调整后重试。");
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-label={`选择日期时间，当前为 ${displayValue}`}
            className={cn("w-full justify-between font-normal", className)}
          />
        }
      >
        <span className="truncate">{displayValue}</span>
        <ChevronDownIcon data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(calc(var(--anchor-width)+3.75rem),calc(100vw-1rem))] gap-2 p-3"
      >
        <ToggleGroup
          value={[mode]}
          onValueChange={handleModeChange}
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="历法"
          className="w-full"
        >
          {DATE_INPUT_MODE_OPTIONS.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              aria-label={`切换到${option.label}`}
              className="flex-1"
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div
          className={cn(
            "grid px-1 text-center text-xs font-medium text-muted-foreground",
            mode === "ganzhi" ? "grid-cols-9" : "grid-cols-5"
          )}
        >
          {wheelLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>

        <WheelPickerWrapper className="w-full">
          {mode === "ganzhi" ? (
            <>
              {GANZHI_TEXT_COLUMNS.map(({ field, options }) => (
                <WheelColumn
                  key={field}
                  options={options}
                  value={ganzhiDraft[field]}
                  onValueChange={(value) => updateGanzhiDraft(field, value)}
                />
              ))}
              <WheelColumn
                options={BRANCH_HOUR_OPTIONS}
                value={ganzhiDraft.hour}
                onValueChange={(hour) => updateGanzhiDraft("hour", hour)}
              />
              <WheelColumn
                options={MINUTE_OPTIONS}
                value={ganzhiDraft.minute}
                onValueChange={(minute) => updateGanzhiDraft("minute", minute)}
              />
            </>
          ) : (
            <>
              {DATE_COLUMNS.map(({ field, infinite }) => (
                <WheelColumn
                  key={field}
                  options={calendarOptions[field]}
                  value={calendarDate[field]}
                  onValueChange={(value) =>
                    updateCalendarDate({ ...calendarDate, [field]: value })
                  }
                  infinite={infinite}
                />
              ))}
              <WheelColumn
                options={
                  mode === "lunar" ? BRANCH_HOUR_OPTIONS : HOUR_OPTIONS
                }
                value={selectedParts.hour}
                onValueChange={(hour) =>
                  updateParts({ ...selectedParts, hour })
                }
              />
              <WheelColumn
                options={MINUTE_OPTIONS}
                value={selectedParts.minute}
                onValueChange={(minute) =>
                  updateParts({ ...selectedParts, minute })
                }
              />
            </>
          )}
        </WheelPickerWrapper>

        {mode === "ganzhi" ? (
          <p
            role={conversionError ? "alert" : undefined}
            className={cn(
              "text-xs",
              conversionError ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {conversionError ||
              "四柱可能每六十年重复，完成时会按当前公历年份就近换算。"}
          </p>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleComplete}
        >
          完成
        </Button>
      </PopoverContent>
    </Popover>
  );
}
