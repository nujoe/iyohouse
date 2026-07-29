"use client";

export type NicepayCheckoutMethod = "cardAndEasyPay" | "vbank";

type NicepayPaymentMethodModalProps = {
  open: boolean;
  cardAndEasyPayEnabled: boolean;
  vbankEnabled: boolean;
  busy: boolean;
  onClose: () => void;
  onSelect: (method: NicepayCheckoutMethod) => void;
};

export default function NicepayPaymentMethodModal({
  open,
  cardAndEasyPayEnabled,
  vbankEnabled,
  busy,
  onClose,
  onSelect,
}: NicepayPaymentMethodModalProps) {
  if (!open) return null;

  return (
    <div className="nicepay-payment-modal-overlay" role="presentation">
      <div
        className="nicepay-payment-modal"
        role="dialog"
        aria-modal="true"
        aria-label="결제수단 선택"
      >
        <button
          type="button"
          className="nicepay-payment-close"
          aria-label="결제수단 선택 닫기"
          onClick={onClose}
        >
          &times;
        </button>
        <button
          type="button"
          className="nicepay-payment-method-button nicepay-payment-method-button-primary"
          disabled={busy || !cardAndEasyPayEnabled}
          onClick={() => onSelect("cardAndEasyPay")}
        >
          카드·간편결제
        </button>
        <button
          type="button"
          className="nicepay-payment-method-button"
          disabled={busy || !vbankEnabled}
          onClick={() => onSelect("vbank")}
        >
          가상계좌
        </button>
      </div>
    </div>
  );
}
