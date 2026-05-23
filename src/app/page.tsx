"use client";

import { useCallback, useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useWorkshopData } from "@/hooks/useWorkshopData";
import { useAuth } from "@/hooks/useAuth";
import { useGridLayout } from "@/hooks/useGridLayout";
import GridLines from "@/components/GridLines";
import WorkshopGrid from "@/components/WorkshopGrid";
import HomeCalendarCell from "@/components/home/HomeCalendarCell";
import HomeHeader from "@/components/home/HomeHeader";
import HomeMainCell from "@/components/home/HomeMainCell";
import HomeMemberCell from "@/components/home/HomeMemberCell";
import MobileMenu from "@/components/home/MobileMenu";
import LoginModal from "@/components/home/LoginModal";
import WorkshopDetailPoster from "@/components/workshop/WorkshopDetailPoster";
import WorkshopDetailOverlay from "@/components/workshop/WorkshopDetailOverlay";

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
                                    <button className="user-login-btn" onClick={() => { setIsLoginModalOpen(true); setIsSidebarExpanded(false); }}>
                                        {t.auth.login}
                                    </button>
                                    <button className="user-signup-btn" onClick={() => { setIsLoginModalOpen(true); setIsSidebarExpanded(false); }}>
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

            <HomeHeader
                activePreset={activePreset}
                language={language}
                logoRef={logoRef}
                t={t}
                onLanguageChange={setLanguage}
                onPresetChange={handlePresetChange}
                onThemeChange={handleThemeChange}
            />

            {/* Info overlay removed in favor of expandable header-right */}

            <main className="stage">
                <div className="grid-frame">


                    <div className={`cell cell-workshop ${activePreset === 'workshop' ? 'active' : ''}`}>
                        <div className="cell-cover"></div>
                        <div className="cell-content workshop-wrapper" onScroll={handleScroll}>
                            {visited.workshop && (
                                selectedWorkshop ? (
                                    <WorkshopDetailOverlay 
                                        workshop={selectedWorkshop}
                                        t={t}
                                        language={language}
                                        showSchedule={showSchedule}
                                        setShowSchedule={setShowSchedule}
                                        selectedSession={selectedSession}
                                        setSelectedSession={setSelectedSession}
                                        showRefundPolicy={showRefundPolicy}
                                        setShowRefundPolicy={setShowRefundPolicy}
                                        hasSelectableSchedule={hasSelectableSchedule}
                                        getWorkshopSchedule={getWorkshopSchedule}
                                        isWorkshopClosedForPayment={isWorkshopClosedForPayment}
                                        handleWorkshopPayment={handleWorkshopPayment}
                                    />
                                ) : (
                                    <WorkshopGrid workshops={allWorkshops} registrationCounts={registrationCounts} onSelectWorkshop={handleSelectWorkshop} getTagColor={getTagColor} />
                                )
                            )}
                        </div>
                    </div>

                    <HomeCalendarCell
                        activePreset={activePreset}
                        calendarEvents={calendarEvents}
                        currentMonth={currentMonth}
                        isVisited={Boolean(visited.diary)}
                        onMonthChange={setCurrentMonth}
                    />

                    <HomeMainCell activePreset={activePreset} t={t} />

                    <HomeMemberCell activePreset={activePreset} isVisited={Boolean(visited.member)} />

                    <GridLines />
                </div>
            </main>


            <MobileMenu
                isOpen={isMenuOpen}
                t={t}
                onClose={() => setIsMenuOpen(false)}
                onPresetChange={handlePresetChange}
            />

            {isMounted && (
                <>
                    <LoginModal 
                        isOpen={isLoginModalOpen} 
                        onClose={() => setIsLoginModalOpen(false)} 
                    />
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
