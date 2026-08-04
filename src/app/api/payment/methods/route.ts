import { NextResponse } from "next/server";
import { getNicepayAvailableCheckoutMethods } from "@/lib/payment/nicepay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getNicepayAvailableCheckoutMethods());
}
