"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AdminWorkshopEmailPanel from "@/components/admin/AdminWorkshopEmailPanel";

type AdminWorkshopEmailTemplate = {
  subject: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
};

type AdminApplicantRow = {
  id: string;
  status: string;
  snapshot_name: string | null;
  snapshot_email: string | null;
  snapshot_phone: string | null;
  snapshot_bio?: string | null;
  price_type?: string | null;
  created_at: string | null;
  payment_amount?: number | null;
  payment_method?: string | null;
  schedule_key?: string | null;
  schedule_label?: string | null;
  schedule_date?: string | null;
  schedule_time?: string | null;
};

type AdminApplicantGroup = {
  label: string;
  applicants: AdminApplicantRow[];
};

type AdminPendingVirtualAccountRow = {
  id: string;
  snapshot_name: string | null;
  snapshot_email: string | null;
  amount: number;
  vbank_name: string | null;
  masked_vbank_number: string;
  expires_at: string;
};

type AdminScheduleOption = {
  key: string;
  label: string;
  date: string | null;
  time: string | null;
  capacity: number | null;
};

type AdminScheduleCounts = Record<string, number>;

type AdminWorkshopApplicantsClientProps = {
  applicantCount: number;
  cancelledCount: number;
  cancelledGroups: AdminApplicantGroup[];
  emailTemplate: AdminWorkshopEmailTemplate | null;
  groups: AdminApplicantGroup[];
  pendingVirtualAccounts: AdminPendingVirtualAccountRow[];
  scheduleCounts: AdminScheduleCounts;
  scheduleOptions: AdminScheduleOption[];
  workshopId: string;
};

function formatAdminDateTime(value: string | null | undefined) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function mergeIds(currentIds: string[], idsToAdd: string[]) {
  return Array.from(new Set([...currentIds, ...idsToAdd]));
}

