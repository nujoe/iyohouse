import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/admin";
import {
  approveNicepayPaymentAuth,
  cancelNicepayPayment,
  getNicepayConfirmationAction,
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
type VirtualAccountCheckoutState = {
  state: "active_intent" | "ready_ledger" | "none";
  attemptId: string | null;
};

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

async function getVirtualAccountCheckoutState(registrationId: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_virtual_account_checkout_state", {
    p_registration_id: registrationId,
  });

  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false as const };
  }

  const state = (data as Record<string, unknown>).state;
  const attemptId = (data as Record<string, unknown>).attempt_id;

  if (state !== "active_intent" && state !== "ready_ledger" && state !== "none") {
    return { ok: false as const };
  }

  return {
    ok: true as const,
    state: {
      state,
      attemptId: typeof attemptId === "string" ? attemptId : null,
    } as VirtualAccountCheckoutState,
  };
}

function processingRedirect(
  request: Request,
  registration: Pick<PaymentRegistration, "id" | "order_id">,
  message: string,
) {
  return NextResponse.redirect(
    redirectUrl(request, "/payment/fail", {
      registration_id: registration.id,
      order_id: registration.order_id,
      processing: "true",
      message,
    }),
    { status: 303 },
  );
}

export async function POST(request: Request) {
  const auth = await parseNicepayRequest(request);
  const reservedParams = new URLSearchParams(auth.mallReserved || "");
  const workshopId = reservedParams.get("workshop") || undefined;
  const workshopTitle = reservedParams.get("workshop_title") || undefined;
  const checkoutAttemptId = getCheckoutAttemptId(request, reservedParams);
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

    const checkoutStateResult = await getVirtualAccountCheckoutState(registration.id);

    if (!checkoutStateResult.ok) {
      return processingRedirect(
        request,
        registration,
        "가상계좌 결제 시도 상태를 확인 중입니다. 결제를 다시 시도하지 말고 잠시 후 확인해 주세요.",
      );
    }

    const virtualAccountCheckoutState = checkoutStateResult.state;

    if (virtualAccountCheckoutState.state === "ready_ledger") {
      return NextResponse.redirect(
        redirectUrl(request, "/payment/pending", {
          order_id: registration.order_id,
          workshop: workshopId,
          workshop_title: workshopTitle,
        }),
        { status: 303 },
      );
    }

    if (virtualAccountCheckoutState.state === "active_intent") {
      if (!checkoutAttemptId || checkoutAttemptId !== virtualAccountCheckoutState.attemptId) {
        return processingRedirect(
          request,
          registration,
          "가상계좌 결제 시도 정보가 일치하지 않습니다. 결제를 다시 시도하지 말고 상태를 확인해 주세요.",
        );
      }

      const attemptIsValid = await validateVirtualAccountCheckoutAttempt(
        registration,
        checkoutAttemptId,
      );

      if (!attemptIsValid) {
        return processingRedirect(
          request,
          registration,
          "가상계좌 결제 시도를 확인 중입니다. 결제를 다시 시도하지 말고 잠시 후 확인해 주세요.",
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

    // The actual NICEPAY method is checked only after approval. A VBank result
    // without the server-validated active intent is compensated immediately so
    // it cannot become an untracked issued account.
    if (
      paymentMethod === "가상계좌"
      && virtualAccountCheckoutState.state !== "active_intent"
    ) {
      const compensation = await cancelNicepayPayment({
        tid: approval.tid,
        orderId: registration.order_id,
        cancelAmt: Number(registration.amount),
        reason: "IYOHOUSE uncorrelated virtual account approval",
      });

      return NextResponse.redirect(
        redirectUrl(request, "/payment/fail", {
          registration_id: registration.id,
          order_id: registration.order_id,
          message: compensation.ok
            ? "가상계좌 결제 시도를 확인할 수 없어 승인을 취소했습니다."
            : "가상계좌 결제 시도를 확인할 수 없고 승인 취소도 실패했습니다. 운영자에게 문의해 주세요.",
        }),
        { status: 303 },
      );
    }

    if (
      virtualAccountCheckoutState.state === "active_intent"
      && paymentMethod !== "가상계좌"
    ) {
      const compensation = await cancelNicepayPayment({
        tid: approval.tid,
        orderId: registration.order_id,
        cancelAmt: Number(registration.amount),
        reason: "IYOHOUSE virtual account attempt returned a non-vbank approval",
      });

      const release = compensation.ok
        ? await releaseVirtualAccountCheckout(
            registration,
            checkoutAttemptId,
            "vbank_attempt_wrong_final_method_compensated",
          )
        : null;

      return NextResponse.redirect(
        redirectUrl(request, "/payment/fail", {
          registration_id: registration.id,
          order_id: registration.order_id,
          message: !compensation.ok
            ? "가상계좌 결제 승인 상태가 일치하지 않고 취소도 실패했습니다. 운영자에게 문의해 주세요."
            : !release?.ok
              ? "가상계좌 결제를 취소했지만 신청 상태를 정리하지 못했습니다. 운영자에게 문의해 주세요."
              : "가상계좌 결제 승인 상태가 일치하지 않아 취소했습니다.",
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

    const { data: reconciliationResult, error: rpcError } = await supabase.rpc(
      "reconcile_payment_registration",
      {
      p_registration_id: registration.id,
      p_payment_key: approval.tid,
      p_order_id: registration.order_id,
      p_amount: Number(registration.amount),
      p_payment_method: paymentMethod,
        p_provider_payload: approval.payload,
      },
    );

    if (rpcError) {
      console.error("reconcile_payment_registration RPC failed:", rpcError);

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
        return processingRedirect(
          request,
          registration,
          "결제 원장 확인이 지연되고 있습니다. 취소하지 말고 잠시 후 다시 확인해 주세요.",
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
      // A transport/database error after provider approval is not proof of a
      // terminal rejection. The signed webhook can safely run the same RPC.
      return processingRedirect(
        request,
        registration,
        "결제 처리 결과를 확인 중입니다. 취소하지 말고 잠시 후 다시 확인해 주세요.",
      );
    }

    const confirmationAction = getNicepayConfirmationAction(reconciliationResult);

    if (confirmationAction === "confirmed") {
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

    if (confirmationAction === "processing") {
      return processingRedirect(
        request,
        registration,
        "결제 처리 결과를 확인 중입니다. 취소하지 말고 잠시 후 다시 확인해 주세요.",
      );
    }

    const compensation = await cancelNicepayPayment({
      tid: approval.tid,
      orderId: registration.order_id,
      cancelAmt: Number(registration.amount),
      reason: "IYOHOUSE terminal registration reconciliation",
    });

    return NextResponse.redirect(
      redirectUrl(request, "/payment/fail", {
        registration_id: registration.id,
        order_id: registration.order_id,
        message: compensation.ok
          ? "신청 상태가 확정될 수 없어 결제를 취소했습니다."
          : "신청 상태가 확정될 수 있고 결제 취소에 실패했습니다. 운영자에게 문의해 주세요.",
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
