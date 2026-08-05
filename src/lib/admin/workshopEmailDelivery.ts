import "server-only";

export type AdminWorkshopEmailDeliveryStatus = "sent" | "delivered" | "failed" | "bounced";

export type AdminWorkshopEmailStatus = {
  status: AdminWorkshopEmailDeliveryStatus;
  sentAt: string;
  updatedAt: string;
};

export type WorkshopEmailBatchOutcome = {
  index: number;
  status: "sent" | "failed";
  providerMessageId: string | null;
  failureReason: string | null;
};

type WorkshopEmailBatchResult = {
  data?: {
    data?: Array<{ id?: unknown }>;
  } | null;
  errors?: Array<{ index?: unknown; message?: unknown }> | null;
};

type AdminSupabaseClient = any;

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveWorkshopEmailBatchOutcomes(
  result: WorkshopEmailBatchResult,
  recipientCount: number,
): WorkshopEmailBatchOutcome[] {
  const errorsByIndex = new Map<number, string>();
  let globalFailureReason: string | null = null;

  for (const error of result.errors ?? []) {
    const message = readText(error.message) || "Batch email delivery failed";
    const index = typeof error.index === "number" && Number.isInteger(error.index) ? error.index : -1;

    if (index < 0) {
      globalFailureReason = message;
    } else {
      errorsByIndex.set(index, message);
    }
  }

  const providerMessageIds = (result.data?.data ?? []).map((item) => {
    const id = readText(item?.id);
    return id || null;
  });
  let successfulIdIndex = 0;

  return Array.from({ length: recipientCount }, (_, index) => {
    const failureReason = errorsByIndex.get(index) || globalFailureReason;

    if (failureReason) {
      return {
        index,
        status: "failed",
        providerMessageId: null,
        failureReason,
      };
    }

    const providerMessageId = providerMessageIds[successfulIdIndex] ?? null;
    successfulIdIndex += 1;

    return {
      index,
      status: "sent",
      providerMessageId,
      failureReason: null,
    };
  });
}

export type WorkshopEmailDeliveryLogRow = {
  workshop_id: string;
  registration_id: string;
  recipient_email: string;
  recipient_name: string | null;
  template_key: string | null;
  subject: string;
  status: "sent" | "failed";
  provider_message_id: string | null;
  batch_id: string;
  failure_reason: string | null;
  sent_by: string | null;
};

export async function recordWorkshopEmailDeliveryLogs(
  adminClient: AdminSupabaseClient,
  rows: WorkshopEmailDeliveryLogRow[],
) {
  if (rows.length === 0) return;

  const { error } = await adminClient
    .from("workshop_email_delivery_logs")
    .upsert(rows, { onConflict: "batch_id,registration_id" });

  if (error) {
    throw new Error(`워크숍 이메일 발송 이력을 저장하지 못했습니다: ${error.message}`);
  }
}

export async function getLatestWorkshopEmailStatuses(
  adminClient: AdminSupabaseClient,
  workshopId: string,
  registrationIds: string[],
): Promise<Record<string, AdminWorkshopEmailStatus>> {
  if (registrationIds.length === 0) return {};

  const { data, error } = await adminClient
    .from("workshop_email_delivery_logs")
    .select("registration_id, status, sent_at, updated_at")
    .eq("workshop_id", workshopId)
    .in("registration_id", registrationIds)
    .order("sent_at", { ascending: false });

  if (error) {
    throw new Error(`워크숍 이메일 발송 이력을 불러오지 못했습니다: ${error.message}`);
  }

  const statuses: Record<string, AdminWorkshopEmailStatus> = {};

  for (const row of data ?? []) {
    const registrationId = readText(row.registration_id);
    const status = readText(row.status) as AdminWorkshopEmailDeliveryStatus;
    const sentAt = readText(row.sent_at);
    const updatedAt = readText(row.updated_at);

    if (!registrationId || !sentAt || !updatedAt || statuses[registrationId]) continue;
    if (!["sent", "delivered", "failed", "bounced"].includes(status)) continue;

    statuses[registrationId] = { status, sentAt, updatedAt };
  }

  return statuses;
}
