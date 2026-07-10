import assert from "node:assert/strict";
import test from "node:test";

import { sortCalendarEventsByStartTime } from "../src/lib/calendarEventOrder.ts";

test("sorts calendar events by their displayed start time", () => {
  const events = [
    { title: "Late", time: "19~22시" },
    { title: "Early", time: "15~18시" },
    { title: "Morning", time: "10:00 - 12:00" },
    { title: "Afternoon", time: "1p - 5p" },
  ];

  assert.deepEqual(
    sortCalendarEventsByStartTime(events).map((event) => event.title),
    ["Morning", "Afternoon", "Early", "Late"],
  );
});

test("keeps entries with no readable start time after timed events", () => {
  const events = [
    { title: "Time pending", time: "추후 공지" },
    { title: "Timed", time: "15~18시" },
  ];

  assert.deepEqual(
    sortCalendarEventsByStartTime(events).map((event) => event.title),
    ["Timed", "Time pending"],
  );
});
