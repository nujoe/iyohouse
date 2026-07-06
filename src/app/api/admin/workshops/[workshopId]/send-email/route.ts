import { NextResponse } from "next/server";
import { Resend } from "resend";

import { verifyAdminAccess } from "@/app/api/admin/_auth";
import {
  getConfirmedWorkshopEmailRecipients,
  getWorkshopScheduleEmailTemplates,
  renderWorkshopEmail,
  selectWorkshopEmailTemplate,
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

const MAX_BATCH_EMAILS = 100;
const MAX_BATCH_RETRIES = 3;
const BATCH_REQUEST_SPACING_MS = 650;

function readExpectedRecipientCount(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function readSelectedRegistrationIds(value: unknown) {
  if (!Array.isArray(value)) return null;

  const ids = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return Array.from(new Set(ids));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number) {
  return 1000 * (2 ** attempt);
}

function isRateLimitError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const record = error as Record<string, unknown>;
  const statusCode = record.statusCode ?? record.status;
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";

  return statusCode === 429 || message.includes("rate limit") || message.includes("too many requests");
}

function chunkEmails<T>(items: T[], size = MAX_BATCH_EMAILS) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function sendWorkshopEmailBatchWithRetry(
  resend: Resend,
  emails: Array<{
    from: string;
    to: string[];
    replyTo: string;
    subject: string;
    html: string;
    text: string;
  }>,
) {
  for (let attempt = 0; attempt <= MAX_BATCH_RETRIES; attempt += 1) {
    const { data, error } = await resend.batch.send(emails, {
      batchValidation: "permissive",
    });

    if (!error) {
      return {
        sentCount: data?.data?.length ?? 0,
        failedCount: data?.errors?.length ?? 0,
        errors: data?.errors ?? [],
      };
    }

    if (!isRateLimitError(error) || attempt === MAX_BATCH_RETRIES) {
      return {
        sentCount: 0,
        failedCount: emails.length,
        errors: [{ index: -1, message: error.message || "Batch email delivery failed" }],
      };
    }

    await sleep(retryDelayMs(attempt));
  }

  return {
    sentCount: 0,
    failedCount: emails.length,
    errors: [{ index: -1, message: "Batch email delivery failed after retries" }],
  };
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await verifyAdminAccess(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => null);
    const expectedRecipientCount = readExpectedRecipientCount(
      (body as Record<string, unknown> | null)?.expectedRecipientCount,
    );
    const selectedRegistrationIds = readSelectedRegistrationIds(
      (body as Record<string, unknown> | null)?.selectedRegistrationIds,
    );

    if (expectedRecipientCount === null) {
      return NextResponse.json(
        { success: false, error: "expectedRecipientCount is required." },
        { status: 400 },
      );
    }

    if (!selectedRegistrationIds?.length) {
      return NextResponse.json(
        { success: false, error: "selectedRegistrationIds is required." },
        { status: 400 },
      );
    }

    if (selectedRegistrationIds.length !== expectedRecipientCount) {
      return NextResponse.json(
        {
          success: false,
          error: "선택한 신청자 수가 화면 표시와 달라졌습니다. 다시 선택해 주세요.",
          expectedRecipientCount,
          selectedRecipientCount: selectedRegistrationIds.length,
        },
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

    const [{ fallbackTemplate, scheduleEmailTemplates, title: sanityTitle }, recipients] = await Promise.all([
      getWorkshopScheduleEmailTemplates(workshopId),
      getConfirmedWorkshopEmailRecipients(adminClient, workshopId, selectedRegistrationIds),
    ]);

    const missingTemplateRecipients = recipients.filter((recipient) =>
      !selectWorkshopEmailTemplate(fallbackTemplate, scheduleEmailTemplates, recipient),
    );

    if (missingTemplateRecipients.length > 0) {
      return NextResponse.json(
        { success: false, error: "Sanity에 선택한 신청자 일정 이메일 템플릿 또는 공통 이메일 템플릿 제목과 본문을 먼저 입력해 주세요." },
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
          error: "선택한 신청자 중 발송 가능한 확정 신청자 수가 달라졌습니다. 페이지를 새로고침한 뒤 다시 확인해 주세요.",
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
    const deliveryErrors: Array<{ index: number; message: string }> = [];

    const emailPayloads = recipients.map((recipient) => {
      const template = selectWorkshopEmailTemplate(fallbackTemplate, scheduleEmailTemplates, {
        scheduleKey: recipient.scheduleKey,
      });
      if (!template) {
        throw new Error("선택한 신청자에게 사용할 이메일 템플릿을 찾을 수 없습니다.");
      }
      const rendered = renderWorkshopEmail(template, recipient, workshopTitle);

      return {
        from,
        to: [recipient.email],
        replyTo,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        recipientId: recipient.id,
      };
    });

    for (const chunk of chunkEmails(emailPayloads)) {
      const result = await sendWorkshopEmailBatchWithRetry(
        resend,
        chunk.map(({ recipientId: _recipientId, ...email }) => email),
      );

      sentCount += result.sentCount;
      failedCount += result.failedCount;
      deliveryErrors.push(...result.errors);

      for (const error of result.errors) {
        const recipientId = error.index >= 0 ? chunk[error.index]?.recipientId : undefined;
        console.error("Admin workshop email delivery failed", {
          workshopId,
          recipientId,
          error,
        });
      }

      if (emailPayloads.length > MAX_BATCH_EMAILS) {
        await sleep(BATCH_REQUEST_SPACING_MS);
      }
    }

    if (sentCount + failedCount !== recipients.length) {
      const unknownCount = recipients.length - sentCount - failedCount;

      if (unknownCount > 0) {
        failedCount += unknownCount;
        console.error("Admin workshop email delivery had unknown outcomes", {
          workshopId,
          unknownCount,
          deliveryErrors,
        });
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
