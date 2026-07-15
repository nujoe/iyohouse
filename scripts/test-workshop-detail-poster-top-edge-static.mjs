import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const styles = await readFile(
  new URL("../src/styles/08-info-workshop-detail.css", import.meta.url),
  "utf8",
);
const workshopCell = await readFile(
  new URL("../src/components/home/HomeWorkshopCell.tsx", import.meta.url),
  "utf8",
);

const detailContainer = styles.match(/\.workshop-detail-container\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

assert.match(detailContainer, /padding:\s*0 8px 8px/);
assert.match(workshopCell, /workshop-wrapper\$\{selectedWorkshop \? " has-detail" : ""\}/);
assert.match(styles, /\.workshop-wrapper\.has-detail\s*\{[\s\S]*margin-top:\s*calc\(-1 \* var\(--line-gap\)\)/);

console.log("workshop detail poster reaches the top edge");
