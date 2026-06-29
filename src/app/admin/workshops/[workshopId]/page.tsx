import Link from "next/link";
import { notFound } from "next/navigation";

import AdminWorkshopEmailPanel from "@/components/admin/AdminWorkshopEmailPanel";
import {
  formatAdminDate,
  formatAdminDateTime,
  getAdminWorkshopApplicants,
} from "@/lib/admin/workshopAdmin";

export const dynamic = "force-dynamic";

type AdminWorkshopApplicantsPageProps = {
  params: Promise<{
    workshopId: string;
  }>;
};

export default async function AdminWorkshopApplicantsPage({
  params,
}: AdminWorkshopApplicantsPageProps) {
  const { workshopId } = await params;
  const data = await getAdminWorkshopApplicants(workshopId);

  if (!data) {
    notFound();
  }

  const { workshop, groups, applicantCount, emailTemplate } = data;

  return (
    <main className="admin-page">
      <div className="admin-shell">
        <header className="admin-header">
          <div>
            <Link className="admin-back-link" href="/admin">
              ← 워크숍 목록
            </Link>
            <p className="admin-kicker">APPLICANTS</p>
            <h1>{workshop.title}</h1>
            <p className="admin-subtitle">
              {workshop.status || "-"} · 시작일 {formatAdminDate(workshop.start_at)} · 확정 신청자 {applicantCount}명
            </p>
          </div>
        </header>

        <AdminWorkshopEmailPanel
          applicantCount={applicantCount}
          emailTemplate={emailTemplate}
          workshopId={workshopId}
        />

        {groups.length === 0 ? (
          <section className="admin-empty-panel">확정된 신청자가 없습니다.</section>
        ) : (
          groups.map((group) => (
            <section className="admin-section" key={group.label}>
              <div className="admin-section-header">
                <h2>{group.label}</h2>
                <span>{group.applicants.length}명</span>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
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
                  <tbody>
                    {group.applicants.map((applicant, index) => (
                      <tr key={applicant.id}>
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
          ))
        )}
      </div>
    </main>
  );
}
