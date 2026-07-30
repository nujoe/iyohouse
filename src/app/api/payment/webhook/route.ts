import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/admin";
import {
  canAcknowledgeNicepayCardCancellation,
  getNicepayConfirmationAction,
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

function decodeNicepayBody(body: ArrayBuffer, contentType: string) {
  const charset = contentType.match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase();
  const encoding = contentType.includes("application/x-www-form-urlencoded")
    ? charset || "euc-kr"
    : charset || "utf-8";

  try {
    return new TextDecoder(encoding).decode(body);
  } catch {
    return new TextDecoder().decode(body);
  }
}

function firstField(fields: Record<string, string>, names: string[]) {
  for (const name of names) {
    if (fields[name]) {
      return fields[name];
    }
  }

  return "";
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
    const contentType = request.headers.get("content-type")?.toLowerCase() || "";
    const isFormPayload = contentType.includes("application/x-www-form-urlencoded");
    const rawBody = decodeNicepayBody(await request.arrayBuffer(), contentType);

    // NICEPAY may probe a newly registered URL with an empty body before sending events.
    if (rawBody.trim() === "") {
      return nicepayOkResponse();
    }

    let parsedPayload: unknown;

    try {
      parsedPayload = isFormPayload
        ? Object.fromEntries(new URLSearchParams(rawBody).entries())
        : JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { success: false, error: "NICEPAY 웹훅 본문 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

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
    const orderId = firstField(fields, ["orderId", "order_id", "MOID", "Moid", "moid"]);
    const tid = firstField(fields, ["tid", "TID", "Tid"]);
    const amount = Number(firstField(fields, ["amount", "Amt", "amt"]));
    const status = firstField(fields, ["status", "Status"])
      || (firstField(fields, ["ResultCode", "resultCode"]) === "0000"
        || firstField(fields, ["ResultCode", "resultCode"]) === "4110"
        ? "paid"
        : "");
    const resultCode = firstField(fields, ["resultCode", "ResultCode"]);

    // NICEPAY's registration check can include sample MOID/Amt fields, but it
    // cannot include a real transaction TID. Real notifications always have TID.
    if (isFormPayload && !tid) {
      return nicepayOkResponse();
    }

    // A probe without transaction identity must never enter payment processing.
    if (isFormPayload && !orderId && !tid && !resultCode) {
      return nicepayOkResponse();
    }

    if (!orderId || !tid || !amount) {
      return NextResponse.json(
        { success: false, error: "NICEPAY 웹훅 필드가 부족합니다." },
        { status: 400 },
      );
    }

    // The JSON callback contract is signed by this integration. NICEPAY's URL
    // notification contract is form-urlencoded and has no signature field.
    if (!isFormPayload && (!fields.ediDate || !fields.signature)) {
      return NextResponse.json(
        { success: false, error: "NICEPAY 웹훅 필드가 부족합니다." },
        { status: 400 },
      );
    }

    if (!isFormPayload && !verifyNicepayResultSignature(fields)) {
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

    if (isVirtualAccount && (resultCode === "4110" || (resultCode === "0000" && status === "paid"))) {
      const { data: depositResult, error: rpcError } = await supabase.rpc(
        "reconcile_virtual_account_deposit",
        {
        p_registration_id: registration.id,
        p_tid: tid,
        p_order_id: registration.order_id,
        p_amount: Number(registration.amount),
          p_provider_payload: payload,
        },
      );

      if (rpcError) {
        return NextResponse.json(
          { success: false, error: "가상계좌 입금 상태를 반영하지 못했습니다." },
          { status: 500 },
        );
      }

      const depositAction = getNicepayConfirmationAction(depositResult);

      if (depositAction === "processing") {
        return NextResponse.json(
          { success: false, error: "가상계좌 입금 결과가 확정되지 않았습니다." },
          { status: 500 },
        );
      }

      if (depositAction === "compensate") {
        console.error("NICEPAY paid virtual account requires manual reconciliation:", {
          registrationId: registration.id,
          tid,
          payload: safeNicepayPayload(payload),
        });
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

    if (resultCode === "0000" && status === "paid" && !isVirtualAccount && reportedPaymentMethod !== "가상계좌") {
      if (!reportedPaymentMethod) {
        return NextResponse.json(
          { success: false, error: "NICEPAY 웹훅 결제수단이 누락되었습니다." },
          { status: 500 },
        );
      }

      const { data: reconciliationResult, error: rpcError } = await supabase.rpc(
        "reconcile_payment_registration",
        {
        p_registration_id: registration.id,
        p_payment_key: tid,
        p_order_id: registration.order_id,
        p_amount: Number(registration.amount),
          p_payment_method: reportedPaymentMethod,
          p_provider_payload: payload,
        },
      );

      if (rpcError) {
        return NextResponse.json(
          { success: false, error: rpcError.message },
          { status: 500 },
        );
      }

      const action = getNicepayConfirmationAction(reconciliationResult);

      if (action === "processing") {
        return NextResponse.json(
          { success: false, error: "결제 원장 반영 결과가 확정되지 않았습니다." },
          { status: 500 },
        );
      }

      if (action === "compensate") {
        console.error("NICEPAY paid card/easy payment requires manual reconciliation:", {
          registrationId: registration.id,
          tid,
          payload: safeNicepayPayload(payload),
        });
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
