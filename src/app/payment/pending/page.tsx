"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type PendingPaymentStatus = "confirmed" | "pending" | "cancelled" | "expired";

type PendingPaymentResponse = {
  status: PendingPaymentStatus;
  amount: number;
  workshopTitle: string;
  vbankName: string | null;
  vbankNumber: string | null;
  vbankHolder: string | null;
  expiresAt: string | null;
};

function buildWorkshopReturnPath(workshopId: string | null) {
  const params = new URLSearchParams({ preset: "workshop" });

  if (workshopId) {
    params.set("workshop", workshopId);
  }

  return `/?${params.toString()}`;
}

function PaymentNotice({ title, returnPath }: { title: string; returnPath: string }) {
  const router = useRouter();

  return (
    <main className="nicepay-payment-shell">
      <section className="nicepay-payment-card">
        <h1 className="nicepay-payment-heading">{title}</h1>
        <button
          type="button"
          className="nicepay-payment-action"
          onClick={() => router.push(returnPath)}
        >
          워크숍 신청 페이지로 돌아가기
        </button>
      </section>
    </main>
  );
}

function VirtualAccountDetails({
  bank,
  account,
  holder,
  amount,
  expiresAt,
  workshopTitle,
  returnPath,
}: {
  bank: string | null;
  account: string | null;
  holder: string | null;
  amount: number;
  expiresAt: string | null;
  workshopTitle: string;
  returnPath: string;
}) {
  const router = useRouter();
  const expiresAtLabel = expiresAt
    ? new Date(expiresAt).toLocaleString("ko-KR")
    : "확인 중";

  return (
    <main className="nicepay-payment-shell">
      <section className="nicepay-payment-card">
        <h1 className="nicepay-payment-heading">가상계좌 입금을 기다리고 있습니다.</h1>
        {workshopTitle && <p className="nicepay-payment-workshop-title">{workshopTitle}</p>}
        <div className="nicepay-payment-details" aria-label="가상계좌 입금 정보">
          <div className="nicepay-payment-detail-row">
            <span className="nicepay-payment-detail-label">은행</span>
            <span className="nicepay-payment-detail-value">{bank || "확인 중"}</span>
          </div>
          <div className="nicepay-payment-detail-row">
            <span className="nicepay-payment-detail-label">계좌번호</span>
            <span className="nicepay-payment-detail-value">{account || "확인 중"}</span>
          </div>
          <div className="nicepay-payment-detail-row">
            <span className="nicepay-payment-detail-label">예금주</span>
            <span className="nicepay-payment-detail-value">{holder || "확인 중"}</span>
          </div>
          <div className="nicepay-payment-detail-row">
            <span className="nicepay-payment-detail-label">입금 금액</span>
            <span className="nicepay-payment-detail-value">{Number(amount).toLocaleString()}원</span>
          </div>
          <div className="nicepay-payment-detail-row">
            <span className="nicepay-payment-detail-label">입금 기한</span>
            <span className="nicepay-payment-detail-value">{expiresAtLabel}</span>
          </div>
        </div>
        <button
          type="button"
          className="nicepay-payment-action"
          onClick={() => router.push(returnPath)}
        >
          워크숍 신청 페이지로 돌아가기
        </button>
      </section>
    </main>
  );
}

function PendingPaymentContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id") || "";
  const returnPath = buildWorkshopReturnPath(searchParams.get("workshop"));
  const [payment, setPayment] = useState<PendingPaymentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setError(true);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const loadPendingPayment = async () => {
      try {
        const response = await fetch(`/api/payment/pending?order_id=${encodeURIComponent(orderId)}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Unable to load pending payment");
        }

        const data = await response.json() as PendingPaymentResponse;
        setPayment(data);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          console.error("Unable to load pending NICEPAY payment:", requestError);
          setError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadPendingPayment();

    return () => controller.abort();
  }, [orderId]);

  if (loading) {
    return (
      <main className="nicepay-payment-shell">
        <section className="nicepay-payment-card">
          <p className="nicepay-payment-copy">결제 대기 정보를 불러오는 중입니다.</p>
        </section>
      </main>
    );
  }

  if (error || !payment) {
    return <PaymentNotice title="결제 대기 정보를 불러오지 못했습니다." returnPath={returnPath} />;
  }

  const { status, amount, workshopTitle, vbankName, vbankNumber, vbankHolder, expiresAt } = payment;

  if (status === "confirmed") {
    return <PaymentNotice title="입금이 확인되었습니다." returnPath={returnPath} />;
  }

  if (status === "pending") {
    return (
      <VirtualAccountDetails
        bank={vbankName}
        account={vbankNumber}
        holder={vbankHolder}
        amount={amount}
        expiresAt={expiresAt}
        workshopTitle={workshopTitle}
        returnPath={returnPath}
      />
    );
  }

  return <PaymentNotice title="가상계좌 입금 기한이 종료되었습니다." returnPath={returnPath} />;
}

export default function PaymentPendingPage() {
  return (
    <Suspense
      fallback={(
        <main className="nicepay-payment-shell">
          <section className="nicepay-payment-card">
            <p className="nicepay-payment-copy">결제 대기 정보를 불러오는 중입니다.</p>
          </section>
        </main>
      )}
    >
      <PendingPaymentContent />
    </Suspense>
  );
}