function renderPendingVirtualAccountSection(pendingVirtualAccounts: AdminPendingVirtualAccountRow[]) {
  if (pendingVirtualAccounts.length === 0) return null;

  return (
    <section className="admin-section admin-virtual-account-section">
      <div className="admin-section-header">
        <h2>가상계좌 입금 대기</h2>
        <span>{pendingVirtualAccounts.length}명</span>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table admin-virtual-account-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>이메일</th>
              <th className="admin-virtual-account-amount-cell">결제금액</th>
              <th>은행</th>
              <th className="admin-virtual-account-number-cell">계좌번호</th>
              <th className="admin-virtual-account-expiry-cell">입금기한</th>
            </tr>
          </thead>
          <tbody>
            {pendingVirtualAccounts.map((account) => (
              <tr key={account.id}>
                <td>{account.snapshot_name || "-"}</td>
                <td>{account.snapshot_email || "-"}</td>
                <td className="admin-virtual-account-amount-cell">{account.amount.toLocaleString()}원</td>
                <td>{account.vbank_name || "-"}</td>
                <td className="admin-virtual-account-number-cell">{account.masked_vbank_number}</td>
                <td className="admin-virtual-account-expiry-cell">{formatAdminDateTime(account.expires_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AdminWorkshopApplicantsClient({
  applicantCount,
  cancelledCount,
  cancelledGroups,
  emailTemplate,
  groups,
  pendingVirtualAccounts,
  scheduleCounts,
  scheduleOptions,
  workshopId,
}: AdminWorkshopApplicantsClientProps) {
  const router = useRouter();
  const [selectedRegistrationIds, setSelectedRegistrationIds] = useState<string[]>([]);
  const [pendingScheduleByRegistration, setPendingScheduleByRegistration] = useState<Record<string, string>>({});
  const [changingRegistrationId, setChangingRegistrationId] = useState<string | null>(null);
  const [scheduleChangeMessage, setScheduleChangeMessage] = useState<{ success: boolean; text: string } | null>(null);
  const allRegistrationIds = useMemo(
    () => groups.flatMap((group) => group.applicants.map((applicant) => applicant.id)),
    [groups],
  );
  const selectedApplicantCount = selectedRegistrationIds.length;
  const hasCancelledApplicants = cancelledCount > 0;

  function toggleApplicantSelection(registrationId: string) {
    setSelectedRegistrationIds((currentIds) => {
      if (currentIds.includes(registrationId)) {
        return currentIds.filter((id) => id !== registrationId);
      }

      return [...currentIds, registrationId];
    });
  }

  function toggleGroupSelection(groupIds: string[]) {
    setSelectedRegistrationIds((currentIds) => {
      const isEveryGroupApplicantSelected = groupIds.every((id) => currentIds.includes(id));

      if (isEveryGroupApplicantSelected) {
        return currentIds.filter((id) => !groupIds.includes(id));
      }

      return mergeIds(currentIds, groupIds);
    });
  }

  function toggleAllSelection() {
    setSelectedRegistrationIds((currentIds) => (
      currentIds.length === allRegistrationIds.length ? [] : allRegistrationIds
    ));
  }

  function getSelectedScheduleKey(applicant: AdminApplicantRow) {
    return pendingScheduleByRegistration[applicant.id] ?? applicant.schedule_key ?? "";
  }

  function isScheduleFullForApplicant(schedule: AdminScheduleOption, applicant: AdminApplicantRow) {
    if (schedule.key === applicant.schedule_key) return false;
    if (typeof schedule.capacity !== "number") return false;

    return (scheduleCounts[schedule.key] ?? 0) >= schedule.capacity;
  }

  async function changeApplicantSchedule(applicant: AdminApplicantRow) {
    const scheduleKey = getSelectedScheduleKey(applicant);
    const schedule = scheduleOptions.find((option) => option.key === scheduleKey);

    if (!schedule) {
      setScheduleChangeMessage({ success: false, text: "변경할 일정을 선택해 주세요." });
      return;
    }

    if (schedule.key === applicant.schedule_key) {
      setScheduleChangeMessage({ success: false, text: "현재 일정과 동일합니다." });
      return;
    }

    setChangingRegistrationId(applicant.id);
    setScheduleChangeMessage(null);

    try {
      const response = await fetch(
        `/api/admin/workshops/${encodeURIComponent(workshopId)}/registrations/${encodeURIComponent(applicant.id)}/schedule`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduleKey: schedule.key,
            scheduleLabel: schedule.label,
            scheduleDate: schedule.date,
            scheduleTime: schedule.time,
          }),
        },
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message = payload?.error || "일정 변경에 실패했습니다.";
        throw new Error(message.includes("full") ? "해당 일정은 정원이 가득 찼습니다." : message);
      }

      setScheduleChangeMessage({ success: true, text: "일정을 변경했습니다." });
      router.refresh();
    } catch (error) {
      setScheduleChangeMessage({
        success: false,
        text: error instanceof Error ? error.message : "일정 변경에 실패했습니다.",
      });
    } finally {
      setChangingRegistrationId(null);
    }
  }

  function getNameClassName(applicant: AdminApplicantRow) {
    return [
      "admin-applicant-name",
      applicant.price_type === "student" ? "is-student-discount" : "",
    ].filter(Boolean).join(" ");
  }

  function renderReadOnlyApplicantRows(applicants: AdminApplicantRow[]) {
    return applicants.map((applicant, index) => (
      <tr className="admin-cancelled-applicant-row" key={applicant.id}>
        <td>{index + 1}</td>
        <td>
          <span className="admin-status-badge">취소/환불</span>
          <span className={getNameClassName(applicant)}>{applicant.snapshot_name || "-"}</span>
        </td>
        <td>{applicant.snapshot_email || "-"}</td>
        <td>{applicant.snapshot_phone || "-"}</td>
        <td>{applicant.snapshot_bio || "-"}</td>
        <td>{formatAdminDateTime(applicant.created_at)}</td>
      </tr>
    ));
  }

  if (groups.length === 0) {
    return (
      <>
        <AdminWorkshopEmailPanel
          applicantCount={applicantCount}
          emailTemplate={emailTemplate}
          selectedApplicantCount={selectedApplicantCount}
          selectedRegistrationIds={selectedRegistrationIds}
          workshopId={workshopId}
        />
        <section className="admin-empty-panel">확정된 신청자가 없습니다.</section>
        {renderPendingVirtualAccountSection(pendingVirtualAccounts)}
        {hasCancelledApplicants && (
          <section className="admin-section">
            <div className="admin-section-header">
              <h2>취소/환불 내역</h2>
              <span>{cancelledCount}명</span>
            </div>
            {cancelledGroups.map((group) => (
              <div className="admin-table-wrap" key={group.label}>
                <table className="admin-table admin-cancelled-applicants-table">
                  <thead>
                    <tr>
                      <th>No.</th>
                      <th>이름</th>
                      <th>이메일</th>
                      <th>연락처</th>
                      <th>자기소개</th>
                      <th>신청일</th>
                    </tr>
                  </thead>
                  <tbody>{renderReadOnlyApplicantRows(group.applicants)}</tbody>
                </table>
              </div>
            ))}
          </section>
        )}
      </>
    );
  }

  return (
    <>
      <AdminWorkshopEmailPanel
        applicantCount={applicantCount}
        emailTemplate={emailTemplate}
        selectedApplicantCount={selectedApplicantCount}
        selectedRegistrationIds={selectedRegistrationIds}
        workshopId={workshopId}
      />

      <div className="admin-selection-controls" aria-label="신청자 선택">
        <button className="admin-email-link-action" type="button" onClick={toggleAllSelection}>
          {selectedApplicantCount === allRegistrationIds.length ? "전체 해제" : "전체 선택"}
        </button>
        <span>
          선택 {selectedApplicantCount}명 / 전체 {applicantCount}명
        </span>
      </div>

      {scheduleChangeMessage && (
        <p className={`admin-email-result ${scheduleChangeMessage.success ? "success" : "error"}`}>
          {scheduleChangeMessage.text}
        </p>
      )}

      {groups.map((group) => {
        const groupIds = group.applicants.map((applicant) => applicant.id);
        const selectedGroupCount = groupIds.filter((id) => selectedRegistrationIds.includes(id)).length;

        return (
          <section className="admin-section" key={group.label}>
            <div className="admin-section-header">
              <h2>{group.label}</h2>
              <div className="admin-section-actions">
                <span>{group.applicants.length}명</span>
                <button
                  className="admin-email-link-action"
                  type="button"
                  onClick={() => toggleGroupSelection(groupIds)}
                >
                  {selectedGroupCount === groupIds.length ? "일정 해제" : "일정 선택"}
                </button>
              </div>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table admin-applicants-table">
                <thead>
                  <tr>
                    <th>선택</th>
                    <th>No.</th>
                    <th>이름</th>
                    <th>이메일</th>
                    <th>연락처</th>
                    <th>자기소개</th>
                    <th>신청일</th>
                    <th className="admin-payment-amount-cell">결제금액</th>
                    <th className="admin-payment-method-cell">결제수단</th>
                    <th>일정 변경</th>
                  </tr>
                </thead>
                <tbody>
                  {group.applicants.map((applicant, index) => (
                    <tr key={applicant.id}>
                      <td>
                        <label className="admin-selection-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedRegistrationIds.includes(applicant.id)}
                            onChange={() => toggleApplicantSelection(applicant.id)}
                            aria-label={`${applicant.snapshot_name || "신청자"} 선택`}
                          />
                        </label>
                      </td>
                      <td>{index + 1}</td>
                      <td>
                        <span className={getNameClassName(applicant)}>{applicant.snapshot_name || "-"}</span>
                      </td>
                      <td>{applicant.snapshot_email || "-"}</td>
                      <td>{applicant.snapshot_phone || "-"}</td>
                      <td>{applicant.snapshot_bio || "-"}</td>
                      <td>{formatAdminDateTime(applicant.created_at)}</td>
                      <td className="admin-payment-amount-cell">
                        {typeof applicant.payment_amount === "number"
                          ? `${applicant.payment_amount.toLocaleString()}원`
                          : "-"}
                      </td>
                      <td className="admin-payment-method-cell">
                        {applicant.payment_method || "기록 없음"}
                      </td>
                      <td>
                        <div className="admin-schedule-change-cell">
                          <select
                            aria-label={`${applicant.snapshot_name || "신청자"} 일정 변경`}
                            disabled={scheduleOptions.length === 0 || changingRegistrationId === applicant.id}
                            value={getSelectedScheduleKey(applicant)}
                            onChange={(event) => {
                              setPendingScheduleByRegistration((current) => ({
                                ...current,
                                [applicant.id]: event.target.value,
                              }));
                            }}
                          >
                            <option value="">일정 선택</option>
                            {scheduleOptions.map((schedule) => {
                              const activeCount = scheduleCounts[schedule.key] ?? 0;
                              const capacityLabel = typeof schedule.capacity === "number" ? `${activeCount}/${schedule.capacity}` : `${activeCount}/-`;

                              return (
                                <option
                                  disabled={isScheduleFullForApplicant(schedule, applicant)}
                                  key={schedule.key}
                                  value={schedule.key}
                                >
                                  {schedule.label} ({capacityLabel})
                                </option>
                              );
                            })}
                          </select>
                          <button
                            className="admin-email-link-action"
                            disabled={scheduleOptions.length === 0 || changingRegistrationId === applicant.id}
                            type="button"
                            onClick={() => changeApplicantSchedule(applicant)}
                          >
                            {changingRegistrationId === applicant.id ? "변경 중" : "변경"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {renderPendingVirtualAccountSection(pendingVirtualAccounts)}

      {hasCancelledApplicants && (
        <section className="admin-section">
          <div className="admin-section-header">
            <h2>취소/환불 내역</h2>
            <span>{cancelledCount}명</span>
          </div>
          {cancelledGroups.map((group) => (
            <div className="admin-table-wrap" key={group.label}>
              <table className="admin-table admin-cancelled-applicants-table">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>이름</th>
                    <th>이메일</th>
                    <th>연락처</th>
                    <th>자기소개</th>
                    <th>신청일</th>
                  </tr>
                </thead>
                <tbody>{renderReadOnlyApplicantRows(group.applicants)}</tbody>
              </table>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
