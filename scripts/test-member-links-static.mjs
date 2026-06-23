import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/lib/i18n/memberTranslations.ts", import.meta.url),
  "utf8",
);

function memberBlock(name) {
  const match = source.match(new RegExp(`name:\\s*"${name}"[\\s\\S]*?\\n\\s*\\},`));
  assert.ok(match, `${name} member block should exist`);
  return match[0];
}

for (const name of ["현 ", "Hyun"]) {
  const block = memberBlock(name);
  assert.ok(!block.includes('label: "WEBSITE"'), `${name} should not show a website link`);
  assert.ok(!block.includes('url: "#"'), `${name} should not include placeholder links`);
}

for (const name of ["연서", "Yeonseo"]) {
  const block = memberBlock(name);
  assert.ok(
    block.includes('label: "INSTAGRAM"'),
    `${name} should show an Instagram link`,
  );
  assert.ok(
    block.includes('url: "https://www.instagram.com/kahonhill/"'),
    `${name} should link to kahonhill Instagram`,
  );
  assert.ok(!block.includes('url: "#"'), `${name} should not include placeholder links`);
  assert.ok(!block.includes('LINK 2'), `${name} should not include the second placeholder link`);
  assert.ok(!block.includes('링크 2'), `${name} should not include the second placeholder link`);
}

for (const name of ["가현", "Gahyun"]) {
  const block = memberBlock(name);
  assert.ok(
    block.includes('url: "https://www.instagram.com/glwormun/"'),
    `${name} should link to glwormun Instagram`,
  );
  assert.ok(
    !block.includes('url: "https://www.instagram.com/sulturemedia/"'),
    `${name} should not link to the old Instagram`,
  );
}

console.log("member link checks passed.");
