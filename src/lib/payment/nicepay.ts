import { createHash, timingSafeEqual } from "node:crypto";

type NicepayMode = "test" | "production";

export type NicepayPaymentMethod =
  | "card"
  | "vbank"
  | "bank"
  | "cellphone"
  | "kakaopay"
  | "payco"
  | "samsungpayCard"
  | "naverpayCard";

type NicepayConfig = {
  enabled: boolean;
  mode: NicepayMode;
  clientKey: string;
  secretKey: string;
  method: NicepayPaymentMethod;
  methods: NicepayPaymentMethod[];
  scriptUrl: string;
  apiBaseUrl: string;
};

type NicepayAuthPayload = Record<string, string>;

type NicepayRegistration = {
  id: string;
  order_id: string;
  amount: number;
  snapshot_name?: string | null;
  snapshot_email?: string | null;
};

type CreateNicepayPaymentPayloadInput = {
  registration: NicepayRegistration;
  userId: string;
  orderName: string;
  origin: string;
  method?: string;
  mallReserved?: URLSearchParams;
};

type NicepayApprovalInput = {
  auth: NicepayAuthPayload;
  expectedOrderId: string;
  expectedAmount: number;
};

type NicepayApprovalResult =
  | {
      ok: true;
      tid: string;
      providerStatus: string;
      receiptUrl: string;
      payload: Record<string, unknown>;
    }
  | {
      ok: false;
      message: string;
      payload?: Record<string, unknown>;
      status?: number;
    };

type NicepayCancelInput = {
  tid: string;
  orderId: string;
  reason: string;
  cancelAmt?: number;
};

type NicepayCancelResult =
  | {
      ok: true;
      cancelledTid: string;
      payload: Record<string, unknown>;
    }
  | {
      ok: false;
      message: string;
      payload?: Record<string, unknown>;
      status?: number;
    };

const supportedMethods = new Set<NicepayPaymentMethod>([
  "card",
  "vbank",
  "bank",
  "cellphone",
  "kakaopay",
  "payco",
  "samsungpayCard",
  "naverpayCard",
]);

