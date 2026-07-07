import "server-only";

import { createClient as createSanityClient } from "next-sanity";

import { apiVersion, dataset, projectId } from "@/sanity/env";
import { getSupabaseServerClient } from "@/lib/supabase/admin";

type SanityScheduleSession = {
  _key?: string | null;
  date?: string | null;
  time?: string | null;
  capacity?: number | null;
};

type SanityScheduleWorkshop = {
  schedule?: SanityScheduleSession[] | null;
};

type RegistrationScheduleRow = {
  schedule_key: string | null;
  status: string | null;
  expires_at: string | null;
};

export type AdminScheduleOption = {
  key: string;
  label: string;
  date: string | null;
  time: string | null;
  capacity: number | null;
};

export type AdminScheduleCounts = Record<string, number>;

export type AdminWorkshopScheduleChangeData = {
  scheduleOptions: AdminScheduleOption[];
  scheduleCounts: AdminScheduleCounts;
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

function getScheduleKey(session: SanityScheduleSession) {
  const explicitKey = readString(session._key);
  if (explicitKey) return explicitKey;

  return [session.date, session.time]
    .map(readString)
    .filter(Boolean)
    .join("-");
}

function getScheduleLabel(session: SanityScheduleSession) {
  return [session.date, session.time].map(readString).filter(Boolean).join(" ");
}

function normalizeCapacity(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  const capacity = Math.round(value);
  return capacity > 0 ? capacity : null;
}

function isActiveRegistration(row: RegistrationScheduleRow) {
  if (row.status === "confirmed") return true;
  if (row.status !== "pending") return false;
  if (!row.expires_at) return false;

  return new Date(row.expires_at).getTime() > Date.now();
}

export async function getWorkshopScheduleChangeData(
  workshopId: string,
): Promise<AdminWorkshopScheduleChangeData> {
  const [workshop, registrationResult] = await Promise.all([
    sanityAdminClient.fetch<SanityScheduleWorkshop | null>(
      `*[_type == "workshop" && supabase_workshop_id == $workshopId][0] {
        schedule[]{
          _key,
          date,
          time,
          capacity
        }
      }`,
      { workshopId },
    ),
    getSupabaseServerClient()
      .from("workshop_registrations_v2")
      .select("schedule_key, status, expires_at")
      .eq("workshop_id", workshopId)
      .in("status", ["confirmed", "pending"]),
  ]);

  if (registrationResult.error) {
    throw new Error(`일정별 신청자 수를 불러오지 못했습니다: ${registrationResult.error.message}`);
  }

  const scheduleOptions = (workshop?.schedule ?? [])
    .map((session) => {
      const key = getScheduleKey(session);
      if (!key) return null;

      return {
        key,
        label: getScheduleLabel(session) || key,
        date: readString(session.date) || null,
        time: readString(session.time) || null,
        capacity: normalizeCapacity(session.capacity),
      } satisfies AdminScheduleOption;
    })
    .filter((item): item is AdminScheduleOption => Boolean(item));

  const scheduleCounts = (registrationResult.data ?? []).reduce<AdminScheduleCounts>((acc, row) => {
    if (!isActiveRegistration(row as RegistrationScheduleRow)) return acc;

    const key = readString(row.schedule_key);
    if (!key) return acc;

    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return { scheduleOptions, scheduleCounts };
}
