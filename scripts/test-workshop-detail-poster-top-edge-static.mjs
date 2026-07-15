import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const styles = await readFile(
  new URL("../src/styles/08-info-workshop-detail.css", import.meta.url),
  "utf8",
);

const detailContainer = styles.match(/\.workshop-detail-container\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

assert.match(detailContainer, /padding:\s*0 8px 8px/);

console.log("workshop detail poster reaches the top edge");
