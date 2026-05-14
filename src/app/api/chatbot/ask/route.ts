import { chatbotBridgeError, forwardChatbotRequest } from "../_bridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.text();

    return await forwardChatbotRequest("/api/ask", {
      method: "POST",
      body,
    });
  } catch (error) {
    return chatbotBridgeError(error);
  }
}
