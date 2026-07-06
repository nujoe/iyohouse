import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const path = join(root, relativePath);

  if (!existsSync(path)) {
    failures.push(`${relativePath} is missing.`);
    return "";
  }

  return readFileSync(path, "utf8");
}

function requireIncludes(relativePath, needles) {
  const content = read(relativePath);

  for (const needle of needles) {
    if (!content.includes(needle)) {
      failures.push(`${relativePath} is missing "${needle}".`);
    }
  }

  return content;
}

function requireMatches(relativePath, checks) {
  const content = read(relativePath);

  for (const [pattern, message] of checks) {
    if (!pattern.test(content)) {
      failures.push(`${relativePath}: ${message}`);
    }
  }

  return content;
}

const migrationPath = "supabase/migrations/20260706000000_add_student_discount_registration_snapshots.sql";

requireIncludes("src/sanity/schemaTypes/workshop.ts", [
  "name: 'studentPrice'",
  "title: '학부생 할인가 (원)'",
  "name: 'studentDiscountNotice'",
  "title: '학부생 할인 안내'",
]);

requireIncludes("src/sanity/workshops.ts", [
  "studentPrice",
  "studentDiscountNotice",
]);

requireIncludes("src/app/api/workshops/data/route.ts", [
  "studentPrice",
  "studentDiscountNotice",
]);

requireIncludes("src/components/workshop/WorkshopDetailOverlay.tsx", [
  "isStudentDiscountSelected",
  "setIsStudentDiscountSelected",
  "student-discount-option",
  "p_price_type",
  "student",
  "displayPrice",
]);

requireMatches("src/components/workshop/WorkshopDetailOverlay.tsx", [
  [/t\.workshop\.priceLabel\(displayPrice\)/, "detail price tag should render the selected effective price."],
  [/p_price_type:\s*isStudentDiscountSelected\s*\?\s*["']student["']\s*:\s*["']regular["']/, "registration RPC must send regular/student price type."],
]);

requireIncludes(migrationPath, [
  "ADD COLUMN IF NOT EXISTS original_amount INTEGER",
  "ADD COLUMN IF NOT EXISTS discount_amount INTEGER",
  "ADD COLUMN IF NOT EXISTS price_type TEXT",
  "ADD COLUMN IF NOT EXISTS discount_label TEXT",
  "ADD COLUMN IF NOT EXISTS snapshot_workshop_title TEXT",
  "ADD COLUMN IF NOT EXISTS student_price INTEGER",
  "CREATE OR REPLACE FUNCTION public.create_pending_registration",
  "p_price_type TEXT DEFAULT 'regular'",
  "v_price_type",
  "v_original_amount",
  "v_discount_amount",
  "v_effective_amount",
  "v_student_price",
  "student",
  "학부생 할인",
]);

requireMatches(migrationPath, [
  [/amount\s*=\s*v_effective_amount/, "existing pending registration must update amount to the effective selected price."],
  [/original_amount\s*=\s*v_original_amount/, "registration snapshot must store the original workshop price."],
  [/discount_amount\s*=\s*v_discount_amount/, "registration snapshot must store the selected discount amount."],
  [/price_type\s*=\s*v_price_type/, "registration snapshot must store the selected price type."],
  [/snapshot_workshop_title\s*=\s*v_workshop_title/, "registration snapshot must store the workshop title."],
]);

requireIncludes("src/app/api/admin/sync-workshops/route.ts", [
  "studentPrice",
  "student_price",
]);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("workshop student discount static checks passed.");
