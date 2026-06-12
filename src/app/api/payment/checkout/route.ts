import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createNicepayPaymentPayload,
  getNicepayConfig,
  isNicepayConfigured,
} from "@/lib/payment/nicepay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckoutRequest = {
  registration_id?: string;
  orderName?: string;
  method?: string;
  scheduleLabel?: string;
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

export async function POST(request: Request) {
  try {
    const config = getNicepayConfig();

    if (!isNicepayConfigured(config)) {
      return NextResponse.json(
        { success: false, error: "NICEPAY 환경 변수가 설정되어 있지 않습니다." },
        { status: 500 },
      );
    }

    const supabase = await createClient();
    const { registration_id, orderName, method, scheduleLabel } = await request.json() as CheckoutRequest;

    if (!registration_id) {
      return NextResponse.json(
        { success: false, error: "신청 ID가 필요합니다." },
        { status: 400 },
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

    const workshopTitle = Array.isArray(registration.workshops)
      ? registration.workshops[0]?.title
      : registration.workshops?.title;

    const payload = createNicepayPaymentPayload({
      registration,
      userId: user.id,
      orderName: orderName || workshopTitle || "IYOHOUSE Workshop",
      origin,
      method,
      mallReserved,
    });

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
