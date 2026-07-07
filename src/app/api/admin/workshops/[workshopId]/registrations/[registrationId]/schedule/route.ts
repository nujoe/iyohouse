import { NextResponse } from "next/server";

import { verifyAdminAccess } from "@/app/api/admin/_auth";
import { getWorkshopScheduleChangeData } from "@/lib/admin/workshopScheduleChange";
import { getSupabaseServerClient } from "@/lib/supabase/admin";

type ScheduleChangeRequest = {
  scheduleKey?: unknown;
};

type RouteContext = {
  params: Promise<{
    workshopId: string;
    registrationId: string;
  }>;
};

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getErrorStatus(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("full")) return 409;
  if (lower.includes("not found")) return 404;
  if (lower.includes("required") || lower.includes("capacity")) return 400;

  return 500;
}

export async function PATCH(request: Request, context: RouteContext) {
  const adminAccess = await verifyAdminAccess(request);

  if (!adminAccess.ok) {
    return adminAccess.response;
  }

  const { workshopId, registrationId } = await context.params;
  const body = (await request.json()) as ScheduleChangeRequest;
  const scheduleKey = readString(body.scheduleKey);

  if (!workshopId || !registrationId || !scheduleKey) {
    return NextResponse.json(
      { success: false, error: "워크숍, 신청자, 변경할 일정 정보가 필요합니다." },
      { status: 400 },
    );
  }

  const { scheduleOptions } = await getWorkshopScheduleChangeData(workshopId);
  const schedule = scheduleOptions.find((option) => option.key === scheduleKey);

  if (!schedule) {
    return NextResponse.json(
      { success: false, error: "Sanity에 등록된 일정만 선택할 수 있습니다." },
      { status: 400 },
    );
  }

  const adminClient = getSupabaseServerClient();
  const { data, error } = await adminClient.rpc("admin_change_registration_schedule", {
    p_workshop_id: workshopId,
    p_registration_id: registrationId,
    p_schedule_key: scheduleKey,
    p_schedule_label: schedule.label,
    p_schedule_date: schedule.date,
    p_schedule_time: schedule.time,
  });

  if (error) {
    const message = error.message || "일정 변경에 실패했습니다.";

    return NextResponse.json(
      { success: false, error: message },
      { status: getErrorStatus(message) },
    );
  }

  return NextResponse.json({ success: true, registration: data });
}
