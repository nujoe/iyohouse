"use client";

import { useMemo, useState } from "react";

type AdminWorkshopEmailTemplate = {
  subject: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
};

type AdminWorkshopEmailPanelProps = {
  applicantCount: number;
  emailTemplate: AdminWorkshopEmailTemplate | null;
  selectedApplicantCount: number;
  selectedRegistrationIds: string[];
  workshopId: string;
};

type SendResult = {
  success?: boolean;
  error?: string;
  recipientCount?: number;
  sentCount?: number;
  failedCount?: number;
};

function renderPreview(template: AdminWorkshopEmailTemplate) {
  return template.body
    .replaceAll("{name}", "신청자")
    .replaceAll("{workshopTitle}", "워크숍명")
    .replaceAll("{schedule}", "선택 일정");
}

export default function AdminWorkshopEmailPanel({
  applicantCount,
  emailTemplate,
  selectedApplicantCount,
  selectedRegistrationIds,
  workshopId,
}: AdminWorkshopEmailPanelProps) {
  const [confirmation, setConfirmation] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const canSend = Boolean(emailTemplate && selectedApplicantCount > 0 && confirmation.trim() === "발송" && !isSending);
  const previewBody = useMemo(
    () => emailTemplate ? renderPreview(emailTemplate) : "",
    [emailTemplate],
  );

  async function handleSend() {
    if (!canSend) return;

    const ok = window.confirm(`선택한 확정 신청자 ${selectedApplicantCount}명에게 이메일을 발송합니다. 계속할까요?`);
    if (!ok) return;

    setIsSending(true);
    setResult(null);

    try {
      const response = await fetch(`/api/admin/workshops/${encodeURIComponent(workshopId)}/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedRecipientCount: selectedApplicantCount,
          selectedRegistrationIds,
        }),
      });
      const data = await response.json().catch(() => ({}));

      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "이메일 발송 요청에 실패했습니다.",
      });
    } finally {
      setIsSending(false);
      setConfirmation("");
    }
  }

  return (
    <section className="admin-email-panel" aria-label="확정 신청자 이메일 발송">
      <div className="admin-email-panel-header">
        <div>
          <p className="admin-kicker">EMAIL PRESET</p>
          <h2>확정 신청자 이메일</h2>
        </div>
        <span>선택 {selectedApplicantCount}명 / 전체 {applicantCount}명</span>
      </div>

      {!emailTemplate ? (
        <p className="admin-email-muted">
          Sanity 워크숍 문서의 “확정 신청자 이메일 템플릿” 제목과 본문을 입력하면 발송할 수 있습니다.
        </p>
      ) : (
        <>
          <div className="admin-email-preview">
            <div>
              <strong>제목</strong>
              <p>{emailTemplate.subject}</p>
            </div>
            <div>
              <strong>본문 미리보기</strong>
              <p>{previewBody}</p>
            </div>
            {emailTemplate.ctaUrl && (
              <div>
                <strong>버튼</strong>
                <p>{emailTemplate.ctaLabel || "링크 열기"} · {emailTemplate.ctaUrl}</p>
              </div>
            )}
          </div>

          <div className="admin-email-actions">
            <label>
              실수 방지를 위해 <strong>발송</strong>을 입력하세요.
              <input
                type="text"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="발송"
                disabled={isSending}
              />
            </label>
            <button type="button" onClick={handleSend} disabled={!canSend}>
              {isSending ? "발송 중..." : `선택한 ${selectedApplicantCount}명에게 발송`}
            </button>
          </div>
        </>
      )}

      {result && (
        <p className={`admin-email-result ${result.success ? "success" : "error"}`}>
          {result.success
            ? `발송 완료: ${result.sentCount ?? 0}/${result.recipientCount ?? 0}명`
            : result.error || `일부 실패: 성공 ${result.sentCount ?? 0}명, 실패 ${result.failedCount ?? 0}명`}
        </p>
      )}
    </section>
  );
}
