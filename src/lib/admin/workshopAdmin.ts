import "server-only";

import { createClient as createSanityClient } from "next-sanity";
import { redirect } from "next/navigation";

import { apiVersion, dataset, projectId } from "@/sanity/env";
import { getSupabaseServerClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseSessionClient } from "@/lib/supabase/server";

type AdminSupabaseClient = ReturnType<typeof getSupabaseServerClient>;

type AdminSanityWorkshop = {
  _id: string;
  number?: number | null;
  title?: string | null;
  supabase_workshop_id?: string | null;
};

export type AdminWorkshopRow = {
  id: string | null;
  sanityId: string;
  number: number | null;
  title: string;
  status: string | null;
  capacity: number | null;
  start_at: string | null;
  end_at: string | null;
  created_at: string | null;
  confirmedCount: number;
  pendingCount: number;
  isSynced: boolean;
};

export type AdminApplicantRow = {
  id: string;
  status: string;
  snapshot_name: string | null;
  snapshot_email: string | null;
  snapshot_phone: string | null;
  snapshot_bio?: string | null;
  created_at: string | null;
  schedule_key?: string | null;
  schedule_label?: string | null;
  schedule_date?: string | null;
  schedule_time?: string | null;
};

export type AdminApplicantGroup = {
  label: string;
  applicants: AdminApplicantRow[];
};

const sanityAdminClient = createSanityClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
});

const ADMIN_TIME_ZONE = "Asia/Seoul";

function getPublishedId(id: string) {
  return id.replace(/^drafts\./, "");
}

function dedupeSanityWorkshops(workshops: AdminSanityWorkshop[]) {
  const byPublishedId = new Map<string, AdminSanityWorkshop>();
  const supabaseIdByPublishedId = new Map<string, string>();

  for (const workshop of workshops) {
    const publishedId = getPublishedId(workshop._id);
    const existing = byPublishedId.get(publishedId);
    const isDraft = workshop._id.startsWith("drafts.");
    const existingIsDraft = existing?._id.startsWith("drafts.");

    if (workshop.supabase_workshop_id) {
      supabaseIdByPublishedId.set(publishedId, workshop.supabase_workshop_id);
    }

    if (!existing || (isDraft && !existingIsDraft)) {
      byPublishedId.set(publishedId, workshop);
    }
  }

  return Array.from(byPublishedId.entries()).map(([publishedId, workshop]) => ({
    ...workshop,
    _id: publishedId,
    supabase_workshop_id: workshop.supabase_workshop_id || supabaseIdByPublishedId.get(publishedId) || null,
  }));
}

async function getCurrentSanityWorkshops() {
  const workshops = await sanityAdminClient.fetch<AdminSanityWorkshop[]>(
    `*[_type == "workshop"] | order(number desc) {
      _id,
      number,
      title,
      supabase_workshop_id
    }`,
  );

  return dedupeSanityWorkshops(workshops);
}

export async function requireAdminClient(): Promise<AdminSupabaseClient> {
  const authClient = await createSupabaseSessionClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const adminClient = getSupabaseServerClient();
  const { data: profile, error } = await adminClient
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile?.is_super_admin) {
    redirect("/");
  }

  return adminClient;
}