function envValue(names: string[], fallback = "") {
  for (const name of names) {
    const value = process.env[name];

    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  return fallback;
}

function truthy(value: string, fallback = false) {
  const normalized = value.trim().toLowerCase();

  if (!normalized) return fallback;
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;

  return fallback;
}

export function sanitizeNicepayPaymentMethod(method: string): NicepayPaymentMethod | "" {
  const normalized = method.trim() === "cardAndEasyPay" ? "card" : method.trim();

  return supportedMethods.has(normalized as NicepayPaymentMethod)
    ? (normalized as NicepayPaymentMethod)
    : "";
}

function nicepayPaymentMethodsFromEnv(fallbackMethod: string) {
  const rawMethods = envValue(["IYO_NICEPAY_METHODS"], "");
  const source = rawMethods || fallbackMethod;
  const methods: NicepayPaymentMethod[] = [];

  for (const method of source.split(/[\s,]+/)) {
    const sanitized = sanitizeNicepayPaymentMethod(method);

    if (sanitized && !methods.includes(sanitized)) {
      methods.push(sanitized);
    }
  }

  if (methods.length > 0) return methods;

  return [sanitizeNicepayPaymentMethod(fallbackMethod) || "card"];
}

export function getNicepayConfig(): NicepayConfig {
  const mode = envValue(["IYO_NICEPAY_MODE"], "test").toLowerCase() === "production"
    ? "production"
    : "test";
  const fallbackMethod = sanitizeNicepayPaymentMethod(envValue(["IYO_NICEPAY_METHOD"], "card")) || "card";
  const scriptUrlOverride = envValue(["IYO_NICEPAY_SCRIPT_URL"], "");
  const apiBaseUrlOverride = envValue(["IYO_NICEPAY_API_BASE_URL"], "");

  return {
    enabled: truthy(envValue(["IYO_NICEPAY_ENABLED"], "0")),
    mode,
    clientKey: envValue(["IYO_NICEPAY_CLIENT_KEY", "IYO_NICEPAY_CLIENT_ID"]),
    secretKey: envValue(["IYO_NICEPAY_SECRET_KEY"]),
    method: fallbackMethod,
    methods: nicepayPaymentMethodsFromEnv(fallbackMethod),
    scriptUrl: /^https:\/\//i.test(scriptUrlOverride)
      ? scriptUrlOverride
      : "https://pay.nicepay.co.kr/v1/js/",
    apiBaseUrl: /^https:\/\//i.test(apiBaseUrlOverride)
      ? apiBaseUrlOverride.replace(/\/+$/, "")
      : mode === "test"
        ? "https://sandbox-api.nicepay.co.kr"
        : "https://api.nicepay.co.kr",
  };
}

export function isNicepayConfigured(config = getNicepayConfig()) {
  return config.enabled && config.clientKey !== "" && config.secretKey !== "";
}

export function nicepayBasicAuthorization(clientKey: string, secretKey: string) {
  return `Basic ${Buffer.from(`${clientKey}:${secretKey}`, "utf8").toString("base64")}`;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function nicepayAuthSignature(
  authToken: string,
  clientKey: string,
  amount: number,
  secretKey: string,
) {
  return sha256(`${authToken}${clientKey}${amount}${secretKey}`);
}

export function nicepayResultSignature(
  tid: string,
  amount: number,
  ediDate: string,
  secretKey: string,
) {
  return sha256(`${tid}${amount}${ediDate}${secretKey}`);
}

function safeSignatureEquals(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function verifyNicepayAuthSignature(auth: NicepayAuthPayload, config = getNicepayConfig()) {
  const amount = Number(auth.amount || 0);
  const expected = nicepayAuthSignature(
    auth.authToken || "",
    auth.clientId || "",
    amount,
    config.secretKey,
  );

  return safeSignatureEquals(expected, auth.signature || "");
}

export function verifyNicepayResultSignature(payload: NicepayAuthPayload, config = getNicepayConfig()) {
  const amount = Number(payload.amount || 0);
  const expected = nicepayResultSignature(
    payload.tid || "",
    amount,
    payload.ediDate || "",
    config.secretKey,
  );

  return safeSignatureEquals(expected, payload.signature || "");
}

function nicepayGoodsName(name: string) {
  const cleaned = name.trim().replace(/["|¦]/g, "-");

  return Array.from(cleaned).slice(0, 40).join("") || "IYOHOUSE Workshop";
}

export function createNicepayPaymentPayload({
  registration,
  userId,
  orderName,
  origin,
  method,
  mallReserved,
}: CreateNicepayPaymentPayloadInput) {
  const config = getNicepayConfig();
  let selectedMethod = sanitizeNicepayPaymentMethod(method || "") || config.method;

  if (!config.methods.includes(selectedMethod)) {
    selectedMethod = config.method;
  }

  const reserved = mallReserved || new URLSearchParams();
  reserved.set("registration_id", registration.id);

  const payload: Record<string, string | number | boolean> = {
    clientId: config.clientKey,
    method: selectedMethod,
    orderId: registration.order_id,
    amount: Number(registration.amount),
    goodsName: nicepayGoodsName(orderName),
    returnUrl: new URL("/api/payment/confirm", origin).toString(),
    mallReserved: reserved.toString(),
    mallUserId: userId,
    buyerName: registration.snapshot_name || "IYOHOUSE",
    buyerEmail: registration.snapshot_email || "",
    language: "KO",
  };

  if (selectedMethod === "vbank") {
    payload.vbankHolder = registration.snapshot_name || "IYOHOUSE";
    payload.vbankValidHours = Number(envValue(["IYO_NICEPAY_VBANK_VALID_HOURS"], "72"));
  }

  if (selectedMethod === "cellphone") {
    payload.isDigital = true;
  }

  return payload;
}

export function safeNicepayPayload(payload: Record<string, unknown>) {
  const allowed = [
    "resultCode",
    "resultMsg",
    "tid",
    "cancelledTid",
    "orderId",
    "amount",
    "status",
    "paidAt",
    "failedAt",
    "cancelledAt",
    "receiptUrl",
  ];

  return allowed.reduce<Record<string, string>>((safe, key) => {
    const value = payload[key];

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      safe[key] = String(value);
    }

    return safe;
  }, {});
}

export async function approveNicepayPaymentAuth({
  auth,
  expectedOrderId,
  expectedAmount,
}: NicepayApprovalInput): Promise<NicepayApprovalResult> {
  const config = getNicepayConfig();
  const tid = auth.tid || "";
  const amount = Number(auth.amount || 0);

  if (!isNicepayConfigured(config)) {
    return { ok: false, message: "NICEPAY 환경 변수가 설정되어 있지 않습니다.", status: 500 };
  }

  if (auth.authResultCode !== "0000") {
    return {
      ok: false,
      message: `NICEPAY 인증 실패: ${auth.authResultMsg || auth.authResultCode || "UNKNOWN"}`,
      payload: safeNicepayPayload(auth),
      status: 400,
    };
  }

  if (
    !tid ||
    !auth.authToken ||
    !auth.signature ||
    auth.clientId !== config.clientKey ||
    auth.orderId !== expectedOrderId ||
    amount !== expectedAmount
  ) {
    return {
      ok: false,
      message: "NICEPAY 인증 응답과 내부 신청 정보가 일치하지 않습니다.",
      payload: safeNicepayPayload(auth),
      status: 400,
    };
  }

  if (!verifyNicepayAuthSignature(auth, config)) {
    return {
      ok: false,
      message: "NICEPAY 인증 서명이 일치하지 않습니다.",
      payload: safeNicepayPayload(auth),
      status: 400,
    };
  }

  const response = await fetch(`${config.apiBaseUrl}/v1/payments/${encodeURIComponent(tid)}`, {
    method: "POST",
    headers: {
      Authorization: nicepayBasicAuthorization(config.clientKey, config.secretKey),
      "Content-Type": "application/json;charset=utf-8",
    },
    body: JSON.stringify({ amount }),
  });

  const result = await response.json().catch(() => null) as Record<string, unknown> | null;

  if (!response.ok || !result) {
    return {
      ok: false,
      message: `NICEPAY 승인 API 호출에 실패했습니다. (${response.status})`,
      payload: result ? safeNicepayPayload(result) : undefined,
      status: response.status || 502,
    };
  }

  if (String(result.resultCode || "") !== "0000") {
    return {
      ok: false,
      message: `NICEPAY 승인 실패: ${String(result.resultMsg || result.resultCode || "UNKNOWN")}`,
      payload: safeNicepayPayload(result),
      status: 400,
    };
  }

  const resultOrderId = String(result.orderId || "");
  const resultAmount = Number(result.amount || amount);

  if (resultOrderId !== expectedOrderId || resultAmount !== expectedAmount) {
    return {
      ok: false,
      message: "NICEPAY 승인 결과가 내부 신청 정보와 일치하지 않습니다.",
      payload: safeNicepayPayload(result),
      status: 400,
    };
  }

  const resultTid = String(result.tid || tid);
  const resultSignature = String(result.signature || "");
  const resultEdiDate = String(result.ediDate || "");

  if (resultSignature && resultEdiDate) {
    const expected = nicepayResultSignature(resultTid, resultAmount, resultEdiDate, config.secretKey);

    if (!safeSignatureEquals(expected, resultSignature)) {
      return {
        ok: false,
        message: "NICEPAY 승인 서명이 일치하지 않습니다.",
        payload: safeNicepayPayload(result),
        status: 400,
      };
    }
  }

  return {
    ok: true,
    tid: resultTid,
    providerStatus: String(result.status || "paid"),
    receiptUrl: String(result.receiptUrl || ""),
    payload: result,
  };
}

export async function cancelNicepayPayment({
  tid,
  orderId,
  reason,
  cancelAmt,
}: NicepayCancelInput): Promise<NicepayCancelResult> {
  const config = getNicepayConfig();

  if (!isNicepayConfigured(config)) {
    return { ok: false, message: "NICEPAY 환경 변수가 설정되어 있지 않습니다.", status: 500 };
  }

  if (!tid || !orderId) {
    return { ok: false, message: "NICEPAY 취소에 필요한 거래 정보가 부족합니다.", status: 400 };
  }

  const body: Record<string, string | number> = {
    reason: Array.from(reason.trim() || "IYOHOUSE registration compensation").slice(0, 100).join(""),
    orderId,
  };

  if (typeof cancelAmt === "number" && Number.isFinite(cancelAmt) && cancelAmt > 0) {
    body.cancelAmt = cancelAmt;
  }

  const response = await fetch(`${config.apiBaseUrl}/v1/payments/${encodeURIComponent(tid)}/cancel`, {
    method: "POST",
    headers: {
      Authorization: nicepayBasicAuthorization(config.clientKey, config.secretKey),
      "Content-Type": "application/json;charset=utf-8",
    },
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => null) as Record<string, unknown> | null;

  if (!response.ok || !result) {
    return {
      ok: false,
      message: `NICEPAY 취소 API 호출에 실패했습니다. (${response.status})`,
      payload: result ? safeNicepayPayload(result) : undefined,
      status: response.status || 502,
    };
  }

  if (String(result.resultCode || "") !== "0000") {
    return {
      ok: false,
      message: `NICEPAY 취소 실패: ${String(result.resultMsg || result.resultCode || "UNKNOWN")}`,
      payload: safeNicepayPayload(result),
      status: 400,
    };
  }

  return {
    ok: true,
    cancelledTid: String(result.tid || result.cancelledTid || ""),
    payload: result,
  };
}
