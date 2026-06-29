import "server-only";

import { createClient as createSanityClient } from "next-sanity";

import { apiVersion, dataset, projectId } from "@/sanity/env";

type AdminSupabaseClient = any;

export type AdminWorkshopEmailTemplate = {
  subject: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
};

export type AdminWorkshopEmailRecipient = {
  id: string;
  name: string;
  email: string;
  schedule: string;
};

const sanityAdminClient = createSanityClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
});

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normalizeEmailTemplate(value: unknown): AdminWorkshopEmailTemplate | null {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const subject = readString(input.subject);
  const body = readString(input.body);

  if (!subject || !body) {
    return null;
  }

  return {
    subject,
    body,
    ctaLabel: readString(input.ctaLabel),
    ctaUrl: readString(input.ctaUrl),
  };
}

export async function getWorkshopApplicantEmailTemplate(workshopId: string) {
  const document = await sanityAdminClient.fetch<{
    _id: string;
    title?: string | null;
    applicantEmailTemplate?: unknown;
  } | null>(
    `*[_type == "workshop" && supabase_workshop_id == $workshopId && !(_id in path("drafts.**"))][0] {
      _id,
      title,
      applicantEmailTemplate
    }`,
    { workshopId },
  );

  return {
    sanityId: document?._id ?? null,
    title: document?.title ?? null,
    template: normalizeEmailTemplate(document?.applicantEmailTemplate),
  };
}

function getScheduleLabel(row: Record<string, unknown>) {
  const explicit = readString(row.schedule_label);
  if (explicit) return explicit;

  return [readString(row.schedule_date), readString(row.schedule_time)].filter(Boolean).join(" ");
}

export async function getConfirmedWorkshopEmailRecipients(
  adminClient: AdminSupabaseClient,
  workshopId: string,
  registrationIds?: string[],
): Promise<AdminWorkshopEmailRecipient[]> {
  let query = adminClient
    .from("workshop_registrations_v2")
    .select("id, snapshot_name, snapshot_email, schedule_label, schedule_date, schedule_time")
    .eq("workshop_id", workshopId)
    .eq("status", "confirmed");

  if (registrationIds?.length) {
    query = query.in("id", registrationIds);
  }

  const { data, error } = await query.order("created_at", { ascending: true });

  if (error) {
    throw new Error(`확정 신청자 이메일 목록을 불러오지 못했습니다: ${error.message}`);
  }

  const shouldDedupeEmails = !registrationIds?.length;
  const seenEmails = new Set<string>();
  const recipients: AdminWorkshopEmailRecipient[] = [];

  for (const row of data ?? []) {
    const email = readString(row.snapshot_email).toLowerCase();
    if (!email || !isValidEmail(email)) continue;
    if (shouldDedupeEmails && seenEmails.has(email)) continue;

    seenEmails.add(email);
    recipients.push({
      id: readString(row.id),
      name: readString(row.snapshot_name) || "신청자",
      email,
      schedule: getScheduleLabel(row) || "일정 미지정",
    });
  }

  return recipients;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function applyTemplate(value: string, recipient: AdminWorkshopEmailRecipient, workshopTitle: string) {
  return value
    .replaceAll("{name}", recipient.name)
    .replaceAll("{workshopTitle}", workshopTitle)
    .replaceAll("{schedule}", recipient.schedule);
}

export function renderWorkshopEmail(
  template: AdminWorkshopEmailTemplate,
  recipient: AdminWorkshopEmailRecipient,
  workshopTitle: string,
) {
  const subject = applyTemplate(template.subject, recipient, workshopTitle).replace(/[\r\n]+/g, " ");
  const text = applyTemplate(template.body, recipient, workshopTitle);
  const bodyHtml = escapeHtml(text).replace(/\n/g, "<br />");
  const buttonHtml = template.ctaUrl
    ? `<p style="margin-top:24px;"><a href="${escapeHtml(template.ctaUrl)}" style="display:inline-block;padding:12px 16px;background:#000;color:#fff;text-decoration:none;">${escapeHtml(template.ctaLabel || "링크 열기")}</a></p>`
    : "";

  return {
    subject,
    text,
    html: `
      <div style="font-family:serif;line-height:1.7;color:#111;">
        <p style="margin:0 0 18px;font-weight:700;">IYOHOUSE</p>
        <div>${bodyHtml}</div>
        ${buttonHtml}
      </div>
    `,
  };
}
