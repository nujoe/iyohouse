import Link from "next/link";
import { notFound } from "next/navigation";

import AdminWorkshopApplicantsClient from "@/components/admin/AdminWorkshopApplicantsClient";
import {
  formatAdminDate,
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

        <AdminWorkshopApplicantsClient
          applicantCount={applicantCount}
          emailTemplate={emailTemplate}
          groups={groups}
          workshopId={workshopId}
        />
      </div>
    </main>
  );
}
