"use client";

import { useEffect, useRef, useState, CSSProperties, useMemo, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { urlFor } from "@/sanity/image";
import { useWorkshopData } from "@/hooks/useWorkshopData";
import { useGuestbookData } from "@/hooks/useGuestbookData";
import GuestbookCanvas from "@/components/GuestbookCanvas";
import WorkshopGrid from "@/components/WorkshopGrid";
import CalendarView from "@/components/CalendarView";
import MemberView from "@/components/MemberView";
import IyocaView from "@/components/IyocaView";
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

function HomeContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();

    const {
        sanityWorkshops,
        registrations,
        calendarEvents,
        allWorkshops,
    } = useWorkshopData();

    const {
        guestMessages,
        refresh: refreshGuestbook
    } = useGuestbookData();

    const [activePreset, setActivePreset] = useState<string>("main");
    const [showInfo, setShowInfo] = useState(false);
    const [selectedWorkshop, setSelectedWorkshop] = useState<any | null>(null);
    const [dynamicColor, setDynamicColor] = useState("#2563eb");
    const [scrollColor, setScrollColor] = useState<string | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [isContactOpen, setIsContactOpen] = useState(false);
    const [isBooting, setIsBooting] = useState(true);

    useEffect(() => {
        const raf = requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setIsBooting(false);
            });
        });
        return () => cancelAnimationFrame(raf);
    }, []);

    const [visited, setVisited] = useState<Record<string, boolean>>({ main: true });

    const [inputText, setInputText] = useState("");
    const [inputTitle, setInputTitle] = useState("");
    const [contactData, setContactData] = useState({ email: '', subject: '', message: '' });
    const [isSending, setIsSending] = useState(false);
    const [tossPayments, setTossPayments] = useState<any>(null);
    const [showSchedule, setShowSchedule] = useState(false);
    const [selectedSession, setSelectedSession] = useState<any | null>(null);
    const [showIndexModal, setShowIndexModal] = useState(false);

    const mainTextRef = useRef<HTMLDivElement>(null);
    const inputContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const clientKey = "test_ck_ALnQvDd2VJl6vpNz1RRO8Mj7X41m";
        loadTossPayments(clientKey).then(setTossPayments);
    }, []);

    useEffect(() => {
        const workshopId = searchParams.get('workshop');
        const presetId = searchParams.get('preset');

        if (workshopId) {
            let found = sanityWorkshops.find(w => (w._id || w.id)?.toString() === workshopId);
            if (!found) {
                const idNum = parseInt(workshopId);
                if (!isNaN(idNum) && idNum > 0 && idNum <= 24) {
                    found = { id: idNum, title: `AI.zip ${idNum} 그래픽`, price: 150000 };
                }
            }
            if (found) {
                setSelectedWorkshop(found);
                setActivePreset('workshop');
                setVisited(v => ({ ...v, workshop: true }));
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
        setDynamicColor(randomColor());
        setScrollColor(null);
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        const h = Math.floor(target.scrollTop / 5) % 360;
        setScrollColor(`hsl(${h}, 90%, 50%)`);
    };

    const handleSendMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!inputText.trim()) return;

        const text = inputText.trim();
        const title = inputTitle.trim() || "무제";

        setInputText("");
        setInputTitle("");

        try {
            const { error } = await supabase
                .from('guestbook')
                .insert([{ text, title }]);

            if (error) {
                console.error('방명록 저장 실패:', error.message);
                alert("전송 실패: DB에 'title' 컬럼이 있는지 확인해주세요.");
            } else {
                refreshGuestbook();
            }
        } catch (err) {
            console.error("Error inserting message:", err);
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

    const handleWorkshopPayment = async (workshop: any) => {
        const currentRegs = registrations.filter(r => r.workshop_id === (workshop._id || workshop.id)).length;
        if (currentRegs >= (workshop.capacity || 8)) {
            alert("이미 마감된 워크샵입니다.");
            return;
        }
        if (!tossPayments) {
            alert("결제 시스템을 준비 중입니다. 잠시 후 다시 시도해 주세요.");
            return;
        }
        try {
            const amount = workshop.price || 150000;
            const safeWorkshopId = (workshop._id || workshop.id).toString().replace(/[^a-zA-Z0-9-_]/g, '');
            const orderId = `order_${safeWorkshopId}_${Date.now()}`;
            const orderName = workshop.title || `워크숍 ${workshop.id}`;
            await tossPayments.requestPayment('카드', {
                amount,
                orderId,
                orderName,
                successUrl: `${window.location.origin}/payment/success`,
                failUrl: `${window.location.origin}/payment/fail`,
            });
        } catch (error: any) {
            console.error("결제 요청 에러:", error);
            alert(`결제 요청 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`);
        }
    };

    const intersectColor = scrollColor || dynamicColor;
    const currentPreset = presets[activePreset as keyof typeof presets] || presets.main;

    let line1 = currentPreset.line1;
    let line2 = currentPreset.line2;
    let line3 = currentPreset.line3;

    if (isContactOpen) {
        const isRightPage = ['workshop', 'diary', 'main', 'member', 'club'].includes(activePreset);
        if (isRightPage) {
            line1 = "40%";
            line2 = "calc(40% + 7px)";
            line3 = "calc(40% + 14px)";
        } else {
            line1 = "calc(60% - 14px)";
            line2 = "calc(60% - 7px)";
            line3 = "60%";
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
        <div style={containerStyle} className={`app-container ${isContactOpen ? 'contact-open' : ''} ${isBooting ? 'is-booting' : ''}`}>
            <style>{`:root { --line-x-1: ${currentPreset.line1}; --line-x-2: ${currentPreset.line2}; --line-x-3: ${currentPreset.line3}; --top-row-2: ${currentPreset.top2}; --intersect: ${intersectColor}; --accent-fixed: ${dynamicColor}; --scroll-hue: ${scrollColor ? (parseInt(scrollColor.match(/\d+/)![0])) : 220}; }`}</style>

            <header className="header">
                <div className="logo" onClick={() => handlePresetChange('main')} style={{ cursor: 'pointer' }}>
                    <div className="logo-text">
                        <span className={`logo-title ${activePreset === 'main' ? 'active' : ''}`}>IYOHOUSE</span>
                    </div>
                </div>
                <div className="btn-sep"></div>
                <nav className="controls">
                    <button className={activePreset === 'member' ? 'active' : ''} onClick={() => handlePresetChange('member')}>MEMBER</button>
                    <div className="cat-bar"></div>
                    <button className={activePreset === 'workshop' ? 'active' : ''} onClick={() => handlePresetChange('workshop')}>WORKSHOP</button>
                    <button className={activePreset === 'club' ? 'active' : ''} onClick={() => handlePresetChange('club')}>IYOCA</button>
                    <button className={activePreset === 'diary' ? 'active' : ''} onClick={() => handlePresetChange('diary')}>CALENDAR</button>
                    <button className={isContactOpen ? 'active' : ''} onClick={() => handlePresetChange('contact')}>CONTACT</button>
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
                                                        let aspectRatio = "1080 / 1350";
                                                        if (isSanity && selectedWorkshop.posterMeta) {
                                                            aspectRatio = `${selectedWorkshop.posterMeta.width} / ${selectedWorkshop.posterMeta.height}`;
                                                        }

                                                        const imgUrl = isSanity
                                                            ? (selectedWorkshop.poster ? urlFor(selectedWorkshop.poster).width(1200).auto('format').url() : null)
                                                            : (selectedWorkshop.id === 24 ? `/assets/24.jpg` : `/assets/${selectedWorkshop.id.toString().padStart(2, '0')}.png`);

                                                        return imgUrl ? (
                                                            <div className="detail-poster-aspect-box" style={{ "--aspect-ratio": aspectRatio } as CSSProperties}>
                                                                <img 
                                                                    src={imgUrl} 
                                                                    className="detail-main-poster" 
                                                                    alt="Poster" 
                                                                    loading="lazy" 
                                                                    decoding="async" 
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
                                                    <div className="detail-footer-actions">
                                                        <div className="price-tag">{selectedWorkshop.price?.toLocaleString()}원</div>
                                                        <button className="action-btn outline-btn" onClick={() => setShowSchedule(!showSchedule)}>
                                                            {selectedSession ? `${selectedSession.date} ${selectedSession.time}` : '일정 선택'}
                                                        </button>
                                                        <button className="action-btn fill-btn" onClick={() => handleWorkshopPayment(selectedWorkshop)}>워크숍 신청</button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <WorkshopGrid workshops={allWorkshops} registrations={registrations} onSelectWorkshop={handleSelectWorkshop} getTagColor={getTagColor} />
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
                        <div className="cell-content" style={{ width: '100%', height: '100%', position: 'relative' }}>
                            <div className="main-left-text" ref={mainTextRef} style={{ textAlign: 'left', padding: '100px 40px' }}>
                                <p>가느다란 실이 손가락 사이를 자유롭게 오가듯, '이요'는 우연한 교차에 주목합니다.</p>
                                <p>팽팽히 당기고 느슨히 푸는 실뜨기처럼, 생각은 서로의 손길을 타며 끊임없이 변형됩니다. 요람 속의 실들은 무엇이 될지 모른 채 잠시 엉키고 때로는 끊어지기도 합니다.</p>
                                <p>하지만 우리는 어긋남조차 새로운 연결이 된다는 사실을 기꺼이 받아들입니다. 창작자를 위한 공공공원은 이요하우스로 이어집니다.</p>
                            </div>
                            <GuestbookCanvas
                                messages={guestMessages}
                                mainTextRef={mainTextRef}
                                inputContainerRef={inputContainerRef}
                                onOpenIndex={() => setShowIndexModal(true)}
                                active={activePreset === 'main'}
                            />
                            <div className="guestbook-input-container" ref={inputContainerRef}>
                                <form onSubmit={handleSendMessage} className="guestbook-form">
                                    <input type="text" value={inputTitle} onChange={(e) => setInputTitle(e.target.value)} placeholder="제목" className="guestbook-title-input" />
                                    <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="방명록을 남겨주세요 ! " className="guestbook-input" />
                                    <button type="submit" className="guestbook-send-btn">전송</button>
                                </form>
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

            {showIndexModal && (
                <div className="modal-overlay" onClick={() => setShowIndexModal(false)}>
                    <div className="grid-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-inner">
                            <div className="modal-header">
                                <div className="modal-title">이요하우스 방명록의 기록은 아래에 있습니다. </div>
                                <button className="modal-close" onClick={() => setShowIndexModal(false)}>×</button>
                            </div>
                            <div className="modal-body">
                                <div className="index-list">
                                    {guestMessages.map((msg) => (
                                        <div key={msg.id} className="index-row">
                                            <div className="idx-date">
                                                {new Date(msg.created_at).toLocaleDateString('ko-KR', {
                                                    year: '2-digit',
                                                    month: '2-digit',
                                                    day: '2-digit'
                                                })}
                                            </div>
                                            <div className="idx-info">
                                                <div className="idx-title">{msg.title || 'Untitled'}</div>
                                                <div className="idx-text">{msg.text}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="corner pt-tl"></div>
                        <div className="corner pt-tr"></div>
                        <div className="corner pt-bl"></div>
                        <div className="corner pt-br"></div>
                    </div>
                </div>
            )}

            <div className={`address-footer ${showInfo ? 'active' : ''}`}>
                <div className="info-toggle" onClick={() => setShowInfo(!showInfo)}>사업자정보 {showInfo ? '▼' : '▲'}</div>
                {showInfo && (<div className="info-text">주식회사 이요하우스<br />ADDRESS : 서울시 마포구 희우정로 5길 29, 3층<br />BUSINESS LICENSE : 718-88-02112<br />MALL-ORDER LICENSE : 2024-서울송파-2708<br />EMAIL : goyangiyoram@gmail.com<br />웹사이트 디자인 : 어준 / <a href="https://www.instagram.com/djwns1234/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>@djwns1234</a></div>)}
            </div>
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
