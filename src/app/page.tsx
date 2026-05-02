"use client";

import { useEffect, useState, useRef, CSSProperties, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Image from "next/image";
import { urlFor } from "@/sanity/image";
import { useWorkshopData } from "@/hooks/useWorkshopData";
import { useAuth } from "@/hooks/useAuth";
import WorkshopGrid from "@/components/WorkshopGrid";
import CalendarView from "@/components/CalendarView";
import MemberView from "@/components/MemberView";
import IyocaView from "@/components/IyocaView";
import { getLegacyPosterMeta } from "@/lib/legacyPosters";
import { loadTossPayments } from "@tosspayments/payment-sdk";

const presets = {
    main: {
        line1: "calc(100% - 21px)",
        line2: "calc(100% - 14px)",
        line3: "calc(100% - 7px)",
        top2: "calc(var(--top-row-1) + 7px)"
    },
    member: {
        line1: "0px",
        line2: "7px",
        line3: "14px",
        top2: "calc(100% - 7px)"
    },
    contact: {
        line1: "0px",
        line2: "calc(100% - 14px)",
        line3: "calc(100% - 7px)",
        top2: "calc(100% - 7px)"
    },
    workshop: {
        line1: "0px",
        line2: "7px",
        line3: "calc(100% - 7px)",
        top2: "calc(100% - 7px)"
    },
    club: {
        line1: "calc(100% - 21px)",
        line2: "calc(100% - 14px)",
        line3: "calc(100% - 7px)",
        top2: "calc(100% - 7px)"
    },
    diary: {
        line1: "0px",
        line2: "7px",
        line3: "14px",
        top2: "calc(100% - 7px)"
    }
};

const getTagColor = (tag: string) => {
    const t = tag.toUpperCase().trim();
    if (t === 'AI') return 'black';
    if (t === 'WORKSHOP') return 'yellow';
    if (t === 'GRAPHIC') return 'green';
    if (t === 'VFX') return 'blue';

    const otherColors = ['orange', 'purple', 'pink', 'red'];
    let hash = 0;
    for (let i = 0; i < t.length; i++) {
        hash = t.charCodeAt(i) + ((hash << 5) - hash);
    }
    return otherColors[Math.abs(hash) % otherColors.length];
};

const randomColor = () => {
    const h = Math.floor(Math.random() * 360);
    return `hsl(${h}, 90%, 50%)`;
};

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

    const { user, profile, isLoading: authLoading, isProfileComplete, signOut, supabase } = useAuth();

    const [activePreset, setActivePreset] = useState<string>("main");
    const [selectedWorkshop, setSelectedWorkshop] = useState<any | null>(null);
    const [dynamicColor, setDynamicColor] = useState("#2563eb");
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [isContactOpen, setIsContactOpen] = useState(false);
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isBooting, setIsBooting] = useState(true);
    const [isMounted, setIsMounted] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRafRef = useRef<number | null>(null);


    useEffect(() => {
        setIsMounted(true);
        const raf = requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setIsBooting(false);
            });
        });
        return () => cancelAnimationFrame(raf);
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

    const createQueryString = (name: string, value: string | null) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set(name, value);
        else params.delete(name);
        return params.toString();
    };

    const handleSelectWorkshop = (workshop: any) => {
        const id = workshop._id || workshop.id;
        router.push(`${pathname}?${createQueryString('workshop', id.toString())}`, { scroll: false });
    };

    const handlePresetChange = (preset: string) => {
        if (preset === 'contact') {
            setIsContactOpen(!isContactOpen);
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
        const newColor = randomColor();
        setDynamicColor(newColor);
        if (containerRef.current) {
            containerRef.current.style.setProperty('--intersect', newColor);
            containerRef.current.style.setProperty('--scroll-hue', '220');
        }
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (scrollRafRef.current) return;

        const target = e.currentTarget;
        scrollRafRef.current = requestAnimationFrame(() => {
            const h = Math.floor(target.scrollTop / 5) % 360;
            const color = `hsl(${h}, 90%, 50%)`;
            if (containerRef.current) {
                containerRef.current.style.setProperty('--intersect', color);
                containerRef.current.style.setProperty('--scroll-hue', h.toString());
            }
            scrollRafRef.current = null;
        });
    };

    const handleGoogleLogin = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        });
        if (error) {
            console.error("Google Login Error:", error.message);
            alert("로그인 중 오류가 발생했습니다.");
        }
    };

    const handleKakaoLogin = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'kakao',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        });
        if (error) {
            console.error("Kakao Login Error:", error.message);
            alert("로그인 중 오류가 발생했습니다.");
        }
    };



    const handleContactSubmit = async (e: React.FormEvent) => {
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
    };

    const getWorkshopCapacity = (workshop: any) =>
        typeof workshop?.capacity === 'number' ? workshop.capacity : 8;

    const getWorkshopPaidCount = (workshop: any) => {
        const dbId = workshop?.supabase_workshop_id;
        return dbId ? registrationCounts[dbId] || 0 : 0;
    };

    const getWorkshopSchedule = (workshop: any) =>
        Array.isArray(workshop?.schedule)
            ? workshop.schedule.filter((session: any) => session?.date || session?.time)
            : [];

    const hasSelectableSchedule = (workshop: any) => getWorkshopSchedule(workshop).length > 0;

    const isWorkshopClosedForPayment = (workshop: any) => {
        const isLegacyClosed = !workshop?.isSanity && Number(workshop?.id) <= 11;
        return Boolean(
            workshop?.isClosed ||
            isLegacyClosed ||
            getWorkshopPaidCount(workshop) >= getWorkshopCapacity(workshop)
        );
    };

    const handleWorkshopPayment = async (workshop: any) => {
        if (!user) {
            setIsLoginModalOpen(true);
            return;
        }

        if (!isProfileComplete) {
            alert("워크숍 신청을 위해 프로필(이름, 전화번호)을 먼저 완성해 주세요.");
            setIsLoginModalOpen(true);
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
    };

    const intersectColor = dynamicColor;
    const currentPreset = presets[activePreset as keyof typeof presets] || presets.main;

    let line1 = currentPreset.line1;
    let line2 = currentPreset.line2;
    let line3 = currentPreset.line3;

    if (isContactOpen) {
        const isRightPage = ['workshop', 'diary', 'main', 'member', 'club'].includes(activePreset);
        if (isRightPage) {
            line1 = "var(--contact-line-pos, 40%)";
            line2 = "calc(var(--contact-line-pos, 40%) + 7px)";
            line3 = "calc(var(--contact-line-pos, 40%) + 14px)";
        } else {
            line1 = "calc(var(--contact-line-pos-rev, 60%) - 14px)";
            line2 = "calc(var(--contact-line-pos-rev, 60%) - 7px)";
            line3 = "var(--contact-line-pos-rev, 60%)";
        }
    }

    const containerStyle = {
        "--line-x-1": line1,
        "--line-x-2": line2,
        "--line-x-3": line3,
        "--top-row-2": currentPreset.top2,
        "--intersect": intersectColor,
    } as CSSProperties;

    return (
        <div ref={containerRef} style={containerStyle} className={`app-container ${isContactOpen ? 'contact-open' : ''} ${isBooting ? 'is-booting' : ''}`}>
            <style>{`:root { --line-x-1: ${currentPreset.line1}; --line-x-2: ${currentPreset.line2}; --line-x-3: ${currentPreset.line3}; --top-row-2: ${currentPreset.top2}; --intersect: ${intersectColor}; --accent-fixed: ${dynamicColor}; --scroll-hue: 220; }`}</style>

            <header className="header">
                <div className="logo" onClick={() => handlePresetChange('main')} style={{ cursor: 'pointer' }}>
                    <div className="logo-text">
                        <span className={`logo-title ${activePreset === 'main' ? 'active' : ''}`}>IYOHOUSE</span>
                    </div>
                </div>
                <div className="btn-sep"></div>
                <nav className="controls">
                    <button className={`nav-desktop-only ${activePreset === 'member' ? 'active' : ''}`} onClick={() => handlePresetChange('member')}>MEMBER</button>
                    <div className="cat-bar nav-desktop-only"></div>
                    <button className={`nav-desktop-only ${activePreset === 'workshop' ? 'active' : ''}`} onClick={() => handlePresetChange('workshop')}>WORKSHOP</button>
                    <button className={`nav-desktop-only ${activePreset === 'club' ? 'active' : ''}`} onClick={() => handlePresetChange('club')}>IYOCA</button>

                    <button className={`nav-desktop-only ${activePreset === 'diary' ? 'active' : ''}`} onClick={() => handlePresetChange('diary')}>CALENDAR</button>
                    <button className={`nav-desktop-only ${isContactOpen ? 'active' : ''}`} onClick={() => handlePresetChange('contact')}>CONTACT</button>

                    <button className="user-login-btn" onClick={() => setIsLoginModalOpen(true)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                    </button>

                    <button className="mobile-menu-btn" onClick={() => setIsMenuOpen(true)}>
                        <span className="hamburger-box">
                            <span className="hamburger-inner"></span>
                        </span>
                    </button>
                </nav>
            </header>

            <main className="stage">
                <div className="grid-frame">
                    <div className={`cell cell-member ${activePreset === 'member' ? 'active' : ''}`}>
                        <div className="cell-cover"></div>
                        <div className="cell-content scroll-container" onScroll={handleScroll}>
                            {visited.member && <MemberView />}
                        </div>
                    </div>

                    <div className={`cell cell-club ${activePreset === 'club' ? 'active' : ''}`}>
                        <div className="cell-cover"></div>
                        <div className="cell-content">
                            {visited.club && <IyocaView active={activePreset === 'club'} />}
                        </div>
                    </div>

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
                                                            {selectedWorkshop.tags?.map((tag: string, i: number) => (<span key={i} className={`pills pill-${getTagColor(tag)}`}>{tag}</span>))}
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
                        <div className="cell-content" style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div className="main-logo-centered" style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                width: '50%',
                                maxWidth: '600px',
                                opacity: 0.8,
                                zIndex: 0,
                                display: 'flex',
                                justifyContent: 'center'
                            }}>
                                <Image
                                    src="/logo.png"
                                    alt="IYOHOUSE Logo"
                                    width={214}
                                    height={152}
                                    priority
                                    sizes="(max-width: 900px) 50vw, 600px"
                                    style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
                                />
                            </div>

                            <div className="left-sidebar">
                                <div className="side-item-container">
                                    <div className="side-label">About us</div>
                                    <div className="side-content">
                                        <div>
                                            가느다란 실이 손가락 사이를 자유롭게 오가듯, &apos;이요&apos;는 우연한 교차에 주목합니다.<br /><br />
                                            팽팽히 당기고 느슨히 푸는 실뜨기처럼, 생각은 서로의 손길을 타며 끊임없이 변형됩니다. 요람 속의 실들은 무엇이 될지 모른 채 잠시 엉키고 때로는 끊어지기도 합니다.<br /><br />
                                            하지만 우리는 어긋남조차 새로운 연결이 된다는 사실을 기꺼이 받아들입니다. 창작자를 위한 공공공원은 이요하우스로 이어집니다.
                                        </div>
                                    </div>
                                </div>
                                <div className="side-item-container">
                                    <div className="side-label">IYOBOT</div>
                                    <div className="side-content">
                                        <div>
                                            <strong>지능형 연결 조력자</strong><br /><br />
                                            IYOBOT은 당신의 창의적 영감을 아카이빙하고, 다른 창작자들의 생각과 연결해주는 스마트 가이드입니다. 복잡한 생각의 실타래를 함께 풀어나가는 파트너를 만나보세요.
                                        </div>
                                    </div>
                                </div>
                                <div className="side-item-container">
                                    <div className="side-label">INFO</div>
                                    <div className="side-content">
                                        <div>
                                            <strong>주식회사 이요하우스</strong><br />
                                            ADDRESS : 서울시 마포구 희우정로 5길 29, 3층<br />
                                            BUSINESS LICENSE : 718-88-02112<br />
                                            MALL-ORDER LICENSE : 2024-서울송파-2708<br />
                                            EMAIL : goyangiyoram@gmail.com<br />
                                            웹사이트 디자인 : 어준<a href="https://www.instagram.com/djwns1234/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 'bold' }}>@djwns1234</a>

                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="h-line grid-row-1"></div><div className="h-line grid-row-2"></div>
                    <div className="v-line top-v-1"></div><div className="v-line top-v-2"></div><div className="v-line top-v-3"></div>
                </div>
            </main>

            <div className={`contact-overlay-wrapper ${isContactOpen ? 'active' : ''} ${['workshop', 'diary', 'main', 'member', 'club'].includes(activePreset) ? 'from-left' : 'from-right'}`}>
                <div className="contact-dimmer" onClick={() => setIsContactOpen(false)}></div>
                <div className="contact-slide-panel">
                    <div className="modal-inner">
                        <div className="modal-header">
                            <h2 className="modal-title">CONTACT US</h2>
                            <button className="modal-close" onClick={() => setIsContactOpen(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="contact-main-scroll">
                                <div className="contact-form-wrapper">
                                    <div className="contact-header-info" style={{ marginBottom: '30px' }}>
                                        <div className="header-info-item"><span className="info-label">INSTAGRAM</span><a href="https://www.instagram.com/iyohouse/" target="_blank" rel="noopener noreferrer" className="info-val">@iyohouse</a></div>
                                        <div className="header-info-item"><span className="info-label">EMAIL</span><a href="mailto:goyangiyoram@gmail.com" className="info-val">goyangiyoram@gmail.com</a></div>
                                    </div>
                                    <form className="contact-form-classic" onSubmit={handleContactSubmit}>
                                        <div className="form-classic-row"><input type="email" placeholder="이메일" className="form-input-classic" value={contactData.email} onChange={(e) => setContactData({ ...contactData, email: e.target.value })} required /></div>
                                        <div className="form-classic-row"><input type="text" placeholder="제목" className="form-input-classic" value={contactData.subject} onChange={(e) => setContactData({ ...contactData, subject: e.target.value })} /></div>
                                        <div className="form-classic-row"><textarea placeholder="내용" className="form-textarea-classic" value={contactData.message} onChange={(e) => setContactData({ ...contactData, message: e.target.value })} required></textarea></div>
                                        <div className="form-classic-row"><button type="submit" className="form-submit-btn-classic" disabled={isSending}>{isSending ? '전송 중...' : '전송'}</button></div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
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
                            <button className="mobile-menu-item" onClick={() => { handlePresetChange('club'); setIsMenuOpen(false); }}>
                                <span className="item-label">IYOCA</span>
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
                                        <div style={{ marginTop: '16px', fontSize: '14px', opacity: 0.8 }}>
                                            {profile?.full_name || user.email}
                                        </div>
                                        {!isProfileComplete && (
                                            <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(255,200,0,0.15)', borderRadius: '6px', fontSize: '13px' }}>
                                                프로필을 완성해 주세요 (이름, 전화번호)
                                            </div>
                                        )}
                                        <button
                                            className="email-submit-btn"
                                            style={{ marginTop: '20px' }}
                                            onClick={async () => { await signOut(); setIsLoginModalOpen(false); }}
                                        >
                                            로그아웃
                                        </button>
                                    </div>
                                ) : (
                                    /* 비로그인 상태 */
                                    <>
                                        <div className="login-intro">
                                            <h3>IYOHOUSE</h3>
                                        </div>

                                        <div className="social-login-group">
                                            <button className="social-btn kakao" onClick={handleKakaoLogin}>
                                                <span className="btn-icon">K</span>
                                                <span className="btn-text">카카오로 시작하기</span>
                                            </button>
                                            <button className="social-btn google" onClick={handleGoogleLogin}>
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
