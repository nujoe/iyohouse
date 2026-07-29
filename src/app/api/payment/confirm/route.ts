import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/admin";
import {
  approveNicepayPaymentAuth,
  cancelNicepayPayment,
  getNicepayPaymentMethod,
  getNicepayVirtualAccount,
  isMatchingConfirmedNicepayPayment,
  isPendingReadyVirtualAccountPayment,
  safeNicepayPayload,
  shouldCancelRegistrationAfterIssuanceConflict,
  type NicepayPaymentLedger,
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
  const workshopTitle = reservedParams.get("workshop_title") || undefined;
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

    if (registration.status !== "pending" && registration.status !== "confirmed") {
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

    const paymentMethod = getNicepayPaymentMethod(approval.payload);

    if (registration.status === "confirmed") {
      const { data: confirmedPayment, error: confirmedPaymentError } = await supabase
        .from("payments")
        .select("registration_id, payment_key, order_id, amount, payment_method, status, provider_status, expires_at")
        .eq("payment_key", approval.tid)
        .eq("order_id", registration.order_id)
        .eq("registration_id", registration.id)
        .maybeSingle<NicepayPaymentLedger>();

      if (confirmedPaymentError) {
        return NextResponse.redirect(
          redirectUrl(request, "/payment/fail", {
            registration_id: registration.id,
            order_id: registration.order_id,
            message: "기존 결제 원장을 확인하지 못했습니다. 운영자에게 문의해 주세요.",
          }),
          { status: 303 },
        );
      }

      const matchesConfirmedPayment = paymentMethod
        ? isMatchingConfirmedNicepayPayment(confirmedPayment, {
            registrationId: registration.id,
            tid: approval.tid,
            orderId: registration.order_id,
            amount: Number(registration.amount),
            paymentMethod,
          })
        : false;

      if (!matchesConfirmedPayment) {
        const compensation = await cancelNicepayPayment({
          tid: approval.tid,
          orderId: registration.order_id,
          cancelAmt: Number(registration.amount),
          reason: "IYOHOUSE duplicate confirmed registration payment",
        });

        return NextResponse.redirect(
          redirectUrl(request, "/payment/fail", {
            registration_id: registration.id,
            order_id: registration.order_id,
            message: compensation.ok
              ? "이미 처리된 신청의 추가 결제를 취소했습니다."
              : "추가 결제를 취소하지 못했습니다. 운영자에게 즉시 문의해 주세요.",
          }),
          { status: 303 },
        );
      }

      if (paymentMethod === "가상계좌") {
        return NextResponse.redirect(
          redirectUrl(request, "/payment/pending", {
            order_id: registration.order_id,
            workshop: workshopId,
            workshop_title: workshopTitle,
          }),
          { status: 303 },
        );
      }

      if (approval.providerStatus === "paid" && paymentMethod) {
        return NextResponse.redirect(
          redirectUrl(request, "/payment/success", {
            registration_id: registration.id,
            order_id: registration.order_id,
            amount: registration.amount,
            workshop: workshopId,
            workshop_title: workshopTitle,
          }),
          { status: 303 },
        );
      }

      return NextResponse.redirect(
        redirectUrl(request, "/payment/fail", {
          registration_id: registration.id,
          order_id: registration.order_id,
          message: "이미 처리된 결제의 승인 상태가 일치하지 않습니다.",
        }),
        { status: 303 },
      );
    }

    if (paymentMethod === "가상계좌" && approval.providerStatus === "ready") {
      const virtualAccount = getNicepayVirtualAccount(approval.payload);

      if (!virtualAccount) {
        const compensation = await cancelNicepayPayment({
          tid: approval.tid,
          orderId: registration.order_id,
          cancelAmt: Number(registration.amount),
          reason: "IYOHOUSE invalid virtual account issuance",
        });

        if (compensation.ok) {
          await markPendingRegistrationCancelled(registration.id, "invalid_vbank_issuance_compensated");
        }

        return NextResponse.redirect(
          redirectUrl(request, "/payment/fail", {
            registration_id: registration.id,
            order_id: registration.order_id,
            message: compensation.ok
              ? "가상계좌 발급 정보가 올바르지 않아 결제를 취소했습니다."
              : "가상계좌 발급 정보를 저장하지 못했습니다. 운영자에게 문의해 주세요.",
          }),
          { status: 303 },
        );
      }

      const { data: issuanceRecorded, error: issuanceError } = await supabase.rpc(
        "record_virtual_account_issuance",
        {
          p_registration_id: registration.id,
          p_tid: approval.tid,
          p_order_id: registration.order_id,
          p_amount: Number(registration.amount),
          p_vbank_code: virtualAccount.code,
          p_vbank_name: virtualAccount.name,
          p_vbank_number: virtualAccount.number,
          p_vbank_holder: virtualAccount.holder,
          p_payment_method: "가상계좌",
          p_provider_status: "ready",
          p_expires_at: virtualAccount.expiresAt,
        },
      );

      if (issuanceError || issuanceRecorded !== true) {
        console.error("record_virtual_account_issuance RPC failed:", {
          registrationId: registration.id,
          hasError: Boolean(issuanceError),
        });

        const { data: existingPayment, error: existingPaymentError } = await supabase
          .from("payments")
          .select("registration_id, payment_key, order_id, amount, payment_method, status, provider_status, expires_at")
          .eq("registration_id", registration.id)
          .maybeSingle<NicepayPaymentLedger>();
        const activePaymentFound = !existingPaymentError
          && isPendingReadyVirtualAccountPayment(existingPayment, {
            registrationId: registration.id,
            orderId: registration.order_id,
            amount: Number(registration.amount),
          });

        if (activePaymentFound && existingPayment?.payment_key === approval.tid) {
          return NextResponse.redirect(
            redirectUrl(request, "/payment/pending", {
              order_id: registration.order_id,
              workshop: workshopId,
              workshop_title: workshopTitle,
            }),
            { status: 303 },
          );
        }

        const compensation = await cancelNicepayPayment({
          tid: approval.tid,
          orderId: registration.order_id,
          cancelAmt: Number(registration.amount),
          reason: "IYOHOUSE virtual account recording failed",
        });

        if (shouldCancelRegistrationAfterIssuanceConflict({
          activePaymentFound,
          lookupSucceeded: !existingPaymentError,
          compensationSucceeded: compensation.ok,
        })) {
          await markPendingRegistrationCancelled(registration.id, "vbank_recording_failed_compensated");
        }

        if (activePaymentFound && compensation.ok) {
          return NextResponse.redirect(
            redirectUrl(request, "/payment/pending", {
              order_id: registration.order_id,
              workshop: workshopId,
              workshop_title: workshopTitle,
            }),
            { status: 303 },
          );
        }

        return NextResponse.redirect(
          redirectUrl(request, "/payment/fail", {
            registration_id: registration.id,
            order_id: registration.order_id,
            message: compensation.ok
              ? "가상계좌 발급 처리 중 오류가 발생해 결제를 취소했습니다."
              : "가상계좌는 발급되었으나 저장하지 못했습니다. 운영자에게 문의해 주세요.",
          }),
          { status: 303 },
        );
      }

      return NextResponse.redirect(
        redirectUrl(request, "/payment/pending", {
          order_id: registration.order_id,
          workshop: workshopId,
          workshop_title: workshopTitle,
        }),
        { status: 303 },
      );
    }

    if (approval.providerStatus !== "paid" || paymentMethod === "가상계좌" || !paymentMethod) {
      const compensation = await cancelNicepayPayment({
        tid: approval.tid,
        orderId: registration.order_id,
        cancelAmt: Number(registration.amount),
        reason: "IYOHOUSE unexpected NICEPAY approval state",
      });

      if (compensation.ok) {
        await markPendingRegistrationCancelled(registration.id, "unexpected_approval_state_compensated");
      }

      return NextResponse.redirect(
        redirectUrl(request, "/payment/fail", {
          registration_id: registration.id,
          order_id: registration.order_id,
          message: compensation.ok
            ? "결제 승인 상태가 올바르지 않아 결제를 취소했습니다."
            : "결제 승인 상태를 확인하지 못했습니다. 운영자에게 문의해 주세요.",
        }),
        { status: 303 },
      );
    }

    const { error: rpcError } = await supabase.rpc("confirm_payment_registration", {
      p_registration_id: registration.id,
      p_payment_key: approval.tid,
      p_order_id: registration.order_id,
      p_amount: Number(registration.amount),
      p_payment_method: getNicepayPaymentMethod(approval.payload),
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
        workshop_title: workshopTitle,
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
