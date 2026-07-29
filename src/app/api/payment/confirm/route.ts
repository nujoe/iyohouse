import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/admin";
import {
  approveNicepayPaymentAuth,
  cancelNicepayPayment,
  getNicepayPaymentMethod,
  getNicepayVirtualAccount,
  isMatchingConfirmedNicepayPayment,
  safeNicepayPayload,
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

type CheckoutReleaseOutcome = "preserved" | "cancelled" | "expired" | "unchanged";
type CheckoutMethod = "cardAndEasyPay" | "vbank";

function getCheckoutMethod(reservedParams: URLSearchParams): CheckoutMethod | null {
  const method = reservedParams.get("checkout_method");

  return method === "cardAndEasyPay" || method === "vbank" ? method : null;
}

function getCheckoutAttemptId(request: Request, reservedParams: URLSearchParams) {
  const queryAttemptId = new URL(request.url).searchParams.get("checkout_attempt_id");
  const reservedAttemptId = reservedParams.get("checkout_attempt_id");
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (queryAttemptId && reservedAttemptId && queryAttemptId !== reservedAttemptId) {
    return null;
  }

  const attemptId = queryAttemptId || reservedAttemptId;

  return attemptId && uuidPattern.test(attemptId) ? attemptId : null;
}

async function releaseVirtualAccountCheckout(
  registration: Pick<PaymentRegistration, "id" | "user_id">,
  checkoutAttemptId: string | null,
  reason: string,
) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc("release_virtual_account_checkout", {
    p_registration_id: registration.id,
    p_user_id: registration.user_id,
    p_attempt_id: checkoutAttemptId,
  });

  if (
    error
    || (
      data !== "preserved"
      && data !== "cancelled"
      && data !== "expired"
      && data !== "unchanged"
      && data !== "stale_attempt"
    )
  ) {
    console.error("release_virtual_account_checkout RPC failed:", {
      registrationId: registration.id,
      reason,
      outcome: data,
      hasError: Boolean(error),
    });

    return { ok: false as const };
  }

  if (data === "stale_attempt") {
    console.warn("NICEPAY checkout release ignored for a stale attempt:", {
      registrationId: registration.id,
      reason,
    });

    return { ok: false as const, outcome: data };
  }

  console.warn("NICEPAY checkout released:", {
    registrationId: registration.id,
    reason,
    outcome: data,
  });

  return { ok: true as const, outcome: data as CheckoutReleaseOutcome };
}

async function validateVirtualAccountCheckoutAttempt(
  registration: Pick<PaymentRegistration, "id" | "user_id">,
  checkoutAttemptId: string,
) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc("validate_virtual_account_checkout_attempt", {
    p_registration_id: registration.id,
    p_user_id: registration.user_id,
    p_attempt_id: checkoutAttemptId,
  });

  return !error && data === true;
}

