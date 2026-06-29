"use client";

import { useMemo, useState } from "react";

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
  created_at: string | null;
  schedule_key?: string | null;
  schedule_label?: string | null;
  schedule_date?: string | null;
  schedule_time?: string | null;
};

type AdminApplicantGroup = {
  label: string;
  applicants: AdminApplicantRow[];
};

type AdminWorkshopApplicantsClientProps = {
  applicantCount: number;
  emailTemplate: AdminWorkshopEmailTemplate | null;
  groups: AdminApplicantGroup[];
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

export default function AdminWorkshopApplicantsClient({
  applicantCount,
  emailTemplate,
  groups,
  workshopId,
}: AdminWorkshopApplicantsClientProps) {
  const [selectedRegistrationIds, setSelectedRegistrationIds] = useState<string[]>([]);
  const allRegistrationIds = useMemo(
    () => groups.flatMap((group) => group.applicants.map((applicant) => applicant.id)),
    [groups],
  );
  const selectedApplicantCount = selectedRegistrationIds.length;

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
                      <td>{applicant.snapshot_name || "-"}</td>
                      <td>{applicant.snapshot_email || "-"}</td>
                      <td>{applicant.snapshot_phone || "-"}</td>
                      <td>{applicant.snapshot_bio || "-"}</td>
                      <td>{formatAdminDateTime(applicant.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}
