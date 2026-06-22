"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfileNavigation } from "@/hooks/useProfileNavigation";
import { useToast } from "@/context/ToastContext";
import { TEXT } from "@/lib/i18n/translations";
import MixedWorkshopTitle from "@/components/workshop/MixedWorkshopTitle";
import WorkshopDetailPoster from "@/components/workshop/WorkshopDetailPoster";
import {
    getLocalizedCurriculumItem,
    getLocalizedScheduleSession,
    getLocalizedWorkshopDescription,
    getLocalizedWorkshopTitle,
    getLocalizedWorkshopTutor,
    getLocalizedWorkshopTutorBio,
    getScheduleSessionLabel,
} from "@/lib/i18n/workshopLocalization";

interface WorkshopDetailOverlayProps {
    workshop: any;
    t: any;
    language: "ko" | "en";
    registrationCounts: Record<string, number>;
    scheduleCounts: Record<string, Record<string, number>>;
    onRequireLogin: () => void;
}

declare global {
    interface Window {
        AUTHNICE?: {
            requestPay: (payload: Record<string, unknown>) => void;
        };
        iyohouseNicepayScriptPromises?: Record<string, Promise<void> | undefined>;
    }
}

type NicepayCheckoutResponse = {
    success: boolean;
    error?: string;
    scriptUrl?: string;
    payload?: Record<string, unknown>;
};

const NICEPAY_READY_TIMEOUT_MS = 8000;
const NICEPAY_READY_INTERVAL_MS = 50;

function isNicepayReady() {
    return Boolean(window.AUTHNICE && typeof window.AUTHNICE.requestPay === "function");
}

function waitForNicepayReady(timeoutMs = NICEPAY_READY_TIMEOUT_MS) {
    const startedAt = Date.now();

    return new Promise<void>((resolve, reject) => {
        const check = () => {
            if (isNicepayReady()) {
                resolve();
                return;
            }

            if (Date.now() - startedAt >= timeoutMs) {
                reject(new Error("NICEPAY SDK is not ready"));
                return;
            }

            window.setTimeout(check, NICEPAY_READY_INTERVAL_MS);
        };

        check();
    });
}

function loadNicepayScript(scriptUrl: string) {
    if (isNicepayReady()) {
        return Promise.resolve();
    }

    if (!scriptUrl) {
        return Promise.reject(new Error("missing NICEPAY script URL"));
    }

    window.iyohouseNicepayScriptPromises = window.iyohouseNicepayScriptPromises || {};

    if (window.iyohouseNicepayScriptPromises[scriptUrl]) {
        return window.iyohouseNicepayScriptPromises[scriptUrl];
    }

    window.iyohouseNicepayScriptPromises[scriptUrl] = new Promise((resolve, reject) => {
        const existing = Array.from(document.scripts).find((script) => script.src === scriptUrl);

        if (existing) {
            existing.addEventListener("load", () => {
                existing.dataset.iyohouseNicepayLoaded = "true";
                waitForNicepayReady().then(resolve, reject);
            }, { once: true });
            existing.addEventListener("error", () => reject(new Error("NICEPAY script failed")), { once: true });

            if (existing.dataset.iyohouseNicepayLoaded === "true") {
                waitForNicepayReady().then(resolve, reject);
            }

            return;
        }

        const script = document.createElement("script");
        script.src = scriptUrl;
        script.async = true;
        script.addEventListener("load", () => {
            script.dataset.iyohouseNicepayLoaded = "true";
            waitForNicepayReady().then(resolve, reject);
        }, { once: true });
        script.addEventListener("error", () => reject(new Error("NICEPAY script failed")), { once: true });
        document.head.appendChild(script);
    });

    return window.iyohouseNicepayScriptPromises[scriptUrl];
}

function nicepayErrorMessage(result: unknown) {
    if (!result || typeof result !== "object") {
        return "NICEPAY 결제창을 열지 못했습니다.";
    }

    const record = result as Record<string, unknown>;
    const message = record.errorMsg || record.resultMsg || record.message;

    return typeof message === "string" && message ? message : "NICEPAY 결제창을 열지 못했습니다.";
}

