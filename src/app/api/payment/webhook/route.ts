import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/admin";
import {
  safeNicepayPayload,
  verifyNicepayResultSignature,
} from "@/lib/payment/nicepay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentRegistration = {
  id: string;
  order_id: string;
  amount: number;
  status: "pending" | "confirmed" | "cancelled" | "expired";
};

function scalarPayload(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : "",
    ]),
  );
}

async function cancelPendingRegistration(registrationId: string) {
  const supabase = getSupabaseServerClient();

  await supabase
    .from("workshop_registrations_v2")
    .update({ status: "cancelled" })
    .eq("id", registrationId)
    .eq("status", "pending");
}

async function cancelActiveRegistration(registrationId: string) {
  const supabase = getSupabaseServerClient();

  await supabase
    .from("workshop_registrations_v2")
    .update({ status: "cancelled" })
    .eq("id", registrationId)
    .in("status", ["pending", "confirmed"]);
}

function nicepayOkResponse() {
  return new NextResponse("OK", {
    status: 200,
    headers: {
      "Content-Type": "text/html;charset=utf-8",
    },
  });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const fields = scalarPayload(payload);
    const orderId = fields.orderId || "";
    const tid = fields.tid || "";
    const amount = Number(fields.amount || 0);
    const status = fields.status || "";
    const resultCode = fields.resultCode || "";
    const failedProviderStatus = "payment_failed";

    if (!orderId || !tid || !amount || !fields.ediDate || !fields.signature) {
      return NextResponse.json(
        { success: false, error: "NICEPAY 웹훅 필드가 부족합니다." },
        { status: 400 },
      );
    }

    if (!verifyNicepayResultSignature(fields)) {
      return NextResponse.json(
        { success: false, error: "NICEPAY 웹훅 서명이 일치하지 않습니다." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseServerClient();
    const { data: registration, error: registrationError } = await supabase
      .from("workshop_registrations_v2")
      .select("id, order_id, amount, status")
      .eq("order_id", orderId)
      .single<PaymentRegistration>();

    if (registrationError || !registration) {
      return NextResponse.json(
        { success: false, error: "신청 내역을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (Number(registration.amount) !== amount) {
      return NextResponse.json(
        { success: false, error: "NICEPAY 웹훅 금액이 신청 금액과 일치하지 않습니다." },
        { status: 400 },
      );
    }

    if (resultCode === "0000" && status === "paid") {
      const { error: rpcError } = await supabase.rpc("confirm_payment_registration", {
        p_registration_id: registration.id,
        p_payment_key: tid,
        p_order_id: registration.order_id,
        p_amount: Number(registration.amount),
      });

      if (rpcError) {
        return NextResponse.json(
          { success: false, error: rpcError.message },
          { status: 500 },
        );
      }

      return nicepayOkResponse();
    }

    if (status === "cancelled") {
      await cancelActiveRegistration(registration.id);

      return nicepayOkResponse();
    }

    if (["expired", "failed"].includes(status) || resultCode !== "0000") {
      await cancelPendingRegistration(registration.id);

      return nicepayOkResponse();
    }

    if (status === "partialCancelled") {
      console.warn("NICEPAY partial cancel webhook received:", {
        registrationId: registration.id,
        providerStatus: status,
        payload: safeNicepayPayload(payload),
      });

      return nicepayOkResponse();
    }

    console.warn("NICEPAY webhook ignored:", {
      registrationId: registration.id,
      providerStatus: status || failedProviderStatus || "webhook_received",
      payload: safeNicepayPayload(payload),
    });

    return nicepayOkResponse();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("NICEPAY webhook API error:", error);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
