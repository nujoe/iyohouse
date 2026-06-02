"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfileNavigation } from "@/hooks/useProfileNavigation";
import { loadTossPayments } from "@tosspayments/payment-sdk";
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
    onRequireLogin: () => void;
}

export default function WorkshopDetailOverlay({
    workshop,
    t,
    language,
    registrationCounts,
    onRequireLogin
}: WorkshopDetailOverlayProps) {
    const { user, isProfileComplete, supabase } = useAuth();
    const { goToCompleteProfile } = useProfileNavigation();

    const [showSchedule, setShowSchedule] = useState(false);
    const [selectedSession, setSelectedSession] = useState<any | null>(null);
    const [showRefundPolicy, setShowRefundPolicy] = useState(false);
    const [tossPayments, setTossPayments] = useState<any>(null);
    const [isPaymentStarting, setIsPaymentStarting] = useState(false);

    useEffect(() => {
        const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
        if (!clientKey) {
            console.error('[TossPayments] NEXT_PUBLIC_TOSS_CLIENT_KEY 환경변수가 설정되지 않았습니다.');
            return;
        }
        loadTossPayments(clientKey).then(setTossPayments);
    }, []);

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

    const isWorkshopClosedForPayment = useCallback((ws: any) => {
        const isLegacyClosed = !ws?.isSanity && Number(ws?.id) <= 11;
        return Boolean(
            ws?.isClosed ||
            isLegacyClosed ||
            getWorkshopPaidCount(ws) >= getWorkshopCapacity(ws)
        );
    }, [getWorkshopCapacity, getWorkshopPaidCount]);

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
            alert(t.workshop.missingDbId);
            return;
        }

        if (isWorkshopClosedForPayment(ws)) {
            alert(t.workshop.closedAlert);
            return;
        }

        if (hasSelectableSchedule(ws) && !selectedSession) {
            alert(t.workshop.scheduleRequired);
            setShowSchedule(true);
            return;
        }

        setIsPaymentStarting(true);

        let payments = tossPayments;
        try {
            if (!payments) {
                const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
                if (!clientKey) {
                    alert(t.workshop.paymentMisconfigured);
                    return;
                }
                payments = await loadTossPayments(clientKey);
                setTossPayments(payments);
            }

            if (!payments) {
                alert(t.workshop.paymentPreparing);
                return;
            }

            const { data: regData, error: rpcError } = await supabase.rpc('create_pending_registration', {
                p_workshop_id: dbWorkshopId,
            });

            if (rpcError) throw rpcError;

            const { registration_id, order_id, amount, workshop_title } = regData;

            await payments.requestPayment('카드', {
                amount: amount,
                orderId: order_id,
                orderName: workshop_title || getLocalizedWorkshopTitle(ws, language, t) || t.workshop.fallbackTitle(ws.number || ws.id),
                successUrl: `${window.location.origin}/payment/success?registration_id=${registration_id}${selectedSession ? `&schedule=${encodeURIComponent(getScheduleSessionLabel(selectedSession, language))}` : ''}`,
                failUrl: `${window.location.origin}/payment/fail?registration_id=${registration_id}`,
            });
        } catch (error: any) {
            console.error("신청/결제 요청 에러:", error);
            alert(`${t.workshop.requestError}: ${error.message || t.auth.genericError}`);
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
        selectedSession,
        tossPayments,
        onRequireLogin,
        goToCompleteProfile,
        supabase,
        language
    ]);

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
                                <div className="detail-main-title">{getLocalizedWorkshopTitle(workshop, language, t)}</div>
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
                                                return (
                                                    <button
                                                        type="button"
                                                        key={`${session.date || 'date'}-${session.time || 'time'}-${index}`}
                                                        className="schedule-option"
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
                            <button
                                className={`action-btn fill-btn ${hasSelectableSchedule(workshop) && !selectedSession ? 'locked' : ''}`}
                                disabled={isPaymentStarting || isWorkshopClosedForPayment(workshop)}
                                onClick={() => handleWorkshopPayment(workshop)}
                            >
                                {isWorkshopClosedForPayment(workshop)
                                    ? t.workshop.closed
                                    : isPaymentStarting
                                        ? t.workshop.paymentPreparing
                                        : t.workshop.apply}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
