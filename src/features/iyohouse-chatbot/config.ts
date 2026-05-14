export const chatbotConfig = {
  enabled: process.env.NEXT_PUBLIC_CHATBOT_ENABLED !== "false",
  settingsEnabled: process.env.NEXT_PUBLIC_CHATBOT_SETTINGS_ENABLED !== "false",
  apiKeyStorageKey: "iyohouse.geminiApiKey",
};
