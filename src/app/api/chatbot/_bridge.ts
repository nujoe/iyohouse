import { NextResponse } from "next/server";

const DEFAULT_SIDECAR_URL = "http://127.0.0.1:5173";

export function getChatbotSidecarUrl() {
  return (process.env.CHATBOT_SIDECAR_URL || DEFAULT_SIDECAR_URL).replace(/\/+$/, "");
}

export async function forwardChatbotRequest(path: string, init?: RequestInit) {
  const sidecarUrl = getChatbotSidecarUrl();
  const headers = new Headers(init?.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${sidecarUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";

  return new NextResponse(text, {
    status: response.status,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
}

export function chatbotBridgeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown chatbot bridge error";

  return NextResponse.json(
    {
      error: "Chatbot sidecar is unavailable",
      detail: message,
    },
    { status: 502 }
  );
}
