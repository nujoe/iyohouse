import { NextResponse } from "next/server";
import { Resend } from "resend";

import { getSupabaseServerClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("Resend webhook is not configured: RESEND_WEBHOOK_SECRET is missing");
    return NextResponse.json({ ok: false, error: "Webhook is not configured." }, { status: 500 });
  }

  const payload = await request.text();
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");

  if (!id || !timestamp || !signature) {
    return NextResponse.json({ ok: false, error: "Missing webhook signature headers." }, { status: 400 });
  }

  let event: unknown;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY || "re_webhook_verifier");
    event = resend.webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret,
    });
  } catch (error) {
    console.warn("Resend webhook signature verification failed", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json({ ok: false, error: "Invalid webhook signature." }, { status: 400 });
  }

  if (!isRecord(event)) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const eventType = readString(event.type);
  const status = eventType === "email.delivered"
    ? "delivered"
    : eventType === "email.bounced"
      ? "bounced"
      : eventType === "email.failed"
        ? "failed"
        : null;

  if (!status) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const data = isRecord(event.data) ? event.data : {};
  const providerMessageId = readString(data.email_id);

  if (!providerMessageId) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  try {
    const adminClient = getSupabaseServerClient();
    const { error } = await adminClient
      .from("workshop_email_delivery_logs")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("provider_message_id", providerMessageId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("Resend webhook delivery status update failed", {
      eventType,
      providerMessageId,
      error,
    });
    return NextResponse.json({ ok: false, error: "Webhook processing failed." }, { status: 500 });
  }
}
