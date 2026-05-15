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
    title: `AI.zip ${id} 그래픽`,
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

    const { user, profile, isLoading: authLoading, isProfileComplete, signOut, supabase, signInWithGoogle, signInWithKakao } = useAuth();

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
                    setLogoWidth(`${width}px`);
                    // 텍스트 아래로 넉넉하게 내려가도록 20px 오프셋 추가
                    setLogoHeight(`${height + 20}px`);
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

    useEffect(() => {
        const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || "test_ck_ALnQvDd2VJl6vpNz1RRO8Mj7X41m";
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
                setVisited(v => ({ ...v, workshop: true }));
                setSelectedSession(null);
                setShowSchedule(false);
                return;
            }
        }

        if (presetId) {
            setActivePreset(presetId);
            setVisited(v => ({ ...v, [presetId]: true }));
            setSelectedWorkshop(null);
        } else {
            setSelectedWorkshop(null);
            setActivePreset('main');
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
        setVisited(v => ({ ...v, [preset]: true }));
        const params = new URLSearchParams(createQueryString('preset', preset === 'main' ? null : preset));
        params.delete('workshop');
        router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
        setActivePreset(preset);
        setSelectedWorkshop(null);

        setSelectedSession(null);
        setShowSchedule(false);
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
            alert("이메일과 내용을 입력해 주세요.");
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
                alert("문의가 성공적으로 전송되었습니다! 곧 연락드릴게요.");
                setContactData({ email: '', subject: '', message: '' });
            } else throw new Error(result.error);
        } catch (error) {
            console.error('이메일 전송 실패:', error);
            alert("전송 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
        } finally { setIsSending(false); }
    }, [contactData]);

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
            alert("이 워크숍은 아직 신청할 수 없습니다. (DB UUID 누락)");
            return;
        }

        if (isWorkshopClosedForPayment(workshop)) {
            alert("이미 마감된 워크샵입니다.");
            return;
        }

        if (hasSelectableSchedule(workshop) && !selectedSession) {
            alert("일정을 먼저 선택해 주세요.");
            setShowSchedule(true);
            return;
        }

        // 1. Initialize Toss Payments before pending registration
        let payments = tossPayments;
        if (!payments) {
            const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || "test_ck_ALnQvDd2VJl6vpNz1RRO8Mj7X41m";
            payments = await loadTossPayments(clientKey);
            setTossPayments(payments);
        }

        if (!payments) {
            alert("결제 시스템을 준비 중입니다. 잠시 후 다시 시도해 주세요.");
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
                orderName: workshop_title || workshop.title || `워크숍 ${workshop.number || workshop.id}`,
                successUrl: `${window.location.origin}/payment/success?registration_id=${registration_id}${selectedSession ? `&schedule=${encodeURIComponent(`${selectedSession.date || ''} ${selectedSession.time || ''}`.trim())}` : ''}`,
                failUrl: `${window.location.origin}/payment/fail?registration_id=${registration_id}`,
            });
        } catch (error: any) {
            console.error("신청/결제 요청 에러:", error);
            alert(`요청 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`);
        }
    }, [
        getWorkshopCapacity,
        getWorkshopPaidCount,
        goToCompleteProfile,
        hasSelectableSchedule,
        isProfileComplete,
        isWorkshopClosedForPayment,
        selectedSession,
        supabase,
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

                {isSidebarExpanded && !isContactOpen && (
                    <button className="sidebar-close-btn" onClick={(e) => { e.stopPropagation(); setIsSidebarExpanded(false); }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                )}

                {!isContactOpen ? (
                    <nav className="sidebar-nav" onClick={(e) => e.stopPropagation()}>
                        <div className="sidebar-nav-top">
                            <button className={`${activePreset === 'main' ? 'active' : ''}`} onClick={() => { handlePresetChange('main'); setIsSidebarExpanded(false); }}>MAIN</button>
                            <button className={`${activePreset === 'member' ? 'active' : ''}`} onClick={() => { handlePresetChange('member'); setIsSidebarExpanded(false); }}>MEMBER</button>
                            <button className={`${activePreset === 'workshop' ? 'active' : ''}`} onClick={() => { handlePresetChange('workshop'); setIsSidebarExpanded(false); }}>WORKSHOP</button>
                            <button className={`${activePreset === 'diary' ? 'active' : ''}`} onClick={() => { handlePresetChange('diary'); setIsSidebarExpanded(false); }}>CALENDAR</button>
                            <button className={`${isContactOpen ? 'active' : ''}`} onClick={() => { handlePresetChange('contact'); }}>CONTACT</button>
                        </div>

                        <div className="sidebar-nav-bottom">
                            {!user ? (
                                <>
                                    <button className="user-login-btn" onClick={() => { setIsLoginModalOpen(true); setIsSidebarExpanded(false); }}>
                                        LOGIN
                                    </button>
                                    <button className="user-signup-btn" onClick={() => { setIsLoginModalOpen(true); setIsSidebarExpanded(false); }}>
                                        JOIN
                                    </button>
                                </>
                            ) : !isProfileComplete ? (
                                <>
                                    <button className="user-signup-btn" onClick={() => { goToCompleteProfile(); setIsSidebarExpanded(false); }}>
                                        COMPLETE JOIN
                                    </button>
                                    <button className="user-login-btn" onClick={async () => { await signOut(); setIsSidebarExpanded(false); }}>
                                        LOGOUT
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button className="user-signup-btn" onClick={() => { setIsLoginModalOpen(true); setIsSidebarExpanded(false); }}>
                                        MY INFO
                                    </button>
                                    <button className="user-login-btn" onClick={async () => { await signOut(); setIsSidebarExpanded(false); }}>
                                        LOGOUT
                                    </button>
                                </>
                            )}
                        </div>
                    </nav>
                ) : (
                    <div className="contact-sidebar-content" onClick={(e) => e.stopPropagation()}>
                        <form className="contact-form-classic" onSubmit={handleContactSubmit}>
                            <div className="contact-sidebar-header">
                                <h2 className="modal-title">이요하우스와 </h2>
                                <button type="button" className="contact-back-btn" onClick={() => setIsContactOpen(false)}>← BACK</button>
                            </div>

                            <div className="contact-main-scroll">
                                <div className="form-classic-row">
                                    <input type="email" placeholder="이메일" className="form-input-classic" value={contactData.email} onChange={(e) => setContactData({ ...contactData, email: e.target.value })} required />
                                </div>
                                <div className="form-classic-row">
                                    <input type="text" placeholder="제목" className="form-input-classic" value={contactData.subject} onChange={(e) => setContactData({ ...contactData, subject: e.target.value })} />
                                </div>
                                <div className="form-classic-row flex-textarea">
                                    <textarea placeholder="내용을 입력해주세요" className="form-textarea-classic" value={contactData.message} onChange={(e) => setContactData({ ...contactData, message: e.target.value })} required></textarea>
                                </div>
                            </div>

                            <div className="form-submit-row">
                                <button type="submit" className="form-submit-btn-classic" disabled={isSending}>
                                    {isSending ? '전송 중...' : '전송!'}
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
                        MEMBER
                    </button>

                    <div className="header-lang">
                        <span className="active">KOR</span> / <span>ENG</span>
                    </div>

                    <div className="header-email">
                        goyangiyoram@gmail.com
                    </div>
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
                                                            <div className="detail-main-title">{selectedWorkshop.title}</div>
                                                        </div>
                                                    </div>
                                                    <div className="detail-description">
                                                        {selectedWorkshop.description?.map((block: any, i: number) => (<p key={i}>{block.children?.map((c: any) => c.text).join('')}</p>))}
                                                    </div>

                                                    {/* 튜터 정보 */}
                                                    {(selectedWorkshop.tutor || selectedWorkshop.tutorBio) && (
                                                        <div className="detail-tutor-section">
                                                            {selectedWorkshop.tutor && (
                                                                <div className="detail-tutor-name">튜터 : {selectedWorkshop.tutor}</div>
                                                            )}
                                                            {selectedWorkshop.tutorBio && (
                                                                <div className="detail-tutor-bio">{selectedWorkshop.tutorBio}</div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* 커리큘럼 */}
                                                    {selectedWorkshop.curriculum && selectedWorkshop.curriculum.length > 0 && (
                                                        <div className="detail-curriculum-section">
                                                            <div className="detail-section-label">커리큘럼</div>
                                                            {selectedWorkshop.curriculum.map((week: any, i: number) => (
                                                                <div key={week._key || i} className="curriculum-row">
                                                                    <span className="curriculum-week">{week.weekLabel}</span>
                                                                    <span className="curriculum-content">{week.content}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* 정원 */}
                                                    {typeof selectedWorkshop.capacity === 'number' && (
                                                        <div className="detail-capacity">
                                                            정원 {selectedWorkshop.capacity}명
                                                        </div>
                                                    )}
                                                    <div className="detail-footer-actions">
                                                        <div className="price-tag">{selectedWorkshop.price?.toLocaleString()}원</div>
                                                        {hasSelectableSchedule(selectedWorkshop) && (
                                                            <div className="schedule-selector-wrapper">
                                                                <button
                                                                    type="button"
                                                                    className={`action-btn outline-btn ${selectedSession ? 'selected' : ''}`}
                                                                    onClick={() => setShowSchedule(!showSchedule)}
                                                                >
                                                                    {selectedSession ? `${selectedSession.date || ''} ${selectedSession.time || ''}`.trim() : '일정 선택'}
                                                                </button>
                                                                {showSchedule && (
                                                                    <div className="schedule-dropdown">
                                                                        {getWorkshopSchedule(selectedWorkshop).map((session: any, index: number) => (
                                                                            <button
                                                                                type="button"
                                                                                key={`${session.date || 'date'}-${session.time || 'time'}-${index}`}
                                                                                className="schedule-option"
                                                                                onClick={() => {
                                                                                    setSelectedSession(session);
                                                                                    setShowSchedule(false);
                                                                                }}
                                                                            >
                                                                                {session.date && <span className="s-date">{session.date}</span>}
                                                                                {session.time && <span className="s-time">{session.time}</span>}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                        <button
                                                            className={`action-btn fill-btn ${hasSelectableSchedule(selectedWorkshop) && !selectedSession ? 'locked' : ''}`}
                                                            disabled={isWorkshopClosedForPayment(selectedWorkshop)}
                                                            onClick={() => handleWorkshopPayment(selectedWorkshop)}
                                                        >
                                                            {isWorkshopClosedForPayment(selectedWorkshop) ? '마감' : '워크숍 신청'}
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
                                    가느다란 실이 손가락 사이를 자유롭게 오가듯, ‘이요’는 우연한 교차에 주목합니다.
                                    팽팽히 당기고 느슨히 푸는 실뜨기처럼, 생각은 서로의 손길을 타며 끊임없이 변형됩니다.
                                    요람 속의 실들은 무엇이 될지 모른 채 잠시 엉키고 때로는 끊어지기도 합니다.
                                    하지만 우리는 어긋남조차 새로운 연결이 된다는 사실을 기꺼이 받아들입니다.
                                    창작자를 위한 공공공원은 이요하우스로 이어집니다.
                                </div>
                                <div className="info-bottom-text-wrapper">
                                    <div className="info-bottom-text">info</div>
                                    <div className="business-info-overlay">
                                        <strong>주식회사 이요하우스</strong><br />
                                        ADDRESS : 서울시 마포구 희우정로 5길 29, 3층<br />
                                        BUSINESS LICENSE : 718-88-02112<br />
                                        MALL-ORDER LICENSE : 2024-서울송파-2708<br />
                                        EMAIL : goyangiyoram@gmail.com<br />
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
                                <span className="item-label">MAIN</span>
                            </button>
                            <button className="mobile-menu-item" onClick={() => { handlePresetChange('member'); setIsMenuOpen(false); }}>
                                <span className="item-label">MEMBER</span>
                            </button>
                            <button className="mobile-menu-item" onClick={() => { handlePresetChange('workshop'); setIsMenuOpen(false); }}>
                                <span className="item-label">WORKSHOP</span>
                            </button>
                            <button className="mobile-menu-item" onClick={() => { handlePresetChange('diary'); setIsMenuOpen(false); }}>
                                <span className="item-label">CALENDAR</span>
                            </button>
                            <button className="mobile-menu-item" onClick={() => { handlePresetChange('contact'); setIsMenuOpen(false); }}>
                                <span className="item-label">CONTACT</span>
                            </button>
                        </div>
                        <div className="mobile-menu-footer">
                            <div className="footer-line">  <strong>주식회사 이요하우스</strong><br />
                                ADDRESS : 서울시 마포구 희우정로 5길 29, 3층<br />
                                BUSINESS LICENSE : 718-88-02112<br />
                                MALL-ORDER LICENSE : 2024-서울송파-2708<br />
                                EMAIL : goyangiyoram@gmail.com<br />
                                웹사이트 디자인 : 어 준 <a href="https://www.instagram.com/djwns1234/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 'bold' }}>@djwns1234</a>
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
                                                    인증이 완료되었습니다. 서비스를 이용하려면 회원가입을 완료해 주세요.
                                                </p>
                                                <button
                                                    type="button"
                                                    className="email-submit-btn"
                                                    style={{ width: '100%' }}
                                                    onClick={() => { setIsLoginModalOpen(false); goToCompleteProfile(); }}
                                                >
                                                    회원가입 완료하기
                                                </button>
                                                <button
                                                    type="button"
                                                    className="social-btn"
                                                    style={{ marginTop: '10px', width: '100%', justifyContent: 'center', background: 'transparent', border: '1px solid #ddd', color: '#666' }}
                                                    onClick={() => signOut()}
                                                >
                                                    로그아웃
                                                </button>
                                            </div>
                                        ) : (
                                            /* 프로필 완성: 일반 로그인 상태 */
                                            <div className="profile-welcome-container" style={{ marginTop: '24px' }}>
                                                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{profile?.full_name}님, 안녕하세요!</div>
                                                <div style={{ marginTop: '8px', fontSize: '14px', opacity: 0.6 }}>{user.email}</div>

                                                <div className="profile-info-display" style={{ marginTop: '20px', textAlign: 'left', background: '#f9f9f9', padding: '15px', borderRadius: '8px' }}>
                                                    <div style={{ fontSize: '12px', opacity: 0.5 }}>자기소개</div>
                                                    <div style={{ marginTop: '5px', fontSize: '14px', lineHeight: '1.5' }}>{profile?.bio || '입력된 자기소개가 없습니다.'}</div>
                                                </div>

                                                <button
                                                    className="email-submit-btn"
                                                    style={{ marginTop: '30px' }}
                                                    onClick={async () => { await signOut(); setIsLoginModalOpen(false); }}
                                                >
                                                    로그아웃
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
                                                <span className="btn-text">카카오로 시작하기</span>
                                            </button>
                                            <button className="social-btn google" onClick={signInWithGoogle}>
                                                <span className="btn-icon">G</span>
                                                <span className="btn-text">구글로 시작하기</span>
                                            </button>
                                        </div>

                                        <div className="login-divider">
                                            <span>OR</span>
                                        </div>

                                        <div className="email-login-form">
                                            <input type="email" placeholder="이메일 주소" className="login-input" />
                                            <button className="email-submit-btn">이메일로 계속하기</button>
                                        </div>

                                        <div className="login-notice">
                                            로그인 시 <a href="#">이용약관</a> 및 <a href="#">개인정보처리방침</a>에 동의하게 됩니다.
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}

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
