/** All persisted application times are integer Unix seconds (including pre-1970 births). */
export function unixNow() {
  return Math.floor(Date.now() / 1000);
}

export function fromUnixSeconds(value: number) {
  return new Date(value * 1000);
}

export interface RawDateTime {
  timestamp: number;
  /** Minutes east of UTC at the original input, independent of the viewing device. */
  utcOffsetMinutes: number;
}

export function toRawDateTime(date: Date, time: string): RawDateTime {
  if (
    !Number.isFinite(date.getTime()) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  ) {
    throw new Error("日期或时间不合法。");
  }
  const [hour, minute] = time.split(":").map(Number);
  const local = new Date(date);
  local.setHours(hour, minute, 0, 0);
  const utcOffsetMinutes = -local.getTimezoneOffset();
  // Encode the entered wall time explicitly, including DST gaps.
  const wall = new Date(0);
  wall.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  wall.setUTCHours(hour, minute, 0, 0);
  return {
    timestamp: wall.getTime() / 1000 - utcOffsetMinutes * 60,
    utcOffsetMinutes,
  };
}

export function restoreRawDateTime(raw: RawDateTime) {
  const wall = fromUnixSeconds(raw.timestamp + raw.utcOffsetMinutes * 60);
  // Calculators take a calendar date and a separate time, not the viewer's local instant.
  const date = new Date(0);
  date.setFullYear(
    wall.getUTCFullYear(),
    wall.getUTCMonth(),
    wall.getUTCDate(),
  );
  date.setHours(12, 0, 0, 0);
  const time = `${String(wall.getUTCHours()).padStart(2, "0")}:${String(wall.getUTCMinutes()).padStart(2, "0")}`;
  return { date, time };
}

export function migrateLegacyDateTime(dateText: string, time: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!match) throw new Error("旧记录日期不合法。");
  const date = new Date(0);
  date.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setHours(12, 0, 0, 0);
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) {
    throw new Error("旧记录日期不合法。");
  }
  return toRawDateTime(date, time);
}

export function migrateLegacyTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return Math.abs(value) >= 100_000_000_000
      ? Math.floor(value / 1000)
      : value;
  }
  if (typeof value !== "string") throw new Error("旧记录时间不合法。");
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error("旧记录时间不合法。");
  return Math.floor(milliseconds / 1000);
}
