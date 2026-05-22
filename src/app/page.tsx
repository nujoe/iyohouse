"use client";

import { useCallback, useEffect, useState, useRef, CSSProperties, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Image from "next/image";
import { urlFor } from "@/sanity/image";
import { useWorkshopData } from "@/hooks/useWorkshopData";
import { useAuth } from "@/hooks/useAuth";
import { useGridLayout } from "@/hooks/useGridLayout";
import GridLines from "@/components/GridLines";
import WorkshopGrid from "@/components/WorkshopGrid";
import CalendarView from "@/components/CalendarView";
import MemberView from "@/components/MemberView";

import MemberVisualStack from "@/components/MemberVisualStack";
import { getLegacyPosterMeta } from "@/lib/legacyPosters";
import ChatbotWidget from "@/features/iyohouse-chatbot/components/ChatbotWidget";
import { useLanguage } from "@/lib/i18n";
import {
    getLocalizedCurriculumItem,
    getLocalizedScheduleSession,
    getLocalizedWorkshopDescription,
    getLocalizedWorkshopTitle,
    getLocalizedWorkshopTutor,
    getLocalizedWorkshopTutorBio,
    getScheduleSessionLabel,
} from "@/lib/i18n/workshopLocalization";
import { loadTossPayments } from "@tosspayments/payment-sdk";

const getTagColor = (tag: string) => {
    const t = tag.toUpperCase().trim();
    if (t === 'WORKSHOP') return 'yellow';
    if (t === 'TALK') return 'blue';
    if (t === 'IYOCA') return 'green';
    return 'gray';
};

const THEME_COLORS = [
    "#ff3838ff",
    "#ff00ff",
    "#00ffff",
    "#7cfc00",
    "#ff4500",
    "#1e90ff",
    "#f0f0f0ff"
];

const noopScrollHandler = () => { };

const createLegacyWorkshop = (id: number) => ({
    id,
    isSanity: false,
    sortNum: id,
    title: `AI.zip ${id}`,
    tutor: "000 @asdf1234",
    price: 150000,
    capacity: 8,
    tags: ["AI", "WORKSHOP", "GRAPHIC"],
    isClosed: id <= 11,
});

const HYDRATION_SAFE_CALENDAR_MONTH = new Date("2000-01-01T12:00:00.000Z");

const getClientCurrentMonth = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
};

function HomeContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();

    const {
        sanityWorkshops,
        registrationCounts,
        calendarEvents,
        allWorkshops,
    } = useWorkshopData();

    const { user, profile, isLoading: authLoading, isProfileComplete, signOut, supabase, signInWithGoogle, signInWithKakao, signInWithEmail, signUpWithEmail } = useAuth();

    const { language, t, setLanguage } = useLanguage();
    const [activePreset, setActivePreset] = useState<string>("main");
    const [selectedWorkshop, setSelectedWorkshop] = useState<any | null>(null);
    const [dynamicColor, setDynamicColor] = useState("#f8f01dff");
    const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(HYDRATION_SAFE_CALENDAR_MONTH);
    const [isContactOpen, setIsContactOpen] = useState(false);
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const logoRef = useRef<HTMLDivElement>(null);
    const [logoWidth, setLogoWidth] = useState("32rem");
    const [logoHeight, setLogoHeight] = useState("5.2rem");

    const [isBooting, setIsBooting] = useState(true);
    const [isMounted, setIsMounted] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Email login/signup states
    const [loginEmail, setLoginEmail] = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    const [isSignUpMode, setIsSignUpMode] = useState(false);
    const [loginError, setLoginError] = useState<string | null>(null);
    const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);

    useEffect(() => {
        if (!isLoginModalOpen) {
            setLoginEmail("");
            setLoginPassword("");
            setIsSignUpMode(false);
            setLoginError(null);
            setIsLoginSubmitting(false);
        }
    }, [isLoginModalOpen]);

    const handleEmailAuthSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError(null);
        setIsLoginSubmitting(true);

        if (!loginEmail || !loginPassword) {
            setLoginError(t.auth.emailRequired);
            setIsLoginSubmitting(false);
            return;
        }

        if (loginPassword.length < 6) {
            setLoginError(t.auth.passwordMin);
            setIsLoginSubmitting(false);
            return;
        }

        try {
            if (isSignUpMode) {
                const { error } = await signUpWithEmail(loginEmail, loginPassword);
                if (error) {
                    setLoginError(error.message);
                } else {
                    alert(t.auth.signupDone);
                    setIsLoginModalOpen(false);
                }
            } else {
                const { error } = await signInWithEmail(loginEmail, loginPassword);
                if (error) {
                    setLoginError(error.message);
                } else {
                    setIsLoginModalOpen(false);
                }
            }
        } catch (err: any) {
            setLoginError(err.message || t.auth.genericError);
        } finally {
            setIsLoginSubmitting(false);
        }
    }, [isSignUpMode, loginEmail, loginPassword, signInWithEmail, signUpWithEmail, t]);

    // 프리셋(메뉴) 혹은 상세 항목 변경 시 스크롤 위치를 항상 최상단으로 리셋
    useEffect(() => {
        const scrollContainers = document.querySelectorAll('.scroll-container');
        scrollContainers.forEach(container => {
            container.scrollTop = 0;
        });
    }, [activePreset, selectedWorkshop]);

    useEffect(() => {
        setCurrentMonth(getClientCurrentMonth());
    }, []);

    const getCurrentNextPath = useCallback(() => {
        const query = searchParams.toString();
        return `${pathname}${query ? `?${query}` : ''}`;
    }, [pathname, searchParams]);

    const goToCompleteProfile = useCallback(() => {
        const currentPath = getCurrentNextPath();
        const nextPath = currentPath.startsWith('/complete-profile') ? '/' : currentPath;
        router.push(`/complete-profile?next=${encodeURIComponent(nextPath)}`);
    }, [getCurrentNextPath, router]);

    // 인증 후 프로필 미완성 시 전용 가입 완료 페이지로 이동
    useEffect(() => {
        if (!authLoading && user && !isProfileComplete) {
            const currentPath = getCurrentNextPath();
            const nextPath = currentPath.startsWith('/complete-profile') ? '/' : currentPath;
            router.replace(`/complete-profile?next=${encodeURIComponent(nextPath)}`);
        }
    }, [authLoading, getCurrentNextPath, isProfileComplete, router, user]);

    // 로고 너비 동적 측정 (ResizeObserver 사용)
    useEffect(() => {
        if (!logoRef.current) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.target === logoRef.current) {
                    const width = entry.borderBoxSize?.[0]?.inlineSize || entry.contentRect.width;
                    const height = entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height;
                    const nextWidth = `${width}px`;
                    // 텍스트 아래로 넉넉하게 내려가도록 20px 오프셋 추가
                    const nextHeight = `${height + 20}px`;
                    setLogoWidth(prev => prev === nextWidth ? prev : nextWidth);
                    setLogoHeight(prev => prev === nextHeight ? prev : nextHeight);
                }
            }
        });

        observer.observe(logoRef.current);
        return () => observer.disconnect();
    }, []);


    useEffect(() => {
        setIsMounted(true);

        const raf = requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setIsBooting(false);
            });
        });
        return () => {
            cancelAnimationFrame(raf);
        };
    }, []);

    const [visited, setVisited] = useState<Record<string, boolean>>({ main: true });

    const [contactData, setContactData] = useState({ email: '', subject: '', message: '' });
    const [isSending, setIsSending] = useState(false);
    const [tossPayments, setTossPayments] = useState<any>(null);
    const [showSchedule, setShowSchedule] = useState(false);
    const [selectedSession, setSelectedSession] = useState<any | null>(null);
    const [showRefundPolicy, setShowRefundPolicy] = useState(false);

    useEffect(() => {
        const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
        if (!clientKey) {
            console.error('[TossPayments] NEXT_PUBLIC_TOSS_CLIENT_KEY 환경변수가 설정되지 않았습니다.');
            return;
        }
        loadTossPayments(clientKey).then(setTossPayments);
    }, []);

    useEffect(() => {
        const workshopId = searchParams.get('workshop');
        const presetId = searchParams.get('preset');

        if (workshopId) {
            const legacyId = Number(workshopId);
            const found = sanityWorkshops.find(w => (w._id || w.id)?.toString() === workshopId)
                || (Number.isInteger(legacyId) && legacyId > 0 && legacyId <= 24
                    ? createLegacyWorkshop(legacyId)
                    : null);

            if (found) {
                setSelectedWorkshop(found);
                setActivePreset('workshop');
                setVisited(v => v.workshop ? v : { ...v, workshop: true });
                setSelectedSession(null);
                setShowSchedule(false);
                setShowRefundPolicy(false);
                return;
            }
        }

        if (presetId) {
            setActivePreset(presetId);
            setVisited(v => v[presetId] ? v : { ...v, [presetId]: true });
            setSelectedWorkshop(null);
            setShowRefundPolicy(false);
        } else {
            setSelectedWorkshop(null);
            setActivePreset('main');
            setShowRefundPolicy(false);
        }
    }, [searchParams, sanityWorkshops]);

    const createQueryString = useCallback((name: string, value: string | null) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set(name, value);
        else params.delete(name);
        return params.toString();
    }, [searchParams]);

    const handleSelectWorkshop = useCallback((workshop: any) => {
        const id = workshop._id || workshop.id;
        router.push(`${pathname}?${createQueryString('workshop', id.toString())}`, { scroll: false });
    }, [createQueryString, pathname, router]);

    const handlePresetChange = useCallback((preset: string) => {
        if (preset === 'contact') {
            setIsContactOpen(open => !open);
            return;
        }
        setIsContactOpen(false);
        setVisited(v => v[preset] ? v : { ...v, [preset]: true });
        const params = new URLSearchParams(createQueryString('preset', preset === 'main' ? null : preset));
        params.delete('workshop');
        router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
        setActivePreset(preset);
        setSelectedWorkshop(null);

        setSelectedSession(null);
        setShowSchedule(false);
        setShowRefundPolicy(false);
        setIsContactOpen(false);
    }, [createQueryString, pathname, router]);

    const handleScroll = noopScrollHandler;

    const handleThemeChange = useCallback(() => {
        setDynamicColor(currentColor => {
            const currentIndex = THEME_COLORS.indexOf(currentColor);
            const nextIndex = (currentIndex + 1) % THEME_COLORS.length;
            return THEME_COLORS[nextIndex];
        });
    }, []);



    const handleContactSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!contactData.email || !contactData.message) {
            alert(t.contact.required);
            return;
        }
        setIsSending(true);
        try {
            const response = await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(contactData),
            });
            const result = await response.json();
            if (result.success) {
                alert(t.contact.success);
                setContactData({ email: '', subject: '', message: '' });
            } else throw new Error(result.error);
        } catch (error) {
            console.error('이메일 전송 실패:', error);
            alert(t.contact.error);
        } finally { setIsSending(false); }
    }, [contactData, t]);

    const getWorkshopCapacity = useCallback((workshop: any) =>
        typeof workshop?.capacity === 'number' ? workshop.capacity : 8, []);

    const getWorkshopPaidCount = useCallback((workshop: any) => {
        const dbId = workshop?.supabase_workshop_id;
        return dbId ? registrationCounts[dbId] || 0 : 0;
    }, [registrationCounts]);

    const getWorkshopSchedule = useCallback((workshop: any) =>
        Array.isArray(workshop?.schedule)
            ? workshop.schedule.filter((session: any) => session?.date || session?.time)
            : [], []);

    const hasSelectableSchedule = useCallback((workshop: any) => getWorkshopSchedule(workshop).length > 0, [getWorkshopSchedule]);

    const isWorkshopClosedForPayment = useCallback((workshop: any) => {
        const isLegacyClosed = !workshop?.isSanity && Number(workshop?.id) <= 11;
        return Boolean(
            workshop?.isClosed ||
            isLegacyClosed ||
            getWorkshopPaidCount(workshop) >= getWorkshopCapacity(workshop)
        );
    }, [getWorkshopCapacity, getWorkshopPaidCount]);

    const handleWorkshopPayment = useCallback(async (workshop: any) => {
        if (!user) {
            setIsLoginModalOpen(true);
            return;
        }

        if (!isProfileComplete) {
            goToCompleteProfile();
            return;
        }

        const dbWorkshopId = workshop.supabase_workshop_id;
        if (!dbWorkshopId) {
            alert(t.workshop.missingDbId);
            return;
        }

        if (isWorkshopClosedForPayment(workshop)) {
            alert(t.workshop.closedAlert);
            return;
        }

        if (hasSelectableSchedule(workshop) && !selectedSession) {
            alert(t.workshop.scheduleRequired);
            setShowSchedule(true);
            return;
        }

        // 1. Initialize Toss Payments before pending registration
        let payments = tossPayments;
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

        try {
            // 2. Create pending registration via RPC
            const { data: regData, error: rpcError } = await supabase.rpc('create_pending_registration', {
                p_workshop_id: dbWorkshopId,
            });

            if (rpcError) throw rpcError;

            // regData contains { registration_id, order_id, amount, workshop_title }
            const { registration_id, order_id, amount, workshop_title } = regData;

            // 3. Request Payment
            await payments.requestPayment('카드', {
                amount: amount,
                orderId: order_id,
                orderName: workshop_title || getLocalizedWorkshopTitle(workshop, language, t) || t.workshop.fallbackTitle(workshop.number || workshop.id),
                successUrl: `${window.location.origin}/payment/success?registration_id=${registration_id}${selectedSession ? `&schedule=${encodeURIComponent(getScheduleSessionLabel(selectedSession, language))}` : ''}`,
                failUrl: `${window.location.origin}/payment/fail?registration_id=${registration_id}`,
            });
        } catch (error: any) {
            console.error("신청/결제 요청 에러:", error);
            alert(`${t.workshop.requestError}: ${error.message || t.auth.genericError}`);
        }
    }, [
        getWorkshopCapacity,
        getWorkshopPaidCount,
        goToCompleteProfile,
        hasSelectableSchedule,
        isProfileComplete,
        isWorkshopClosedForPayment,
        language,
        selectedSession,
        supabase,
        t,
        tossPayments,
        user,
    ]);

    const { containerStyle, rootGridStyle } = useGridLayout({
        activePreset,
        logoWidth,
        logoHeight,
        isSidebarExpanded,
        isContactOpen,
        dynamicColor,
    });

    return (
        <div ref={containerRef} style={containerStyle} className={`app-container preset-${activePreset} ${isContactOpen ? 'contact-open' : ''} ${isBooting ? 'is-booting' : ''}`}>
            <style>{rootGridStyle}</style>

            <div className={`left-panel ${isSidebarExpanded || isContactOpen ? 'expanded' : ''} ${isContactOpen ? 'contact-mode' : ''}`} onClick={() => !isContactOpen && setIsSidebarExpanded(!isSidebarExpanded)}>
                <div
                    className="panel-icon"
                    style={{ opacity: isSidebarExpanded || isContactOpen ? 0 : 1, pointerEvents: isSidebarExpanded || isContactOpen ? 'none' : 'auto' }}
                    onClick={(e) => { if (isContactOpen) { e.stopPropagation(); setIsContactOpen(false); } }}
                >
                    <span></span>
                    <span></span>
                    <span></span>
                </div>

                {(isSidebarExpanded || isContactOpen) && (
                    <button
                        className="sidebar-close-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (isContactOpen) {
                                setIsContactOpen(false);
                            } else {
                                setIsSidebarExpanded(false);
                            }
                        }}
                    >
                        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                )}

                {!isContactOpen ? (
                    <nav className="sidebar-nav" onClick={(e) => e.stopPropagation()}>
                        <div className="sidebar-nav-top">
                            <button className={`${activePreset === 'main' ? 'active' : ''}`} onClick={() => { handlePresetChange('main'); setIsSidebarExpanded(false); }}>{t.nav.main}</button>
                            <button className={`${activePreset === 'member' ? 'active' : ''}`} onClick={() => { handlePresetChange('member'); setIsSidebarExpanded(false); }}>{t.nav.member}</button>
                            <button className={`${activePreset === 'workshop' ? 'active' : ''}`} onClick={() => { handlePresetChange('workshop'); setIsSidebarExpanded(false); }}>{t.nav.workshop}</button>
                            <button className={`${activePreset === 'diary' ? 'active' : ''}`} onClick={() => { handlePresetChange('diary'); setIsSidebarExpanded(false); }}>{t.nav.calendar}</button>
                            <button className={`${isContactOpen ? 'active' : ''}`} onClick={() => { handlePresetChange('contact'); }}>{t.nav.contact}</button>
                        </div>

                        <div className="sidebar-nav-bottom">
                            {!user ? (
                                <>
                                    <button className="user-login-btn" onClick={() => { setIsSignUpMode(false); setIsLoginModalOpen(true); setIsSidebarExpanded(false); }}>
                                        {t.auth.login}
                                    </button>
                                    <button className="user-signup-btn" onClick={() => { setIsSignUpMode(true); setIsLoginModalOpen(true); setIsSidebarExpanded(false); }}>
                                        {t.auth.signup}
                                    </button>
                                </>
                            ) : !isProfileComplete ? (
                                <>
                                    <button className="user-signup-btn" onClick={() => { goToCompleteProfile(); setIsSidebarExpanded(false); }}>
                                        {t.auth.editProfile}
                                    </button>
                                    <button className="user-login-btn" onClick={async () => { await signOut(); setIsSidebarExpanded(false); }}>
                                        {t.auth.logout}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button className="user-signup-btn" onClick={() => { setIsLoginModalOpen(true); setIsSidebarExpanded(false); }}>
                                        {t.auth.editProfile}
                                    </button>
                                    <button className="user-login-btn" onClick={async () => { await signOut(); setIsSidebarExpanded(false); }}>
                                        {t.auth.logout}
                                    </button>
                                </>
                            )}
                        </div>
                    </nav>
                ) : (
                    <div className="contact-sidebar-content" onClick={(e) => e.stopPropagation()}>
                        <form className="contact-form-classic" onSubmit={handleContactSubmit}>
                            <div className="contact-sidebar-header">
                                <h2 className="modal-title">{t.contact.title}</h2>
                            </div>

                            <div className="contact-main-scroll">
                                <div className="form-classic-row">
                                    <input type="email" placeholder={t.contact.email} className="form-input-classic" value={contactData.email} onChange={(e) => setContactData({ ...contactData, email: e.target.value })} required />
                                </div>
                                <div className="form-classic-row">
                                    <input type="text" placeholder={t.contact.subject} className="form-input-classic" value={contactData.subject} onChange={(e) => setContactData({ ...contactData, subject: e.target.value })} />
                                </div>
                                <div className="form-classic-row flex-textarea">
                                    <textarea placeholder={t.contact.message} className="form-textarea-classic" value={contactData.message} onChange={(e) => setContactData({ ...contactData, message: e.target.value })} required></textarea>
                                </div>
                            </div>

                            <div className="form-submit-row">
                                <button type="submit" className="form-submit-btn-classic" disabled={isSending}>
                                    {isSending ? t.contact.sending : t.contact.send}
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </div>

            <header className="header">
                <div className="header-left" ref={logoRef} onClick={() => handlePresetChange('main')} style={{ cursor: 'pointer' }}>
                    <div className="logo-main-text">iYOHOUSE</div>
                </div>
                <div className="btn-sep"></div>
                <div className="header-right">
                    <button
                        className={`header-nav-item ${activePreset === 'member' ? 'active' : ''}`}
                        onClick={() => handlePresetChange('member')}
                    >
                        {t.nav.member}
                    </button>

                    <div className="header-lang">
                        <button
                            type="button"
                            className={language === "ko" ? "active" : ""}
                            onClick={() => setLanguage("ko")}
                            aria-pressed={language === "ko"}
                        >
                            KOR
                        </button>
                        <span aria-hidden="true">/</span>
                        <button
                            type="button"
                            className={language === "en" ? "active" : ""}
                            onClick={() => setLanguage("en")}
                            aria-pressed={language === "en"}
                        >
                            ENG
                        </button>
                    </div>

                    <button className="header-email" onClick={() => handlePresetChange('contact')}>
                        goyangiyoram@gmail.com
                    </button>
                    <button className="header-theme-btn" onClick={handleThemeChange} title="Change Theme Color">
                        <div className="theme-dot"></div>
                    </button>
                </div>
            </header>

            {/* Info overlay removed in favor of expandable header-right */}

            <main className="stage">
                <div className="grid-frame">


                    <div className={`cell cell-workshop ${activePreset === 'workshop' ? 'active' : ''}`}>
                        <div className="cell-cover"></div>
                        <div className="cell-content workshop-wrapper" onScroll={handleScroll}>
                            {visited.workshop && (
                                selectedWorkshop ? (
                                    <div className="workshop-detail-container">
                                        <div className="detail-layout">
                                            <div className="detail-left">
                                                <div className="detail-poster-wrapper">
                                                    {(() => {
                                                        const isSanity = !!selectedWorkshop._id;
                                                        const legacyPoster = !isSanity ? getLegacyPosterMeta(Number(selectedWorkshop.id)) : null;
                                                        let posterWidth = legacyPoster?.width || 1080;
                                                        let posterHeight = legacyPoster?.height || 1350;
                                                        if (isSanity && selectedWorkshop.posterMeta) {
                                                            posterWidth = selectedWorkshop.posterMeta.width;
                                                            posterHeight = selectedWorkshop.posterMeta.height;
                                                        }
                                                        const aspectRatio = `${posterWidth} / ${posterHeight}`;

                                                        const imgUrl = isSanity
                                                            ? (selectedWorkshop.poster ? urlFor(selectedWorkshop.poster).width(1200).auto('format').url() : null)
                                                            : legacyPoster?.src;

                                                        return imgUrl ? (
                                                            <div className="detail-poster-aspect-box" style={{ "--aspect-ratio": aspectRatio } as CSSProperties}>
                                                                <Image
                                                                    src={imgUrl}
                                                                    className="detail-main-poster"
                                                                    alt="Poster"
                                                                    width={posterWidth}
                                                                    height={posterHeight}
                                                                    sizes="(max-width: 1000px) 100vw, 45vw"
                                                                    loading="lazy"
                                                                    style={{
                                                                        width: '100%',
                                                                        height: '100%',
                                                                        objectFit: 'contain',
                                                                        objectPosition: 'center',
                                                                    }}
                                                                />
                                                            </div>
                                                        ) : null;
                                                    })()}
                                                </div>
                                            </div>
                                            <div className="detail-right">
                                                <div className="detail-info-inner">
                                                    <div className="detail-info-header">
                                                        <div className="detail-tags">
                                                            <span className="pills pill-yellow">WORKSHOP</span>
                                                        </div>
                                                        <div className="detail-title-wrapper">
                                                            <div className="detail-main-title">{getLocalizedWorkshopTitle(selectedWorkshop, language, t)}</div>
                                                        </div>
                                                    </div>
                                                    <div className="detail-description">
                                                        {getLocalizedWorkshopDescription(selectedWorkshop, language).map((block: any, i: number) => (<p key={i}>{block.children?.map((c: any) => c.text).join('')}</p>))}
                                                    </div>

                                                    {/* 튜터 정보 */}
                                                    {(getLocalizedWorkshopTutor(selectedWorkshop, language) || getLocalizedWorkshopTutorBio(selectedWorkshop, language)) && (
                                                        <div className="detail-tutor-section">
                                                            {getLocalizedWorkshopTutor(selectedWorkshop, language) && (
                                                                <div className="detail-tutor-name">{t.workshop.tutorLabel(getLocalizedWorkshopTutor(selectedWorkshop, language))}</div>
                                                            )}
                                                            {getLocalizedWorkshopTutorBio(selectedWorkshop, language) && (
                                                                <div className="detail-tutor-bio">{getLocalizedWorkshopTutorBio(selectedWorkshop, language)}</div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* 커리큘럼 */}
                                                    {selectedWorkshop.curriculum && selectedWorkshop.curriculum.length > 0 && (
                                                        <div className="detail-curriculum-section">
                                                            <div className="detail-section-label">{t.workshop.curriculum}</div>
                                                            {selectedWorkshop.curriculum.map((week: any, i: number) => {
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
                                                    {typeof selectedWorkshop.capacity === 'number' && (
                                                        <div className="detail-capacity">
                                                            {t.workshop.capacityLabel(selectedWorkshop.capacity)}
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
                                                                    {t.workshop.refundPolicy.intro.map((line) => (
                                                                        <span key={line}>{line} </span>
                                                                    ))}
                                                                </p>

                                                                {t.workshop.refundPolicy.sections.map((section) => (
                                                                    <div className="refund-section" key={section.title}>
                                                                        <h5 className="refund-section-title">{section.title}</h5>
                                                                        {section.items && (
                                                                            <ul>
                                                                                {section.items.map((item) => (
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
                                                        <div className="price-tag">{t.workshop.priceLabel(selectedWorkshop.price)}</div>
                                                        {hasSelectableSchedule(selectedWorkshop) && (
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
                                                                        {getWorkshopSchedule(selectedWorkshop).map((session: any, index: number) => {
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
                                                            className={`action-btn fill-btn ${hasSelectableSchedule(selectedWorkshop) && !selectedSession ? 'locked' : ''}`}
                                                            disabled={isWorkshopClosedForPayment(selectedWorkshop)}
                                                            onClick={() => handleWorkshopPayment(selectedWorkshop)}
                                                        >
                                                            {isWorkshopClosedForPayment(selectedWorkshop) ? t.workshop.closed : t.workshop.apply}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <WorkshopGrid workshops={allWorkshops} registrationCounts={registrationCounts} onSelectWorkshop={handleSelectWorkshop} getTagColor={getTagColor} />
                                )
                            )}
                        </div>
                    </div>

                    <div className={`cell cell-diary ${activePreset === 'diary' ? 'active' : ''}`}>
                        <div className="cell-cover"></div>
                        <div className="cell-content diary-wrapper">
                            {visited.diary && <CalendarView currentMonth={currentMonth} onMonthChange={setCurrentMonth} calendarEvents={calendarEvents} />}
                        </div>
                    </div>

                    <div className={`cell cell-main ${activePreset === 'main' ? 'active' : ''}`}>
                        <div className="cell-cover"></div>
                        <div className="cell-content main-content-layout">
                            <div className="main-text-column">
                                <div className="main-intro-text">
                                    {t.mainIntro}
                                </div>
                                <div className="info-bottom-text-wrapper">
                                    <div className="info-bottom-text">info</div>
                                    <div className="business-info-overlay">
                                        <strong>{t.footer.company}</strong><br />
                                        {t.footer.address}<br />
                                        {t.footer.businessLicense}<br />
                                        {t.footer.mallOrderLicense}<br />
                                        {t.footer.email}<br />
                                        WEBSITE :  <a href="https://www.instagram.com/djwns1234/" target="_blank" rel="noopener noreferrer">@djwns1234</a>
                                    </div>
                                </div>
                            </div>
                            <div className="main-visual-column">
                                <MemberVisualStack />
                            </div>
                        </div>
                    </div>

                    <div className={`cell cell-member ${activePreset === 'member' ? 'active' : ''}`}>
                        <div className="cell-cover"></div>
                        <div className="cell-content">
                            {visited.member && <MemberView />}
                        </div>
                    </div>

                    <GridLines />
                </div>
            </main>


            {/* Mobile Menu Overlay */}
            <div className={`mobile-menu-overlay ${isMenuOpen ? 'active' : ''}`}>
                <div className="mobile-menu-inner">
                    <div className="mobile-menu-header">
                        <div className="logo-text">
                            <span className="logo-title">IYOHOUSE</span>
                        </div>
                        <button className="menu-close-btn" onClick={() => setIsMenuOpen(false)}>
                            <div className="close-icon"></div>
                        </button>
                    </div>

                    <div className="mobile-menu-content-frame">
                        <div className="mobile-menu-list">
                            <button className="mobile-menu-item" onClick={() => { handlePresetChange('main'); setIsMenuOpen(false); }}>
                                <span className="item-label">{t.nav.main}</span>
                            </button>
                            <button className="mobile-menu-item" onClick={() => { handlePresetChange('member'); setIsMenuOpen(false); }}>
                                <span className="item-label">{t.nav.member}</span>
                            </button>
                            <button className="mobile-menu-item" onClick={() => { handlePresetChange('workshop'); setIsMenuOpen(false); }}>
                                <span className="item-label">{t.nav.workshop}</span>
                            </button>
                            <button className="mobile-menu-item" onClick={() => { handlePresetChange('diary'); setIsMenuOpen(false); }}>
                                <span className="item-label">{t.nav.calendar}</span>
                            </button>
                            <button className="mobile-menu-item" onClick={() => { handlePresetChange('contact'); setIsMenuOpen(false); }}>
                                <span className="item-label">{t.nav.contact}</span>
                            </button>
                        </div>
                        <div className="mobile-menu-footer">
                            <div className="footer-line">  <strong>{t.footer.company}</strong><br />
                                {t.footer.address}<br />
                                {t.footer.businessLicense}<br />
                                {t.footer.mallOrderLicense}<br />
                                {t.footer.email}<br />
                                {t.footer.websiteDesign} <a href="https://www.instagram.com/djwns1234/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 'bold' }}>@djwns1234</a>
                            </div>

                        </div>
                    </div>
                </div>
            </div>

            {isMounted && (
                <>
                    {/* Login Modal Overlay */}
                    <div className={`login-overlay-wrapper ${isLoginModalOpen ? 'active' : ''}`}>
                        <div className="login-dimmer" onClick={() => setIsLoginModalOpen(false)}></div>
                        <div className="login-modal-card">
                            <div className="login-modal-header">

                                <button className="login-close-btn" onClick={() => setIsLoginModalOpen(false)}>&times;</button>
                            </div>
                            <div className="login-modal-body">
                                {user ? (
                                    /* 로그인 상태 */
                                    <div className="login-intro">
                                        <h3>IYOHOUSE</h3>

                                        {!isProfileComplete ? (
                                            /* 프로필 미완성: 전용 가입 완료 페이지로 이동 */
                                            <div className="profile-setup-container" style={{ marginTop: '24px', textAlign: 'left' }}>
                                                <p style={{ fontSize: '13px', marginBottom: '20px', opacity: 0.7 }}>
                                                    {t.auth.completePrompt}
                                                </p>
                                                <button
                                                    type="button"
                                                    className="email-submit-btn"
                                                    style={{ width: '100%' }}
                                                    onClick={() => { setIsLoginModalOpen(false); goToCompleteProfile(); }}
                                                >
                                                    {t.auth.completeAction}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="social-btn"
                                                    style={{ marginTop: '10px', width: '100%', justifyContent: 'center', background: 'transparent', border: '1px solid #ddd', color: '#666' }}
                                                    onClick={() => signOut()}
                                                >
                                                    {t.auth.logout}
                                                </button>
                                            </div>
                                        ) : (
                                            /* 프로필 완성: 일반 로그인 상태 */
                                            <div className="profile-welcome-container" style={{ marginTop: '24px' }}>
                                                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{t.auth.welcome(profile?.full_name)}</div>
                                                <div style={{ marginTop: '8px', fontSize: '14px', opacity: 0.6 }}>{user.email}</div>

                                                <div className="profile-info-display" style={{ marginTop: '20px', textAlign: 'left', background: '#f9f9f9', padding: '15px', borderRadius: '8px' }}>
                                                    <div style={{ fontSize: '12px', opacity: 0.5 }}>{t.auth.bioLabel}</div>
                                                    <div style={{ marginTop: '5px', fontSize: '14px', lineHeight: '1.5' }}>{profile?.bio || t.auth.noBio}</div>
                                                </div>

                                                <button
                                                    className="email-submit-btn"
                                                    style={{ marginTop: '30px' }}
                                                    onClick={async () => { await signOut(); setIsLoginModalOpen(false); }}
                                                >
                                                    {t.auth.logout}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    /* 비로그인 상태 */
                                    <>
                                        <div className="login-intro">
                                            <h3>IYOHOUSE</h3>
                                        </div>

                                        <div className="social-login-group">
                                            <button className="social-btn kakao" onClick={signInWithKakao}>
                                                <span className="btn-icon">K</span>
                                                <span className="btn-text">{t.auth.kakao}</span>
                                            </button>
                                            <button className="social-btn google" onClick={signInWithGoogle}>
                                                <span className="btn-icon">G</span>
                                                <span className="btn-text">{t.auth.google}</span>
                                            </button>
                                        </div>

                                        <div className="login-divider">
                                            <span>OR</span>
                                        </div>

                                        <form className="email-login-form" onSubmit={handleEmailAuthSubmit}>
                                            <input
                                                type="email"
                                                placeholder={t.auth.emailPlaceholder}
                                                className="login-input"
                                                value={loginEmail}
                                                onChange={(e) => setLoginEmail(e.target.value)}
                                                required
                                                disabled={isLoginSubmitting}
                                            />
                                            <input
                                                type="password"
                                                placeholder={t.auth.passwordPlaceholder}
                                                className="login-input"
                                                value={loginPassword}
                                                onChange={(e) => setLoginPassword(e.target.value)}
                                                required
                                                disabled={isLoginSubmitting}
                                            />
                                            {loginError && (
                                                <div style={{ color: '#c80000', fontSize: '12px', marginTop: '4px', textAlign: 'center' }}>
                                                    {loginError}
                                                </div>
                                            )}
                                            <button
                                                type="submit"
                                                className="email-submit-btn"
                                                disabled={isLoginSubmitting}
                                            >
                                                {isLoginSubmitting ? t.auth.submitting : (isSignUpMode ? t.auth.emailSignup : t.auth.emailLogin)}
                                            </button>
                                        </form>

                                        <div style={{ textAlign: 'center', marginTop: '10px', marginBottom: '20px', fontSize: '13px' }}>
                                            <span style={{ color: '#666' }}>
                                                {isSignUpMode ? t.auth.hasAccount : t.auth.noAccount}
                                            </span>{" "}
                                            <button
                                                type="button"
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: '#000',
                                                    fontWeight: 'bold',
                                                    textDecoration: 'underline',
                                                    cursor: 'pointer',
                                                    padding: 0,
                                                    fontSize: 'inherit'
                                                }}
                                                onClick={() => {
                                                    setIsSignUpMode(!isSignUpMode);
                                                    setLoginError(null);
                                                }}
                                                disabled={isLoginSubmitting}
                                            >
                                                {isSignUpMode ? t.auth.switchToLogin : t.auth.switchToSignup}
                                            </button>
                                        </div>

                                        <div className="login-notice">
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}

            <ChatbotWidget />
        </div>
    );
}

export default function Home() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <HomeContent />
        </Suspense>
    );
}