function getUserFacingPaymentError(message: string, fallback: string) {
    if (!message) return fallback;
    const lower = message.toLowerCase();
    if (lower.includes("active registration") || lower.includes("already registered") || lower.includes("already applied")) {
        return "이미 신청한 워크숍입니다.";
    }
    if (lower.includes("db uuid") || lower.includes("uuid missing")) {
        return "아직 신청 준비 중인 워크숍입니다. 잠시 후 다시 시도하거나 문의해 주세요.";
    }
    if (lower.includes("nicepay") || lower.includes("환경 변수")) {
        return "결제창을 열지 못했습니다. 잠시 후 다시 시도하거나 문의해 주세요.";
    }
    return "신청/결제 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

function shouldFallbackToLegacyRegistrationRpc(error: any) {
    const message = String(error?.message || "");
    const code = String(error?.code || "");

    return code === "PGRST202" || message.includes("p_schedule_") || message.includes("Could not find the function");
}

function getPositiveInteger(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function getScheduleKey(session: any) {
    const explicitKey = typeof session?._key === 'string' ? session._key.trim() : '';
    if (explicitKey) return explicitKey;

    return [session?.date, session?.time]
        .map((part) => (typeof part === 'string' ? part.trim() : ''))
        .filter(Boolean)
        .join('-');
}

async function cancelPendingPaymentRegistration(registrationId: string | null | undefined) {
    if (!registrationId) return;

    try {
        const response = await fetch("/api/payment/fail", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ registration_id: registrationId }),
        });

        if (!response.ok) {
            console.error("Pending payment registration cleanup failed:", response.status);
        }
    } catch (error) {
        console.error("Pending payment registration cleanup error:", error);
    }
}

