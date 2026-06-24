import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/admin";
import {
  approveNicepayPaymentAuth,
  cancelNicepayPayment,
  safeNicepayPayload,
} from "@/lib/payment/nicepay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentRegistration = {
  id: string;
  user_id: string;
  order_id: string;
  amount: number;
  status: "pending" | "confirmed" | "cancelled" | "expired";
};

export async function parseNicepayRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const json = await request.json() as Record<string, unknown>;

    return Object.fromEntries(
      Object.entries(json).map(([key, value]) => [key, typeof value === "string" ? value : String(value ?? "")]),
    );
  }

  const form = await request.formData();
  const fields: Record<string, string> = {};

  for (const [key, value] of form.entries()) {
    fields[key] = typeof value === "string" ? value : value.name;
  }

  return fields;
}

function redirectUrl(request: Request, pathname: string, params: Record<string, string | number | undefined>) {
  const url = new URL(pathname, request.url);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && String(value) !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function markPendingRegistrationCancelled(registrationId: string, reason: string) {
  const supabase = getSupabaseServerClient();

  await supabase
    .from("workshop_registrations_v2")
    .update({ status: "cancelled" })
    .eq("id", registrationId)
    .eq("status", "pending");

  console.warn("NICEPAY registration cancelled:", { registrationId, reason });
}

export async function POST(request: Request) {
  const auth = await parseNicepayRequest(request);
  const reservedParams = new URLSearchParams(auth.mallReserved || "");
  const workshopId = reservedParams.get("workshop") || undefined;
  const orderId = auth.orderId || "";
  const supabase = getSupabaseServerClient();

  try {
    if (!orderId) {
      return NextResponse.redirect(
        redirectUrl(request, "/payment/fail", { message: "주문번호가 누락되었습니다." }),
        { status: 303 },
      );
    }

    const { data: registration, error: registrationError } = await supabase
      .from("workshop_registrations_v2")
      .select("id, user_id, order_id, amount, status")
      .eq("order_id", orderId)
      .single<PaymentRegistration>();

    if (registrationError || !registration) {
      return NextResponse.redirect(
        redirectUrl(request, "/payment/fail", { order_id: orderId, message: "신청 내역을 찾을 수 없습니다." }),
        { status: 303 },
      );
    }

    if (auth.authResultCode !== "0000") {
      await markPendingRegistrationCancelled(registration.id, "auth_failed");

      return NextResponse.redirect(
        redirectUrl(request, "/payment/fail", {
          order_id: registration.order_id,
          message: auth.authResultMsg || "NICEPAY 인증이 실패했습니다.",
        }),
        { status: 303 },
      );
    }

    if (registration.status === "confirmed") {
      return NextResponse.redirect(
        redirectUrl(request, "/payment/success", {
          registration_id: registration.id,
          order_id: registration.order_id,
          amount: registration.amount,
          workshop: workshopId,
        }),
        { status: 303 },
      );
    }

    if (registration.status !== "pending") {
      return NextResponse.redirect(
        redirectUrl(request, "/payment/fail", {
          registration_id: registration.id,
          order_id: registration.order_id,
          message: "결제 대기 상태의 신청이 아닙니다.",
        }),
        { status: 303 },
      );
    }

    const approval = await approveNicepayPaymentAuth({
      auth,
      expectedOrderId: registration.order_id,
      expectedAmount: Number(registration.amount),
    });

    if (!approval.ok) {
      console.error("NICEPAY approval failed:", approval.message, safeNicepayPayload(auth));
      await markPendingRegistrationCancelled(registration.id, "approval_failed");

      return NextResponse.redirect(
        redirectUrl(request, "/payment/fail", {
          registration_id: registration.id,
          order_id: registration.order_id,
          message: approval.message,
        }),
        { status: 303 },
      );
    }

    const { error: rpcError } = await supabase.rpc("confirm_payment_registration", {
      p_registration_id: registration.id,
      p_payment_key: approval.tid,
      p_order_id: registration.order_id,
      p_amount: Number(registration.amount),
    });

    if (rpcError) {
      console.error("confirm_payment_registration RPC failed:", rpcError);

      const compensation = await cancelNicepayPayment({
        tid: approval.tid,
        orderId: registration.order_id,
        cancelAmt: Number(registration.amount),
        reason: "IYOHOUSE registration confirmation failed",
      });

      if (compensation.ok) {
        await markPendingRegistrationCancelled(registration.id, "confirmation_failed_compensated");
      } else {
        console.error("NICEPAY compensation cancel failed:", compensation.message, compensation.payload);
      }

      return NextResponse.redirect(
        redirectUrl(request, "/payment/fail", {
          registration_id: registration.id,
          order_id: registration.order_id,
          message: compensation.ok
            ? "신청 확정 중 오류가 발생해 결제를 취소했습니다."
            : "결제는 승인되었으나 신청 확정 중 오류가 발생했습니다. 운영자에게 문의해 주세요.",
        }),
        { status: 303 },
      );
    }

    return NextResponse.redirect(
      redirectUrl(request, "/payment/success", {
        registration_id: registration.id,
        order_id: registration.order_id,
        amount: registration.amount,
        workshop: workshopId,
      }),
      { status: 303 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("NICEPAY confirm API error:", error);

    return NextResponse.redirect(
      redirectUrl(request, "/payment/fail", { order_id: orderId, message }),
      { status: 303 },
    );
  }
}
