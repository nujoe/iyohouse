import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const schema = read("src/sanity/schemaTypes/workshop.ts");
const detail = read("src/components/workshop/WorkshopDetailOverlay.tsx");
const grid = read("src/components/WorkshopGrid.tsx");
const translations = read("src/lib/i18n/translations.ts");

const curriculumIndex = schema.indexOf("name: 'curriculum'");
const applicationGuideIndex = schema.indexOf("name: 'applicationGuide'");
const inquiryIndex = schema.indexOf("name: 'inquiry'");
const capacityIndex = schema.indexOf("name: 'capacity'");

assert.ok(curriculumIndex !== -1, "curriculum field should exist in Sanity schema");
assert.ok(applicationGuideIndex > curriculumIndex, "application guide should be below curriculum in Sanity schema");
assert.ok(inquiryIndex > applicationGuideIndex, "inquiry should follow application guide in Sanity schema");
assert.ok(capacityIndex > inquiryIndex, "capacity should stay below application guide and inquiry");
assert.ok(schema.includes("name: 'waitlistFormUrl'"), "Sanity schema should expose a waitlist Google Form URL field");
assert.ok(schema.includes("title: '대기자 신청 구글폼 링크'"), "waitlist field should be clearly labeled in Sanity");

assert.ok(
  detail.includes("WORKSHOP_PRIMARY_INFO_FIELDS"),
  "detail page should separate primary info fields from post-curriculum fields",
);
assert.ok(
  detail.includes("WORKSHOP_POST_CURRICULUM_INFO_FIELDS"),
  "detail page should render application guide and inquiry after curriculum",
);
assert.ok(
  detail.indexOf("{primaryInfoItems.length") < detail.indexOf("detail-tutor-section"),
  "primary info should render before tutor/curriculum content",
);
assert.ok(
  detail.indexOf("{postCurriculumInfoItems.length") > detail.indexOf("detail-curriculum-section"),
  "application guide and inquiry should render after curriculum",
);
assert.ok(
  detail.includes("waitlistFormUrl"),
  "detail page should read the waitlist form URL from workshop data",
);
assert.ok(
  detail.includes("shouldShowWaitlistButton"),
  "detail page should branch to a waitlist button when capacity is full",
);
assert.ok(
  detail.includes("t.workshop.waitlistApply"),
  "detail page should use localized waitlist button text",
);
assert.ok(
  detail.includes('target="_blank"') && detail.includes('rel="noopener noreferrer"'),
  "waitlist Google Form should open safely in a new tab",
);

assert.ok(
  translations.includes('waitlistApply: "대기자 신청"'),
  "Korean translations should include waitlist button text",
);
assert.ok(
  translations.includes('waitlistApply: "Join waitlist"'),
  "English translations should include waitlist button text",
);

assert.ok(
  grid.includes("hasWaitlistForm"),
  "workshop grid should know whether a waitlist form exists",
);
assert.ok(
  grid.includes("shouldShowClosedTag"),
  "workshop grid should separate closed tag display from capacity-full state",
);
assert.ok(
  grid.includes("capacityFull && !hasWaitlistForm"),
  "workshop grid should hide the closed tag when capacity is full and waitlist is available",
);

console.log("workshop waitlist static checks passed.");