export async function getAdminWorkshops() {
  const adminClient = await requireAdminClient();
  const sanityWorkshops = await getCurrentSanityWorkshops();
  const supabaseIds = sanityWorkshops
    .map((workshop) => workshop.supabase_workshop_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const { data: workshops, error: workshopsError } = supabaseIds.length
    ? await adminClient
    .from("workshops")
    .select("id, title, status, capacity, start_at, end_at, created_at")
        .in("id", supabaseIds)
    : { data: [], error: null };

  if (workshopsError) {
    throw new Error(`워크숍 목록을 불러오지 못했습니다: ${workshopsError.message}`);
  }

  const runtimeMap = new Map((workshops ?? []).map((workshop) => [workshop.id, workshop]));
  const workshopIds = supabaseIds;

  if (workshopIds.length === 0) {
    return sanityWorkshops.map((workshop) => ({
      id: null,
      sanityId: workshop._id,
      number: workshop.number ?? null,
      title: workshop.title || `Workshop #${workshop.number || workshop._id}`,
      status: "DB 미동기화",
      capacity: null,
      start_at: null,
      end_at: null,
      created_at: null,
      confirmedCount: 0,
      pendingCount: 0,
      isSynced: false,
    }));
  }

  const { data: registrations, error: registrationsError } = await adminClient
    .from("workshop_registrations_v2")
    .select("workshop_id, status")
    .in("workshop_id", workshopIds)
    .in("status", ["pending", "confirmed"]);

  if (registrationsError) {
    throw new Error(`신청자 수를 불러오지 못했습니다: ${registrationsError.message}`);
  }

  const countMap = new Map<string, { confirmed: number; pending: number }>();

  for (const registration of registrations ?? []) {
    const workshopId = String(registration.workshop_id);
    const current = countMap.get(workshopId) ?? { confirmed: 0, pending: 0 };

    if (registration.status === "confirmed") {
      current.confirmed += 1;
    }

    if (registration.status === "pending") {
      current.pending += 1;
    }

    countMap.set(workshopId, current);
  }

  return sanityWorkshops.map((sanityWorkshop) => {
    const supabaseId = sanityWorkshop.supabase_workshop_id || null;
    const runtime = supabaseId ? runtimeMap.get(supabaseId) : null;
    const counts = supabaseId ? countMap.get(supabaseId) ?? { confirmed: 0, pending: 0 } : { confirmed: 0, pending: 0 };

    return {
      id: supabaseId,
      sanityId: sanityWorkshop._id,
      number: sanityWorkshop.number ?? null,
      title: sanityWorkshop.title || runtime?.title || `Workshop #${sanityWorkshop.number || sanityWorkshop._id}`,
      status: runtime?.status ?? (supabaseId ? "DB 행 없음" : "DB 미동기화"),
      capacity: runtime?.capacity ?? null,
      start_at: runtime?.start_at ?? null,
      end_at: runtime?.end_at ?? null,
      created_at: runtime?.created_at ?? null,
      confirmedCount: counts.confirmed,
      pendingCount: counts.pending,
      isSynced: Boolean(runtime),
    };
  });
}

export async function getAdminWorkshopApplicants(workshopId: string) {
  const adminClient = await requireAdminClient();
  const { data: workshop, error: workshopError } = await adminClient
    .from("workshops")
    .select("id, title, status, capacity, start_at, end_at, created_at")
    .eq("id", workshopId)
    .maybeSingle();

  if (workshopError) {
    throw new Error(`워크숍 정보를 불러오지 못했습니다: ${workshopError.message}`);
  }

  if (!workshop) {
    return null;
  }

  const baseSelect = "id, status, snapshot_name, snapshot_email, snapshot_phone, snapshot_bio, created_at";
  const fallbackBaseSelect = "id, status, snapshot_name, snapshot_email, snapshot_phone, created_at";
  const scheduleSelect = `${baseSelect}, schedule_key, schedule_label, schedule_date, schedule_time`;
  let applicantRows: AdminApplicantRow[] = [];

  const withSchedule = await adminClient
    .from("workshop_registrations_v2")
    .select(scheduleSelect)
    .eq("workshop_id", workshopId)
    .eq("status", "confirmed")
    .order("created_at", { ascending: true });

  if (withSchedule.error) {
    const message = withSchedule.error.message ?? "";

    if (!message.includes("schedule_") && !message.includes("snapshot_bio")) {
      throw new Error(`신청자 목록을 불러오지 못했습니다: ${message}`);
    }

    const fallback = await adminClient
      .from("workshop_registrations_v2")
      .select(fallbackBaseSelect)
      .eq("workshop_id", workshopId)
      .eq("status", "confirmed")
      .order("created_at", { ascending: true });

    if (fallback.error) {
      throw new Error(`신청자 목록을 불러오지 못했습니다: ${fallback.error.message}`);
    }

    applicantRows = (fallback.data ?? []) as AdminApplicantRow[];
  } else {
    applicantRows = (withSchedule.data ?? []) as AdminApplicantRow[];
  }

  return {
    workshop: {
      ...(workshop as Omit<AdminWorkshopRow, "confirmedCount" | "pendingCount" | "sanityId" | "number" | "isSynced">),
      sanityId: "",
      number: null,
      isSynced: true,
    },
    groups: groupApplicantsBySchedule(applicantRows),
    applicantCount: applicantRows.length,
  };
}

function getScheduleGroupLabel(applicant: AdminApplicantRow) {
  if (applicant.schedule_label) {
    return applicant.schedule_label;
  }

  const fallback = [applicant.schedule_date, applicant.schedule_time].filter(Boolean).join(" ");

  return fallback || "일정 미지정";
}

export function groupApplicantsBySchedule(applicants: AdminApplicantRow[]) {
  const groups = new Map<string, AdminApplicantRow[]>();

  for (const applicant of applicants) {
    const label = getScheduleGroupLabel(applicant);
    const current = groups.get(label) ?? [];
    current.push(applicant);
    groups.set(label, current);
  }

  return Array.from(groups.entries()).map(([label, rows]) => ({
    label,
    applicants: rows,
  }));
}

export function formatAdminDate(value: string | null | undefined) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: ADMIN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function formatAdminDateTime(value: string | null | undefined) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: ADMIN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
