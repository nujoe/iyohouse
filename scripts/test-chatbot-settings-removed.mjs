import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const widgetSource = readFileSync(
  new URL("../src/features/iyohouse-chatbot/components/ChatbotWidget.tsx", import.meta.url),
  "utf8",
);
const configSource = readFileSync(
  new URL("../src/features/iyohouse-chatbot/config.ts", import.meta.url),
  "utf8",
);

for (const needle of [
  "isSettingsOpen",
  "setIsSettingsOpen",
  "settingsEnabled",
  "iyo-chatbot-settings-toggle",
  "iyo-chatbot-settings",
  "test settings",
  "Gemini API key",
  "apiKey",
  "geminiApiKey",
]) {
  assert.ok(!widgetSource.includes(needle), `Chatbot widget must not contain ${needle}`);
}

assert.ok(
  !configSource.includes("NEXT_PUBLIC_CHATBOT_SETTINGS_ENABLED"),
  "Chatbot config must not expose the removed settings toggle",
);

console.log("chatbot settings removal checks passed.");
