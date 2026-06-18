import { useMemo, useState } from "react";
import { ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

interface DateTimeWheelPickerProps {
  date: Date;
  time: string;
  onChange: (value: { date: Date; time: string }) => void;
  id?: string;
  className?: string;
  minYear?: number;
  maxYear?: number;
}

const YEAR_OPTION_RADIUS = 120;
const MONTH_OPTIONS = buildNumberOptions(1, 12);
const HOUR_OPTIONS = buildNumberOptions(0, 23);
const MINUTE_OPTIONS = buildNumberOptions(0, 59);
const NUMBER_WHEEL_CLASS_NAMES = {
  optionItem: "font-mono tabular-nums",
  highlightItem: "font-mono tabular-nums",
};

function buildNumberOptions(start: number, end: number): WheelPickerOption[] {
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const numberValue = start + index;
    const value = String(numberValue);

    return {
      label: padTimeUnit(numberValue),
      textValue: value,
      value,
    };
  });
}

function buildYearOptions(
  centerYear: number,
  minYear?: number,
  maxYear?: number
): WheelPickerOption[] {
  const { start, end } = getYearOptionRange(centerYear, minYear, maxYear);

  return Array.from({ length: end - start + 1 }, (_, index) => {
    const value = String(start + index);

    return {
      label: value,
      textValue: value,
      value,
    };
  });
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

  let start = centerYear - YEAR_OPTION_RADIUS;
  let end = centerYear + YEAR_OPTION_RADIUS;

  if (minBound !== undefined) {
    start = Math.max(start, minBound);
  }

  if (maxBound !== undefined) {
    end = Math.min(end, maxBound);
  }

  start = Math.min(start, centerYear);
  end = Math.max(end, centerYear);

  if (start > end) {
    return { start: centerYear, end: centerYear };
  }

  return { start, end };
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

  return {
    year,
    month,
    day,
    hour: parsedTime.hour,
    minute: parsedTime.minute,
  };
}

function normalizeParts(parts: DateTimeParts): DateTimeParts {
  const year = Math.trunc(parts.year);
  const month = clamp(Math.trunc(parts.month), 1, 12);
  const maxDay = getDaysInMonth(year, month);

  return {
    year,
    month,
    day: clamp(Math.trunc(parts.day), 1, maxDay),
    hour: clamp(Math.trunc(parts.hour), 0, 23),
    minute: clamp(Math.trunc(parts.minute), 0, 59),
  };
}

function formatTime(parts: Pick<DateTimeParts, "hour" | "minute">) {
  return `${padTimeUnit(parts.hour)}:${padTimeUnit(parts.minute)}`;
}

function formatDateTimeLabel(parts: DateTimeParts) {
  return `${parts.year}年${padTimeUnit(parts.month)}月${padTimeUnit(parts.day)}日 ${formatTime(parts)}`;
}

function createDateFromParts(
  parts: Pick<DateTimeParts, "year" | "month" | "day">
) {
  const date = new Date(0);
  date.setFullYear(parts.year, parts.month - 1, parts.day);
  date.setHours(0, 0, 0, 0);

  return date;
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
  const selectedParts = useMemo(
    () => normalizeDateTimeParts(date, time),
    [date, time]
  );
  const yearOptions = useMemo(
    () => buildYearOptions(selectedParts.year, minYear, maxYear),
    [selectedParts.year, minYear, maxYear]
  );
  const dayOptions = useMemo(
    () =>
      buildNumberOptions(
        1,
        getDaysInMonth(selectedParts.year, selectedParts.month)
      ),
    [selectedParts.year, selectedParts.month]
  );
  const displayValue = formatDateTimeLabel(selectedParts);

  const updateParts = (nextParts: DateTimeParts) => {
    const normalizedParts = normalizeParts(nextParts);

    onChange({
      date: createDateFromParts(normalizedParts),
      time: formatTime(normalizedParts),
    });
  };

  const renderWheel = (
    options: WheelPickerOption[],
    value: number,
    onValueChange: (value: number) => void,
    infinite = true
  ) => (
    <WheelPicker
      options={options}
      value={String(value)}
      onValueChange={(nextValue) => onValueChange(Number(nextValue))}
      infinite={infinite}
      visibleCount={20}
      optionItemHeight={30}
      classNames={NUMBER_WHEEL_CLASS_NAMES}
    />
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-label={`选择日期时间，当前为 ${displayValue}`}
            className={cn("w-full justify-between font-normal", className)}
          >
            <span className="truncate">{displayValue}</span>
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-[var(--anchor-width)] gap-2 p-3">
        <div className="grid grid-cols-5 px-1 text-center text-xs font-medium text-muted-foreground">
          <span>年</span>
          <span>月</span>
          <span>日</span>
          <span>时</span>
          <span>分</span>
        </div>
        <WheelPickerWrapper className="w-full">
          {renderWheel(
            yearOptions,
            selectedParts.year,
            (year) => updateParts({ ...selectedParts, year }),
            false
          )}
          {renderWheel(MONTH_OPTIONS, selectedParts.month, (month) =>
            updateParts({ ...selectedParts, month })
          )}
          {renderWheel(dayOptions, selectedParts.day, (day) =>
            updateParts({ ...selectedParts, day })
          )}
          {renderWheel(HOUR_OPTIONS, selectedParts.hour, (hour) =>
            updateParts({ ...selectedParts, hour })
          )}
          {renderWheel(MINUTE_OPTIONS, selectedParts.minute, (minute) =>
            updateParts({ ...selectedParts, minute })
          )}
        </WheelPickerWrapper>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          完成
        </Button>
      </PopoverContent>
    </Popover>
  );
}