export default function WorkshopDetailOverlay({
    workshop,
    t,
    language,
    registrationCounts,
    scheduleCounts,
    onRequireLogin
}: WorkshopDetailOverlayProps) {
    const { user, isProfileComplete, supabase } = useAuth();
    const { goToCompleteProfile } = useProfileNavigation();
    const { showToast } = useToast();

    const [showSchedule, setShowSchedule] = useState(false);
    const [selectedSession, setSelectedSession] = useState<any | null>(null);
    const [showRefundPolicy, setShowRefundPolicy] = useState(false);
    const [nicepayScriptUrl, setNicepayScriptUrl] = useState("");
    const [isPaymentStarting, setIsPaymentStarting] = useState(false);
    const [isRegistered, setIsRegistered] = useState(false);

    useEffect(() => {
        if (!user || !workshop?.supabase_workshop_id) {
            setIsRegistered(false);
            return;
        }

        const checkRegistration = async () => {
            try {
                const { data, error } = await supabase
                    .from('workshop_registrations_v2')
                    .select('id')
                    .eq('workshop_id', workshop.supabase_workshop_id)
                    .eq('user_id', user.id)
                    .eq('status', 'confirmed')
                    .maybeSingle();

                if (error) throw error;
                setIsRegistered(!!data);
            } catch (err) {
                console.error("Error checking registration:", err);
            }
        };

        checkRegistration();
    }, [user, workshop?.supabase_workshop_id, supabase]);

    const getWorkshopCapacity = useCallback((ws: any) =>
        typeof ws?.capacity === 'number' ? ws.capacity : 8, []);

    const getWorkshopPaidCount = useCallback((ws: any) => {
        const dbId = ws?.supabase_workshop_id;
        return dbId ? registrationCounts[dbId] || 0 : 0;
    }, [registrationCounts]);

    const getWorkshopSchedule = useCallback((ws: any) =>
        Array.isArray(ws?.schedule)
            ? ws.schedule.filter((session: any) => session?.date || session?.time)
            : [], []);

    const hasSelectableSchedule = useCallback((ws: any) => getWorkshopSchedule(ws).length > 0, [getWorkshopSchedule]);

    const getSessionCapacity = useCallback((ws: any, session: any) => {
        const sessionCapacity = getPositiveInteger(session?.capacity);
        if (sessionCapacity !== null) return sessionCapacity;

        const scheduleKey = getScheduleKey(session);
        const runtimeCapacity = scheduleKey ? getPositiveInteger(ws?.scheduleCapacities?.[scheduleKey]) : null;

        return runtimeCapacity ?? getWorkshopCapacity(ws);
    }, [getWorkshopCapacity]);

    const hasExplicitSessionCapacity = useCallback((ws: any, session: any) => {
        const scheduleKey = getScheduleKey(session);

        return getPositiveInteger(session?.capacity) !== null ||
            (scheduleKey ? getPositiveInteger(ws?.scheduleCapacities?.[scheduleKey]) !== null : false);
    }, []);

    const getSchedulePaidCount = useCallback((ws: any, session: any) => {
        const dbId = ws?.supabase_workshop_id;
        const scheduleKey = getScheduleKey(session);

        if (!dbId || !scheduleKey || !hasExplicitSessionCapacity(ws, session)) {
            return getWorkshopPaidCount(ws);
        }

        return scheduleCounts[dbId]?.[scheduleKey] || 0;
    }, [getWorkshopPaidCount, hasExplicitSessionCapacity, scheduleCounts]);

    const isScheduleFull = useCallback((ws: any, session: any) =>
        getSchedulePaidCount(ws, session) >= getSessionCapacity(ws, session),
        [getSchedulePaidCount, getSessionCapacity]);

    const isWorkshopClosedForPayment = useCallback((ws: any) => {
        const isLegacyClosed = !ws?.isSanity && Number(ws?.id) <= 11;
        const schedule = getWorkshopSchedule(ws);

        if (ws?.isClosed || isLegacyClosed) return true;

        if (schedule.length > 0) {
            return schedule.every((session: any) => isScheduleFull(ws, session));
        }

        return Boolean(
            getWorkshopPaidCount(ws) >= getWorkshopCapacity(ws)
        );
    }, [getWorkshopCapacity, getWorkshopPaidCount, getWorkshopSchedule, isScheduleFull]);

    const handleWorkshopPayment = useCallback(async (ws: any) => {
        if (isPaymentStarting) return;

        if (!user) {
            onRequireLogin();
            return;
        }

        if (!isProfileComplete) {
            goToCompleteProfile();
            return;
        }

        const dbWorkshopId = ws.supabase_workshop_id;
        if (!dbWorkshopId) {
            showToast("error", TEXT.ko.workshop.missingDbId);
            return;
        }

        if (isWorkshopClosedForPayment(ws)) {
            showToast("error", TEXT.ko.workshop.closedAlert);
            return;
        }

        if (hasSelectableSchedule(ws) && !selectedSession) {
            showToast("error", TEXT.ko.workshop.scheduleRequired);
            setShowSchedule(true);
            return;
        }

        if (selectedSession && isScheduleFull(ws, selectedSession)) {
            showToast("error", TEXT.ko.workshop.closedAlert);
            return;
        }

        setIsPaymentStarting(true);
        let pendingRegistrationId: string | null = null;

        try {
            const selectedSchedule = selectedSession ? getLocalizedScheduleSession(selectedSession, language) : null;
            const scheduleLabel = selectedSession ? getScheduleSessionLabel(selectedSession, language) : "";
            const scheduleDate = selectedSchedule?.date || selectedSession?.date || "";
            const scheduleTime = selectedSchedule?.time || selectedSession?.time || "";
            const scheduleKey = selectedSession?._key || [selectedSession?.date, selectedSession?.time].filter(Boolean).join("-");
            const registrationPayload = {
                p_workshop_id: dbWorkshopId,
                p_schedule_key: scheduleKey || null,
                p_schedule_label: scheduleLabel || null,
                p_schedule_date: scheduleDate || null,
                p_schedule_time: scheduleTime || null,
            };
            let { data: regData, error: rpcError } = await supabase.rpc('create_pending_registration', registrationPayload);

            if (rpcError && shouldFallbackToLegacyRegistrationRpc(rpcError)) {
                const legacyResult = await supabase.rpc('create_pending_registration', {
                    p_workshop_id: dbWorkshopId,
                });
                regData = legacyResult.data;
                rpcError = legacyResult.error;
            }

            if (rpcError) throw rpcError;

            const { registration_id, workshop_title } = regData;
            pendingRegistrationId = registration_id;
            const orderName = workshop_title || getLocalizedWorkshopTitle(ws, language, t) || t.workshop.fallbackTitle(ws.number || ws.id);
            const checkoutResponse = await fetch("/api/payment/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    registration_id,
                    orderName,
                    scheduleLabel,
                    method: "card",
                }),
            });
            const checkout = await checkoutResponse.json() as NicepayCheckoutResponse;

            if (!checkoutResponse.ok || !checkout.success || !checkout.payload || !checkout.scriptUrl) {
                throw new Error(checkout.error || t.workshop.paymentMisconfigured);
            }

            setNicepayScriptUrl(checkout.scriptUrl);
            await loadNicepayScript(checkout.scriptUrl);

            if (!window.AUTHNICE || typeof window.AUTHNICE.requestPay !== "function") {
                throw new Error(t.workshop.paymentPreparing);
            }

            window.AUTHNICE.requestPay({
                ...checkout.payload,
                fnError: (result: unknown) => {
                    void cancelPendingPaymentRegistration(registration_id);
                    setIsRegistered(false);
                    showToast("error", nicepayErrorMessage(result));
                    setIsPaymentStarting(false);
                },
            });
        } catch (error: any) {
            if (pendingRegistrationId) {
                await cancelPendingPaymentRegistration(pendingRegistrationId);
                setIsRegistered(false);
            }
            console.error("신청/결제 요청 에러:", error);
            showToast("error", getUserFacingPaymentError(error.message, "신청/결제 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."));
        } finally {
            setIsPaymentStarting(false);
        }
    }, [
        isPaymentStarting,
        user,
        isProfileComplete,
        t,
        isWorkshopClosedForPayment,
        hasSelectableSchedule,
        isScheduleFull,
        selectedSession,
        nicepayScriptUrl,
        onRequireLogin,
        goToCompleteProfile,
        supabase,
        language
    ]);

    const selectedScheduleFull = selectedSession ? isScheduleFull(workshop, selectedSession) : false;
    const workshopClosedForPayment = isWorkshopClosedForPayment(workshop);
    const isApplyDisabled = isPaymentStarting || workshopClosedForPayment || selectedScheduleFull;

    return (
        <div className="workshop-detail-container">
            <div className="detail-layout">
                <WorkshopDetailPoster workshop={workshop} />
                <div className="detail-right">
                    <div className="detail-info-inner">
                        <div className="detail-info-header">
                            <div className="detail-tags">
                                <span className="pills pill-yellow">WORKSHOP</span>
                            </div>
                            <div className="detail-title-wrapper">
                                <MixedWorkshopTitle
                                    className="detail-main-title"
                                    title={getLocalizedWorkshopTitle(workshop, language, t)}
                                />
                            </div>
                        </div>
                        <div className="detail-description">
                            {getLocalizedWorkshopDescription(workshop, language).map((block: any, i: number) => (
                                <p key={i}>{block.children?.map((c: any) => c.text).join('')}</p>
                            ))}
                        </div>

                        {/* 튜터 정보 */}
                        {(getLocalizedWorkshopTutor(workshop, language) || getLocalizedWorkshopTutorBio(workshop, language)) && (
                            <div className="detail-tutor-section">
                                {getLocalizedWorkshopTutor(workshop, language) && (
                                    <div className="detail-tutor-name">{t.workshop.tutorLabel(getLocalizedWorkshopTutor(workshop, language))}</div>
                                )}
                                {getLocalizedWorkshopTutorBio(workshop, language) && (
                                    <div className="detail-tutor-bio">{getLocalizedWorkshopTutorBio(workshop, language)}</div>
                                )}
                            </div>
                        )}

                        {/* 커리큘럼 */}
                        {workshop.curriculum && workshop.curriculum.length > 0 && (
                            <div className="detail-curriculum-section">
                                <div className="detail-section-label">{t.workshop.curriculum}</div>
                                {workshop.curriculum.map((week: any, i: number) => {
                                    const localizedWeek = getLocalizedCurriculumItem(week, language);
                                    return (
                                        <div key={week._key || i} className="curriculum-row">
                                            <span className="curriculum-week">{localizedWeek.weekLabel}</span>
                                            <span className="curriculum-content">{localizedWeek.content}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* 정원 */}
                        {typeof workshop.capacity === 'number' && (
                            <div className="detail-capacity">
                                {t.workshop.capacityLabel(workshop.capacity)}
                            </div>
                        )}

                        {/* 취소 및 환불 정책 아코디언 */}
                        <div className="detail-refund-accordion">
                            <button
                                type="button"
                                className="refund-accordion-trigger"
                                onClick={() => setShowRefundPolicy(!showRefundPolicy)}
                            >
                                <span>{t.workshop.refundPolicy.title}</span>
                                <span className={`accordion-icon ${showRefundPolicy ? 'open' : ''}`}></span>
                            </button>
                            <div className={`refund-accordion-content ${showRefundPolicy ? 'open' : ''}`}>
                                <div className="refund-content-inner">
                                    <p className="refund-intro">
                                        {t.workshop.refundPolicy.intro.map((line: string) => (
                                            <span key={line}>{line} </span>
                                        ))}
                                    </p>

                                    {t.workshop.refundPolicy.sections.map((section: any) => (
                                        <div className="refund-section" key={section.title}>
                                            <h5 className="refund-section-title">{section.title}</h5>
                                            {section.items && (
                                                <ul>
                                                    {section.items.map((item: any) => (
                                                        <li key={`${section.title}-${item.label || item.text}`}>
                                                            {item.label && <strong>{item.label} </strong>}
                                                            {item.text}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                            {section.body && <p>{section.body}</p>}
                                            {section.contactEmailLabel && (
                                                <p className="refund-contact">
                                                    {section.contactEmailLabel}: <a href="mailto:goyangiyoram@gmail.com">goyangiyoram@gmail.com</a>
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="detail-footer-actions">
                            <div className="price-tag">{t.workshop.priceLabel(workshop.price)}</div>
                            {hasSelectableSchedule(workshop) && (
                                <div className="schedule-selector-wrapper">
                                    <button
                                        type="button"
                                        className={`action-btn outline-btn ${selectedSession ? 'selected' : ''}`}
                                        onClick={() => setShowSchedule(!showSchedule)}
                                    >
                                        {selectedSession ? getScheduleSessionLabel(selectedSession, language) : t.workshop.scheduleSelect}
                                    </button>
                                    {showSchedule && (
                                        <div className="schedule-dropdown">
                                            {getWorkshopSchedule(workshop).map((session: any, index: number) => {
                                                const localizedSession = getLocalizedScheduleSession(session, language);
                                                const isFull = isScheduleFull(workshop, session);
                                                return (
                                                    <button
                                                        type="button"
                                                        key={`${session.date || 'date'}-${session.time || 'time'}-${index}`}
                                                        className={`schedule-option ${isFull ? 'is-full' : ''}`}
                                                        disabled={isFull}
                                                        onClick={() => {
                                                            setSelectedSession(session);
                                                            setShowSchedule(false);
                                                        }}
                                                    >
                                                        {localizedSession.date && <span className="s-date">{localizedSession.date}</span>}
                                                        {localizedSession.time && <span className="s-time">{localizedSession.time}</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                            {isRegistered ? (
                                <button className="action-btn registered-status-btn" disabled>
                                    {t.workshop.alreadyApplied}
                                </button>
                            ) : (
                                <button
                                    className={`action-btn fill-btn ${hasSelectableSchedule(workshop) && !selectedSession ? 'locked' : ''}`}
                                    disabled={isApplyDisabled}
                                    aria-busy={isPaymentStarting}
                                    onClick={() => handleWorkshopPayment(workshop)}
                                >
                                    {workshopClosedForPayment || selectedScheduleFull
                                        ? t.workshop.closed
                                        : t.workshop.apply}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
