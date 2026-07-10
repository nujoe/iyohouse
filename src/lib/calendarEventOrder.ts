type CalendarEventWithTime = {
  time?: unknown;
};

export function getCalendarEventStartMinutes(time: unknown) {
  if (typeof time !== "string") return Number.POSITIVE_INFINITY;

  const match = time
    .trim()
    .toLowerCase()
    .match(/(오전|오후)?\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|a|p|시)?/i);
  if (!match) return Number.POSITIVE_INFINITY;

  let hours = Number(match[2]);
  const minutes = Number(match[3] || 0);
  const meridiem = (match[1] || match[4] || "").replace(/\./g, "");

  if (hours > 23 || minutes > 59) return Number.POSITIVE_INFINITY;

  if (meridiem === "오후" || meridiem === "p" || meridiem === "pm") {
    if (hours < 12) hours += 12;
  } else if ((meridiem === "오전" || meridiem === "a" || meridiem === "am") && hours === 12) {
    hours = 0;
  }

  return hours * 60 + minutes;
}

export function sortCalendarEventsByStartTime<T extends CalendarEventWithTime>(events: T[]) {
  return [...events].sort(
    (first, second) => getCalendarEventStartMinutes(first.time) - getCalendarEventStartMinutes(second.time),
  );
}
