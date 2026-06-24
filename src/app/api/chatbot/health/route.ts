import { chatbotJson } from "../_responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return chatbotJson({ ok: true });
}
