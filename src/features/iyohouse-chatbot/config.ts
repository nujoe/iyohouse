export const chatbotConfig = {
  enabled: process.env.NEXT_PUBLIC_CHATBOT_ENABLED !== "false",
  apiKeyStorageKey: "iyohouse.geminiApiKey",
};
