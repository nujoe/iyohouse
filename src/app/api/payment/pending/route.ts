import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PendingRegistration = {
  id: string;
  user_id: string;
  amount: number;
  status: "pending" | "confirmed" | "cancelled" | "expired";
  snapshot_workshop_title?: string | null;
};

type VirtualAccountPayment = {
  vbank_name: string | null;
  vbank_number: string | null;
  vbank_holder: string | null;
  expires_at: string | null;
};

export async function GET(request: Request) {
  try {
    const sessionClient = await createClient();
    const { data: { user }, error: authError } = await sessionClient.auth.getUser();

    if (!user || authError) {
      return NextResponse.json(
        { success: false, error: "인증되지 않은 사용자입니다." },
        { status: 401 },
      );
    }

    const orderId = new URL(request.url).searchParams.get("order_id")?.trim() || "";

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "주문번호가 필요합니다." },
        { status: 400 },
      );
    }

    const adminClient = getSupabaseServerClient();
    const { data: registration, error: registrationError } = await adminClient
      .from("workshop_registrations_v2")
      .select("id, user_id, amount, status, snapshot_workshop_title")
      .eq("order_id", orderId)
      .eq("user_id", user.id)
      .maybeSingle<PendingRegistration>();

    if (registrationError) {
      throw registrationError;
    }

    if (!registration) {
      const { data: existingOrder, error: existingOrderError } = await adminClient
        .from("workshop_registrations_v2")
        .select("id")
        .eq("order_id", orderId)
        .maybeSingle<{ id: string }>();

      if (existingOrderError) {
        throw existingOrderError;
      }

      return NextResponse.json(
        {
          success: false,
          error: existingOrder
            ? "본인의 주문만 조회할 수 있습니다."
            : "신청 내역을 찾을 수 없습니다.",
        },
        { status: existingOrder ? 403 : 404 },
      );
    }

    const { data: payment, error: paymentError } = await adminClient
      .from("payments")
      .select("vbank_name, vbank_number, vbank_holder, expires_at")
      .eq("registration_id", registration.id)
      .eq("payment_method", "가상계좌")
      .maybeSingle<VirtualAccountPayment>();

    if (paymentError) {
      throw paymentError;
    }

    const exposeAccount = registration.status === "pending";

    return NextResponse.json({
      status: registration.status,
      amount: Number(registration.amount),
      workshopTitle: registration.snapshot_workshop_title || "",
      vbankName: exposeAccount ? payment?.vbank_name || null : null,
      vbankNumber: exposeAccount ? payment?.vbank_number || null : null,
      vbankHolder: exposeAccount ? payment?.vbank_holder || null : null,
      expiresAt: exposeAccount ? payment?.expires_at || null : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("NICEPAY pending payment API error:", message);

    return NextResponse.json(
      { success: false, error: "결제 대기 정보를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
