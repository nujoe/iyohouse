import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(path) {
  assert.ok(existsSync(new URL(path, import.meta.url)), `${path} should exist`);
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const studioPage = read("../src/app/studio/[[...index]]/page.tsx");
const studioClient = read("../src/components/admin/SanityStudioClient.tsx");
const sanityConfig = read("../src/sanity/config.ts");
const chatbotHealthRoute = read("../src/app/api/chatbot/health/route.ts");
const chatbotAskRoute = read("../src/app/api/chatbot/ask/route.ts");

assert.ok(!studioPage.includes("'use client'"), "studio route should be a server component");
assert.ok(studioPage.includes('import { requireAdminClient } from "@/lib/admin/workshopAdmin"'), "studio route should import the admin guard");
assert.ok(studioPage.includes("await requireAdminClient()"), "studio route should require a Supabase super-admin session");
assert.ok(studioPage.includes("<SanityStudioClient />"), "studio route should render the client Studio only after the admin guard");
assert.ok(studioClient.includes("'use client'"), "Sanity Studio renderer should remain client-side");
assert.ok(studioClient.includes("NextStudio"), "Sanity Studio client should render NextStudio");

assert.ok(
  /const\s+plugins[\s\S]*=\s*\[/.test(sanityConfig) &&
    sanityConfig.includes("if (process.env.NODE_ENV !== 'production')") &&
    sanityConfig.includes("plugins.push(visionTool({ defaultApiVersion: apiVersion }))"),
  "Sanity Vision should only be enabled outside production",
);

assert.ok(!chatbotHealthRoute.includes("getChatbotHealth"), "chatbot health route should not expose runtime config");
assert.ok(chatbotHealthRoute.includes("chatbotJson({ ok: true })"), "chatbot health route should only return a minimal ok response");

assert.ok(
  chatbotAskRoute.includes("process.env.CHATBOT_API_ENABLED !== \"true\"") &&
    chatbotAskRoute.includes("Chatbot API is disabled") &&
    chatbotAskRoute.includes("404"),
  "chatbot ask route should be disabled by default while the widget is hidden",
);

console.log("production security static checks passed.");
