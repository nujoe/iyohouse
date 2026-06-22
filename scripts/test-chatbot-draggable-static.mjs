import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const widgetSource = readFileSync(
  new URL("../src/features/iyohouse-chatbot/components/ChatbotWidget.tsx", import.meta.url),
  "utf8",
);
const cssSource = readFileSync(
  new URL("../src/features/iyohouse-chatbot/styles/chatbot.css", import.meta.url),
  "utf8",
);

function ruleFor(selector) {
  const escapedSelector = selector.replaceAll(".", "\\.");
  const match = cssSource.match(new RegExp(`${escapedSelector}\\s*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${selector} rule should exist`);
  return match[0];
}

for (const needle of [
  "type DragState",
  "dragStartRef",
  "hasDraggedRef",
  "clampChatbotPosition",
  "handleAvatarPointerDown",
  "handleWindowPointerMove",
  "handleWindowPointerUp",
  "setPointerCapture",
  "document.querySelector(\".left-panel\")",
  "--iyo-chatbot-x",
  "--iyo-chatbot-y",
  "onPointerDown={handleAvatarPointerDown}",
  "onClick={handleAvatarClick}",
]) {
  assert.ok(widgetSource.includes(needle), `Chatbot widget should include ${needle}`);
}

assert.ok(
  !widgetSource.includes("setInterval"),
  "Chatbot drag position should not be overridden by idle interval movement",
);

const chatbotRule = ruleFor(".iyo-chatbot");
assert.match(chatbotRule, /--iyo-chatbot-x:/, "base chatbot rule should expose an x position variable");
assert.match(chatbotRule, /left:[^;]*var\(--iyo-chatbot-x\)/, "chatbot should use x variable for left");
assert.match(chatbotRule, /top:[^;]*var\(--iyo-chatbot-y\)/, "chatbot should use y variable for top");
assert.doesNotMatch(chatbotRule, /\bbottom:/, "desktop chatbot should not be anchored by bottom");

const avatarRule = ruleFor(".iyo-chatbot-avatar");
assert.match(avatarRule, /cursor:\s*grab;/, "avatar should advertise drag affordance");
assert.match(avatarRule, /touch-action:\s*none;/, "avatar should support pointer dragging on touch devices");

const draggingRule = ruleFor(".iyo-chatbot.is-dragging");
assert.match(draggingRule, /transition:\s*none;/, "dragging should not animate behind the pointer");
assert.match(draggingRule, /cursor:\s*grabbing;/, "dragging state should use grabbing cursor");

const logoRule = ruleFor(".iyo-chatbot-logo-img");
assert.match(logoRule, /width:\s*104px;/, "chatbot logo should be slightly larger");

const mobileRule = cssSource.match(/@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.iyo-chatbot\s*\{[\s\S]*?\n\s*\}[\s\S]*?\n\}/);
assert.ok(mobileRule, "mobile chatbot media rule should exist");
assert.match(mobileRule[0], /top:\s*auto\s*!important;/, "mobile chatbot should keep bottom anchoring");
assert.match(mobileRule[0], /bottom:\s*16px\s*!important;/, "mobile chatbot should stay near the bottom edge");

console.log("chatbot draggable checks passed.");
