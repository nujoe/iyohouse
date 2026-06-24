import { askChatbot, ChatbotServiceError } from "@/features/iyohouse-chatbot/server/chatbot-service";
import { chatbotJson, chatbotRouteError } from "../_responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (process.env.CHATBOT_API_ENABLED !== "true") {
      throw new ChatbotServiceError("Chatbot API is disabled", 404);
    }

    const body = await request.json();
    const result = await askChatbot(body);
    return chatbotJson(result);
  } catch (error) {
    return chatbotRouteError(error);
  }
}
