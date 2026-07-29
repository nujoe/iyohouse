import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/admin";
import {
  canAcknowledgeNicepayCardCancellation,
  getNicepayPaymentMethod,
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

type PaymentLedger = {
  registration_id: string;
  amount: number;
  payment_method: string | null;
  status: string;
  provider_status: string | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function cancelActiveRegistration(registrationId: string) {
  const supabase = getSupabaseServerClient();

  const { data: updatedRegistration, error: updateError } = await supabase
    .from("workshop_registrations_v2")
    .update({ status: "cancelled" })
    .eq("id", registrationId)
    .in("status", ["pending", "confirmed"])
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updateError) {
    return { ok: false as const };
  }

  if (canAcknowledgeNicepayCardCancellation({
    updateSucceeded: Boolean(updatedRegistration),
    currentStatus: null,
  })) {
    return { ok: true as const };
  }

  const { data: currentRegistration, error: currentError } = await supabase
    .from("workshop_registrations_v2")
    .select("status")
    .eq("id", registrationId)
    .maybeSingle<{ status: string }>();

  return {
    ok: !currentError && canAcknowledgeNicepayCardCancellation({
      updateSucceeded: false,
      currentStatus: currentRegistration?.status || null,
    }),
  };
}

function logIgnoredWebhook(
  registrationId: string,
  providerStatus: string,
  payload: Record<string, unknown>,
) {
  console.warn("NICEPAY webhook ignored:", {
    registrationId,
    providerStatus: providerStatus || "webhook_received",
    payload: safeNicepayPayload(payload),
  });
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

    // NICEPAY sends an empty JSON object while verifying a newly registered webhook URL.
    if (rawBody.trim() === "") {
      return nicepayOkResponse();
    }

    const parsedPayload = JSON.parse(rawBody) as unknown;

    if (!isRecord(parsedPayload)) {
      return NextResponse.json(
        { success: false, error: "NICEPAY 웹훅 본문 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const payload = parsedPayload;

    if (Object.keys(payload).length === 0) {
      return nicepayOkResponse();
    }

    const fields = scalarPayload(payload);
    const orderId = fields.orderId || "";
    const tid = fields.tid || "";
    const amount = Number(fields.amount || 0);
    const status = fields.status || "";
    const resultCode = fields.resultCode || "";

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

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("registration_id, amount, payment_method, status, provider_status")
      .eq("payment_key", tid)
      .eq("order_id", orderId)
      .maybeSingle<PaymentLedger>();

    if (paymentError) {
      return NextResponse.json(
        { success: false, error: "결제 원장을 조회하지 못했습니다." },
        { status: 500 },
      );
    }

    if (
      payment
      && (payment.registration_id !== registration.id || Number(payment.amount) !== amount)
    ) {
      return NextResponse.json(
        { success: false, error: "NICEPAY 거래가 신청 정보와 일치하지 않습니다." },
        { status: 400 },
      );
    }

    const isVirtualAccount = payment?.payment_method === "가상계좌";
    const reportedPaymentMethod = getNicepayPaymentMethod(fields);

    if (isVirtualAccount && resultCode === "0000" && status === "paid") {
      if (
        registration.status === "confirmed"
        && payment.status === "success"
        && payment.provider_status === "paid"
      ) {
        logIgnoredWebhook(registration.id, status, payload);
        return nicepayOkResponse();
      }

      if (
        registration.status !== "pending"
        || payment.status !== "pending"
        || payment.provider_status !== "ready"
      ) {
        logIgnoredWebhook(registration.id, status, payload);
        return nicepayOkResponse();
      }

      const { data: depositConfirmed, error: rpcError } = await supabase.rpc("confirm_virtual_account_deposit", {
        p_registration_id: registration.id,
        p_tid: tid,
        p_order_id: registration.order_id,
        p_amount: Number(registration.amount),
      });

      if (rpcError) {
        return NextResponse.json(
          { success: false, error: "가상계좌 입금 상태를 반영하지 못했습니다." },
          { status: 500 },
        );
      }

      if (depositConfirmed !== true) {
        logIgnoredWebhook(registration.id, status, payload);
      }

      return nicepayOkResponse();
    }

    if (isVirtualAccount && ["expired", "failed", "cancelled"].includes(status)) {
      const duplicateFailure = (
        (payment.status === "failed" || payment.status === "cancelled")
        && payment.provider_status === status
        && (registration.status === "cancelled" || registration.status === "expired")
      );

      if (duplicateFailure) {
        logIgnoredWebhook(registration.id, status, payload);
        return nicepayOkResponse();
      }

      if (
        !["pending", "cancelled", "expired"].includes(registration.status)
        || payment.status !== "pending"
        || payment.provider_status !== "ready"
      ) {
        logIgnoredWebhook(registration.id, status, payload);
        return nicepayOkResponse();
      }

      const { error: rpcError } = await supabase.rpc("fail_virtual_account_payment", {
        p_registration_id: registration.id,
        p_tid: tid,
        p_order_id: registration.order_id,
        p_provider_status: status,
      });

      if (rpcError) {
        return NextResponse.json(
          { success: false, error: "가상계좌 실패 상태를 반영하지 못했습니다." },
          { status: 500 },
        );
      }

      return nicepayOkResponse();
    }

    if (isVirtualAccount || reportedPaymentMethod === "가상계좌") {
      logIgnoredWebhook(registration.id, status, payload);
      return nicepayOkResponse();
    }

    if (resultCode === "0000" && status === "paid" && !payment) {
      const { error: rpcError } = await supabase.rpc("confirm_payment_registration", {
        p_registration_id: registration.id,
        p_payment_key: tid,
        p_order_id: registration.order_id,
        p_amount: Number(registration.amount),
        p_payment_method: getNicepayPaymentMethod(fields),
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
      if (payment) {
        const cancellation = await cancelActiveRegistration(registration.id);

        if (!cancellation.ok) {
          return NextResponse.json(
            { success: false, error: "신청 취소 상태를 반영하지 못했습니다." },
            { status: 500 },
          );
        }
      } else {
        logIgnoredWebhook(registration.id, status, payload);
      }

      return nicepayOkResponse();
    }

    if (!payment && (["expired", "failed"].includes(status) || resultCode !== "0000")) {
      logIgnoredWebhook(registration.id, status, payload);

      return nicepayOkResponse();
    }

    if (status === "partialCancelled") {
      logIgnoredWebhook(registration.id, status, payload);

      return nicepayOkResponse();
    }

    logIgnoredWebhook(registration.id, status, payload);

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
