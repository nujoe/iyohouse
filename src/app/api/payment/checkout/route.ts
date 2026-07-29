import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  createNicepayPaymentPayload,
  getNicepayAvailableCheckoutMethods,
  getNicepayConfig,
  isNicepayConfigured,
  type NicepayCheckoutMethod,
} from "@/lib/payment/nicepay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckoutRequest = {
  registration_id?: string;
  orderName?: string;
  method?: unknown;
  scheduleLabel?: string;
  workshopId?: string;
  workshopTitle?: string;
};

type CheckoutRegistration = {
  id: string;
  user_id: string;
  order_id: string;
  amount: number;
  status: "pending" | "confirmed" | "cancelled" | "expired";
  expires_at?: string | null;
  snapshot_name?: string | null;
  snapshot_email?: string | null;
  workshops?: { title?: string | null } | { title?: string | null }[] | null;
};

function getCheckoutMethod(value: unknown): NicepayCheckoutMethod | null {
  return value === "cardAndEasyPay" || value === "vbank" ? value : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  try {
    const config = getNicepayConfig();

    if (!isNicepayConfigured(config)) {
      return NextResponse.json(
        { success: false, error: "NICEPAY 환경 변수가 설정되어 있지 않습니다." },
        { status: 503 },
      );
    }

    const supabase = await createClient();
    const checkoutRequest = await request.json() as CheckoutRequest;
    const { registration_id, orderName, scheduleLabel, workshopId, workshopTitle } = checkoutRequest;
    const method = getCheckoutMethod(checkoutRequest.method);

    if (!registration_id) {
      return NextResponse.json(
        { success: false, error: "신청 ID가 필요합니다." },
        { status: 400 },
      );
    }

    if (!method) {
      return NextResponse.json(
        { success: false, error: "지원하지 않는 결제 수단입니다." },
        { status: 400 },
      );
    }

    const availableMethods = getNicepayAvailableCheckoutMethods();

    if (!availableMethods[method]) {
      return NextResponse.json(
        { success: false, error: "현재 사용할 수 없는 결제 수단입니다." },
        { status: 503 },
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json(
        { success: false, error: "인증되지 않은 사용자입니다." },
        { status: 401 },
      );
    }

    const { data: registrationData, error: regError } = await supabase
      .from("workshop_registrations_v2")
      .select("id, user_id, order_id, amount, status, expires_at, snapshot_name, snapshot_email, workshops(title)")
      .eq("id", registration_id)
      .single();

    const registration = registrationData as CheckoutRegistration | null;

    if (regError || !registration) {
      return NextResponse.json(
        { success: false, error: "신청 내역을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (registration.user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: "본인의 신청만 결제할 수 있습니다." },
        { status: 403 },
      );
    }

    if (registration.status !== "pending") {
      return NextResponse.json(
        { success: false, error: "결제 대기 상태의 신청만 결제할 수 있습니다." },
        { status: 400 },
      );
    }

    if (registration.expires_at && new Date(registration.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { success: false, error: "신청 결제 기한이 만료되었습니다." },
        { status: 400 },
      );
    }

    const origin = new URL(request.url).origin;
    const mallReserved = new URLSearchParams();

    if (scheduleLabel) {
      mallReserved.set("schedule", scheduleLabel);
    }

    if (workshopId) {
      mallReserved.set("workshop", workshopId);
    }

    if (workshopTitle) {
      mallReserved.set("workshop_title", workshopTitle);
    }

    const registrationWorkshopTitle = Array.isArray(registration.workshops)
      ? registration.workshops[0]?.title
      : registration.workshops?.title;
    let checkoutAttemptId: string | null = null;

    if (method === "vbank") {
      const adminClient = getSupabaseServerClient();
      const expiresAt = new Date(
        Date.now() + config.vbankValidHours * 60 * 60 * 1000,
      ).toISOString();
      const { data: beginResult, error: beginError } = await adminClient.rpc(
        "begin_virtual_account_checkout",
        {
          p_registration_id: registration.id,
          p_user_id: user.id,
          p_expires_at: expiresAt,
        },
      );

      if (beginError) {
        console.error("begin_virtual_account_checkout RPC failed:", {
          registrationId: registration.id,
        });

        return NextResponse.json(
          { success: false, error: "가상계좌 결제 대기 시간을 확보하지 못했습니다." },
          { status: 500 },
        );
      }

      const beginPayload = beginResult && typeof beginResult === "object"
        ? beginResult as Record<string, unknown>
        : null;
      const beginStatus = beginPayload?.status;

      if (beginStatus === "intent_exists" || beginStatus === "active_payment_exists") {
        return NextResponse.json(
          {
            success: false,
            pending: true,
            order_id: registration.order_id,
            error: beginStatus === "intent_exists"
              ? "이미 가상계좌 발급이 진행 중입니다."
              : "이미 발급된 가상계좌가 있습니다.",
          },
          { status: 409 },
        );
      }

      if (
        beginStatus !== "started"
        || !beginPayload
        || !isUuid(beginPayload.attempt_id)
      ) {
        console.error("begin_virtual_account_checkout returned an unexpected result:", {
          registrationId: registration.id,
          status: typeof beginStatus === "string" ? beginStatus : "invalid",
        });

        return NextResponse.json(
          { success: false, error: "가상계좌 결제 대기 시간을 확보하지 못했습니다." },
          { status: 500 },
        );
      }

      checkoutAttemptId = beginPayload.attempt_id;
      mallReserved.set("checkout_method", "vbank");
      mallReserved.set("checkout_attempt_id", checkoutAttemptId);
    }

    const payload = createNicepayPaymentPayload({
      registration,
      userId: user.id,
      orderName: orderName || workshopTitle || registrationWorkshopTitle || "IYOHOUSE Workshop",
      origin,
      method,
      mallReserved,
    });

    if (checkoutAttemptId) {
      const returnUrl = new URL(String(payload.returnUrl));
      returnUrl.searchParams.set("checkout_attempt_id", checkoutAttemptId);
      payload.returnUrl = returnUrl.toString();
    }

    return NextResponse.json({
      success: true,
      scriptUrl: config.scriptUrl,
      payload,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("NICEPAY checkout API error:", error);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