export async function POST(request: Request) {
  const auth = await parseNicepayRequest(request);
  const reservedParams = new URLSearchParams(auth.mallReserved || "");
  const workshopId = reservedParams.get("workshop") || undefined;
  const workshopTitle = reservedParams.get("workshop_title") || undefined;
  const checkoutAttemptId = getCheckoutAttemptId(request, reservedParams);
  const checkoutMethod = getCheckoutMethod(reservedParams);
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

    if (!checkoutMethod) {
      return NextResponse.redirect(
        redirectUrl(request, "/payment/fail", {
          registration_id: registration.id,
          order_id: registration.order_id,
          message: "결제 수단 정보를 확인할 수 없습니다. 결제 상태 확인 후 다시 시도해 주세요.",
        }),
        { status: 303 },
      );
    }

    if (checkoutMethod === "vbank") {
      if (!checkoutAttemptId) {
        return NextResponse.redirect(
          redirectUrl(request, "/payment/fail", {
            registration_id: registration.id,
            order_id: registration.order_id,
            message: "가상계좌 결제 시도를 확인할 수 없습니다. 결제 상태 확인 후 다시 시도해 주세요.",
          }),
          { status: 303 },
        );
      }

      const attemptIsValid = await validateVirtualAccountCheckoutAttempt(
        registration,
        checkoutAttemptId,
      );

      if (!attemptIsValid) {
        const { data: recordedPayment, error: recordedPaymentError } = await supabase
          .from("payments")
          .select("registration_id, payment_key, order_id, amount, payment_method, status, provider_status, expires_at")
          .eq("registration_id", registration.id)
          .eq("payment_key", auth.tid || "")
          .eq("order_id", registration.order_id)
          .eq("amount", Number(registration.amount))
          .eq("payment_method", "가상계좌")
          .eq("checkout_attempt_id", checkoutAttemptId)
          .maybeSingle<NicepayPaymentLedger>();

        if (
          !recordedPaymentError
          && recordedPayment?.status === "pending"
          && recordedPayment.provider_status === "ready"
          && Boolean(recordedPayment.expires_at)
          && Date.parse(recordedPayment.expires_at || "") > Date.now()
        ) {
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
            message: recordedPaymentError
              ? "가상계좌 결제 시도를 확인하지 못했습니다. 취소하지 말고 운영자에게 문의해 주세요."
              : "가상계좌 결제 시도가 만료되었거나 일치하지 않습니다. 결제 상태를 확인해 주세요.",
          }),
          { status: 303 },
        );
      }
    }

    if (auth.authResultCode !== "0000") {
      const release = await releaseVirtualAccountCheckout(
        registration,
        checkoutAttemptId,
        "auth_failed",
      );

      return NextResponse.redirect(
        redirectUrl(request, "/payment/fail", {
          order_id: registration.order_id,
          message: release.ok
            ? auth.authResultMsg || "NICEPAY 인증이 실패했습니다."
            : "NICEPAY 인증 실패 후 신청 상태를 정리하지 못했습니다. 운영자에게 문의해 주세요.",
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
      const release = await releaseVirtualAccountCheckout(
        registration,
        checkoutAttemptId,
        "approval_failed",
      );

      return NextResponse.redirect(
        redirectUrl(request, "/payment/fail", {
          registration_id: registration.id,
          order_id: registration.order_id,
          message: release.ok
            ? approval.message
            : "NICEPAY 승인 실패 후 신청 상태를 정리하지 못했습니다. 운영자에게 문의해 주세요.",
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

    if (paymentMethod === "가상계좌" && (checkoutMethod !== "vbank" || !checkoutAttemptId)) {
      return NextResponse.redirect(
        redirectUrl(request, "/payment/fail", {
          registration_id: registration.id,
          order_id: registration.order_id,
          message: "가상계좌 결제 시도를 확인할 수 없습니다. 결제 상태 확인 후 다시 시도해 주세요.",
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

        let release: Awaited<ReturnType<typeof releaseVirtualAccountCheckout>> | null = null;

        if (compensation.ok) {
          release = await releaseVirtualAccountCheckout(
            registration,
            checkoutAttemptId,
            "invalid_vbank_issuance_compensated",
          );
        }

        if (release?.ok && release.outcome === "preserved") {
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
            message: !compensation.ok
              ? "가상계좌 발급 정보를 저장하지 못했고 결제도 취소하지 못했습니다. 운영자에게 문의해 주세요."
              : !release?.ok
                ? "가상계좌 결제 취소 후 신청 상태를 정리하지 못했습니다. 운영자에게 문의해 주세요."
                : "가상계좌 발급 정보가 올바르지 않아 결제를 취소했습니다.",
          }),
          { status: 303 },
        );
      }

      const { data: issuanceRecorded, error: issuanceError } = await supabase.rpc(
        "record_virtual_account_issuance",
        {
          p_registration_id: registration.id,
          p_attempt_id: checkoutAttemptId,
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

        const { data: issuancePayment, error: issuanceLookupError } = await supabase
          .from("payments")
          .select("registration_id, payment_key, order_id, amount, payment_method, status, provider_status, expires_at")
          .eq("registration_id", registration.id)
          .eq("order_id", registration.order_id)
          .eq("payment_key", approval.tid)
          .eq("amount", Number(registration.amount))
          .eq("payment_method", "가상계좌")
          .eq("checkout_attempt_id", checkoutAttemptId)
          .maybeSingle<NicepayPaymentLedger>();

        if (issuanceLookupError) {
          return NextResponse.redirect(
            redirectUrl(request, "/payment/fail", {
              registration_id: registration.id,
              order_id: registration.order_id,
              message: "가상계좌 저장 결과를 확인하지 못했습니다. 취소하지 말고 운영자에게 문의해 주세요.",
            }),
            { status: 303 },
          );
        }

        const matchingReadyPayment = issuancePayment
          && issuancePayment.status === "pending"
          && issuancePayment.provider_status === "ready"
          && Boolean(issuancePayment.expires_at)
          && Date.parse(issuancePayment.expires_at || "") > Date.now();

        if (matchingReadyPayment) {
          return NextResponse.redirect(
            redirectUrl(request, "/payment/pending", {
              order_id: registration.order_id,
              workshop: workshopId,
              workshop_title: workshopTitle,
            }),
            { status: 303 },
          );
        }

        if (issuancePayment) {
          return NextResponse.redirect(
            redirectUrl(request, "/payment/fail", {
              registration_id: registration.id,
              order_id: registration.order_id,
              message: "가상계좌 원장 상태가 확정되지 않았습니다. 취소하지 말고 운영자에게 문의해 주세요.",
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

        if (!compensation.ok) {
          return NextResponse.redirect(
            redirectUrl(request, "/payment/fail", {
              registration_id: registration.id,
              order_id: registration.order_id,
              message: "가상계좌는 발급되었으나 저장하거나 취소하지 못했습니다. 운영자에게 문의해 주세요.",
            }),
            { status: 303 },
          );
        }

        const release = await releaseVirtualAccountCheckout(
          registration,
          checkoutAttemptId,
          "vbank_recording_failed_compensated",
        );

        if (release.ok && release.outcome === "preserved") {
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
            message: release.ok
              ? "가상계좌 발급 처리 중 오류가 발생해 결제를 취소했습니다."
              : "가상계좌 결제 취소 후 신청 상태를 정리하지 못했습니다. 운영자에게 문의해 주세요.",
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

      let release: Awaited<ReturnType<typeof releaseVirtualAccountCheckout>> | null = null;

      if (compensation.ok) {
        release = await releaseVirtualAccountCheckout(
          registration,
          checkoutAttemptId,
          "unexpected_approval_state_compensated",
        );
      }

      return NextResponse.redirect(
        redirectUrl(request, "/payment/fail", {
          registration_id: registration.id,
          order_id: registration.order_id,
          message: !compensation.ok
            ? "결제 승인 상태를 확인하지 못했고 결제도 취소하지 못했습니다. 운영자에게 문의해 주세요."
            : !release?.ok
              ? "결제 취소 후 신청 상태를 정리하지 못했습니다. 운영자에게 문의해 주세요."
              : release.outcome === "preserved"
                ? "기존 가상계좌 결제는 유지하고 추가 승인을 취소했습니다."
                : "결제 승인 상태가 올바르지 않아 결제를 취소했습니다.",
        }),
        { status: 303 },
      );
    }

    const { error: rpcError } = await supabase.rpc("confirm_payment_registration", {
      p_registration_id: registration.id,
      p_payment_key: approval.tid,
      p_order_id: registration.order_id,
      p_amount: Number(registration.amount),
      p_payment_method: paymentMethod,
    });

    if (rpcError) {
      console.error("confirm_payment_registration RPC failed:", rpcError);

      const { data: recordedPayment, error: recordedPaymentError } = await supabase
        .from("payments")
        .select("registration_id, payment_key, order_id, amount, payment_method, status, provider_status, expires_at")
        .eq("registration_id", registration.id)
        .eq("payment_key", approval.tid)
        .eq("order_id", registration.order_id)
        .eq("amount", Number(registration.amount))
        .eq("payment_method", paymentMethod)
        .maybeSingle<NicepayPaymentLedger>();

      if (recordedPaymentError) {
        return NextResponse.redirect(
          redirectUrl(request, "/payment/fail", {
            registration_id: registration.id,
            order_id: registration.order_id,
            message: "결제 원장 확인이 지연되고 있습니다. 취소하지 말고 잠시 후 다시 확인해 주세요.",
          }),
          { status: 303 },
        );
      }

      if (isMatchingConfirmedNicepayPayment(recordedPayment, {
        registrationId: registration.id,
        tid: approval.tid,
        orderId: registration.order_id,
        amount: Number(registration.amount),
        paymentMethod,
      })) {
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

      const compensation = await cancelNicepayPayment({
        tid: approval.tid,
        orderId: registration.order_id,
        cancelAmt: Number(registration.amount),
        reason: "IYOHOUSE registration confirmation failed",
      });

      let release: Awaited<ReturnType<typeof releaseVirtualAccountCheckout>> | null = null;

      if (compensation.ok) {
        release = await releaseVirtualAccountCheckout(
          registration,
          checkoutAttemptId,
          "confirmation_failed_compensated",
        );
      } else {
        console.error("NICEPAY compensation cancel failed:", compensation.message, compensation.payload);
      }

      return NextResponse.redirect(
        redirectUrl(request, "/payment/fail", {
          registration_id: registration.id,
          order_id: registration.order_id,
          message: !compensation.ok
            ? "결제는 승인되었으나 신청 확정 및 취소에 실패했습니다. 운영자에게 문의해 주세요."
            : !release?.ok
              ? "결제 취소 후 신청 상태를 정리하지 못했습니다. 운영자에게 문의해 주세요."
              : "신청 확정 중 오류가 발생해 결제를 취소했습니다.",
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
