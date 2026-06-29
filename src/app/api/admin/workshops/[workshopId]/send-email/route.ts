import { NextResponse } from "next/server";
import { Resend } from "resend";

import { verifyAdminAccess } from "@/app/api/admin/_auth";
import {
  getConfirmedWorkshopEmailRecipients,
  getWorkshopApplicantEmailTemplate,
  renderWorkshopEmail,
} from "@/lib/admin/workshopEmail";
import { SITE_EMAIL } from "@/lib/site";
import { getSupabaseServerClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workshopId: string;
  }>;
};

function readExpectedRecipientCount(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await verifyAdminAccess(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => null);
    const expectedRecipientCount = readExpectedRecipientCount(
      (body as Record<string, unknown> | null)?.expectedRecipientCount,
    );

    if (expectedRecipientCount === null) {
      return NextResponse.json(
        { success: false, error: "expectedRecipientCount is required." },
        { status: 400 },
      );
    }

    const { workshopId } = await context.params;
    const adminClient = getSupabaseServerClient();
    const { data: workshop, error: workshopError } = await adminClient
      .from("workshops")
      .select("id, title")
      .eq("id", workshopId)
      .maybeSingle();

    if (workshopError) {
      return NextResponse.json(
        { success: false, error: `워크숍 정보를 불러오지 못했습니다: ${workshopError.message}` },
        { status: 500 },
      );
    }

    if (!workshop) {
      return NextResponse.json({ success: false, error: "워크숍을 찾을 수 없습니다." }, { status: 404 });
    }

    const [{ template, title: sanityTitle }, recipients] = await Promise.all([
      getWorkshopApplicantEmailTemplate(workshopId),
      getConfirmedWorkshopEmailRecipients(adminClient, workshopId),
    ]);

    if (!template) {
      return NextResponse.json(
        { success: false, error: "Sanity에 확정 신청자 이메일 템플릿 제목과 본문을 먼저 입력해 주세요." },
        { status: 400 },
      );
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { success: false, error: "발송 가능한 확정 신청자 이메일이 없습니다." },
        { status: 400 },
      );
    }

    if (recipients.length !== expectedRecipientCount) {
      return NextResponse.json(
        {
          success: false,
          error: "확정 신청자 수가 화면 표시와 달라졌습니다. 페이지를 새로고침한 뒤 다시 확인해 주세요.",
          expectedRecipientCount,
          actualRecipientCount: recipients.length,
        },
        { status: 409 },
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "RESEND_API_KEY가 설정되어 있지 않습니다." },
        { status: 500 },
      );
    }

    const from = process.env.WORKSHOP_EMAIL_FROM || process.env.CONTACT_EMAIL_FROM || "IYOHOUSE <onboarding@resend.dev>";
    const replyTo = process.env.WORKSHOP_EMAIL_REPLY_TO || process.env.CONTACT_EMAIL_TO || SITE_EMAIL;
    const resend = new Resend(apiKey);
    const workshopTitle = sanityTitle || workshop.title || "IYOHOUSE workshop";
    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      const rendered = renderWorkshopEmail(template, recipient, workshopTitle);
      const { error } = await resend.emails.send({
        from,
        to: [recipient.email],
        replyTo,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      if (error) {
        failedCount += 1;
        console.error("Admin workshop email delivery failed", {
          workshopId,
          recipientId: recipient.id,
          error,
        });
      } else {
        sentCount += 1;
      }
    }

    return NextResponse.json(
      {
        success: failedCount === 0,
        recipientCount: recipients.length,
        sentCount,
        failedCount,
      },
      { status: failedCount === 0 ? 200 : 207 },
    );
  } catch (error) {
    console.error("Admin workshop email API error", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "이메일 발송 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
