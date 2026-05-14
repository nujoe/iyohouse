import { chatbotBridgeError, forwardChatbotRequest } from "../_bridge";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return await forwardChatbotRequest("/api/pages");
  } catch (error) {
    return chatbotBridgeError(error);
  }
}
