"use client";

import { useEffect, useRef, useState, CSSProperties } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { client } from "@/sanity/client";
import { urlFor } from "@/sanity/image";
import { useWorkshopData } from "@/hooks/useWorkshopData";
import { useGuestbookData } from "@/hooks/useGuestbookData";
import GuestbookCanvas from "@/components/GuestbookCanvas";
import WorkshopGrid from "@/components/WorkshopGrid";
import CalendarView from "@/components/CalendarView";
import { loadTossPayments } from "@tosspayments/payment-sdk";

const presets = {
    main: {
        line1: "calc(100% - 21px)",
        line2: "calc(100% - 14px)",
        line3: "calc(100% - 7px)",
        top2: "calc(var(--top-row-1) + 7px)"
    },
    house: {
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

export default function Home() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();

    // 1. 데이터 레이어 훅 도입 (디자인/레이아웃에 영향 없음)
    const {
        sanityWorkshops,
        registrations,
        calendarEvents,
        allWorkshops,
        loading: workshopLoading
    } = useWorkshopData();

    const {
        guestMessages,
        loading: guestLoading
    } = useGuestbookData();

    // 나머지 상태들은 유지 (기능 연결을 위해 필요)
    const [activePreset, setActivePreset] = useState<string>("main");
    const [showInfo, setShowInfo] = useState(false);
    const [selectedWorkshop, setSelectedWorkshop] = useState<any | null>(null);
    const [dynamicColor, setDynamicColor] = useState("#2563eb");
    const [scrollColor, setScrollColor] = useState<string | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date(2025, 3, 1));
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        setCurrentMonth(new Date());
    }, []);

    const [inputText, setInputText] = useState("");
    const [inputTitle, setInputTitle] = useState("");
    const [contactData, setContactData] = useState({ email: '', subject: '', message: '' });
    const [isSending, setIsSending] = useState(false);
    const [tossPayments, setTossPayments] = useState<any>(null);
    const [showSchedule, setShowSchedule] = useState(false);
    const [selectedSession, setSelectedSession] = useState<any | null>(null);

    // UI 요소의 위치를 참조하여 노드가 겹치지 않게 하는 Ref
    const mainTextRef = useRef<HTMLDivElement>(null);
    const inputContainerRef = useRef<HTMLDivElement>(null);

    // 토스 페이먼츠 초기화
    useEffect(() => {
        const clientKey = "test_ck_ALnQvDd2VJl6vpNz1RRO8Mj7X41m";
        loadTossPayments(clientKey).then(setTossPayments);
    }, []);

    // (물리 엔진 및 노드 생성 로직은 이제 GuestbookCanvas 컴포넌트 내부에서 처리됩니다)

    useEffect(() => {
        const workshopId = searchParams.get('workshop');
        const presetId = searchParams.get('preset');

        if (workshopId) {
            // 1. Sanity 워크숍에서 검색
            let found = sanityWorkshops.find(w => (w._id || w.id)?.toString() === workshopId);

            // 2. 없으면 하드코딩된 리스트에서 검색 (번호 기준)
            if (!found) {
                const idNum = parseInt(workshopId);
                if (!isNaN(idNum) && idNum > 0 && idNum <= 24) {
                    found = { id: idNum, title: `AI.zip ${idNum} 그래픽`, price: 150000 };
                }
            }

            if (found) {
                setSelectedWorkshop(found);
                setActivePreset('workshop');
                return;
            }
        }

        if (presetId) {
            setActivePreset(presetId);
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
        const params = new URLSearchParams(createQueryString('preset', preset === 'main' ? null : preset));
        params.delete('workshop');
        router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
        setActivePreset(preset);
        setSelectedWorkshop(null);
        setSelectedSession(null);
        setShowSchedule(false);
        setDynamicColor(randomColor());
        setScrollColor(null);
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        const maxScroll = target.scrollHeight - target.clientHeight;
        if (maxScroll <= 0) return;
        const scrollPercent = target.scrollTop / maxScroll;
        const h = Math.floor(scrollPercent * 360 * 1.5) % 360;
        setScrollColor(`hsl(${h}, 90%, 50%)`);
    };

    const intersectColor = scrollColor || dynamicColor;
    const currentPreset = presets[activePreset as keyof typeof presets] || presets.main;
    const containerStyle = {
        "--line-x-1": currentPreset.line1,
        "--line-x-2": currentPreset.line2,
        "--line-x-3": currentPreset.line3,
        "--top-row-2": currentPreset.top2,
        "--intersect": intersectColor,
    } as CSSProperties;

    const handleSendMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!inputText.trim()) return;

        const text = inputText.trim();
        const title = inputTitle.trim() || "Untitled";

        setInputText("");
        setInputTitle("");

        try {
            const { error } = await supabase
                .from('guestbook')
                .insert([{ text, title }]);

            if (error) {
                console.error('방명록 저장 실패:', error.message);
                alert("전송 실패: DB에 'title' 컬럼이 있는지 확인해주세요.");
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
            // orderId에는 영문, 숫자, -, _ 만 허용되므로 Sanity ID 등에서 특수문자를 제거
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
            if (error.code === 'USER_CANCEL') {
                console.log("사용자가 결제를 취소했습니다.");
            } else {
                console.error("결제 요청 에러:", error);
                alert(`결제 요청 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`);
            }
        }
    };


    // (방명록 물리 엔진 및 노드 생성 로직은 이제 GuestbookCanvas 컴포넌트 내부에서 처리됩니다)




    return (
        <div style={containerStyle} className="app-container">
            <style>{`:root { --line-x-1: ${currentPreset.line1}; --line-x-2: ${currentPreset.line2}; --line-x-3: ${currentPreset.line3}; --top-row-2: ${currentPreset.top2}; --intersect: ${intersectColor}; --accent-fixed: ${dynamicColor}; --scroll-hue: ${scrollColor ? (parseInt(scrollColor.match(/\d+/)![0])) : 220}; }`}</style>

            <header className="header">
                <div 
                    className="logo" 
                    onClick={() => handlePresetChange('main')}
                    style={{ cursor: 'pointer' }}
                >
                    <div className="logo-text">
                        <span className="logo-title">IYOHOUSE</span>
                    </div>
                </div>
                <div className="btn-sep"></div>
                <nav className="controls">
                    <button className={activePreset === 'house' ? 'active' : ''} onClick={() => handlePresetChange('house')}>HOUSE</button>
                    <div className="cat-bar"></div>
                    <button className={activePreset === 'workshop' ? 'active' : ''} onClick={() => handlePresetChange('workshop')}>WORKSHOP</button>
                    <button className={activePreset === 'club' ? 'active' : ''} onClick={() => handlePresetChange('club')}>IYOCA</button>
                    <button className={activePreset === 'diary' ? 'active' : ''} onClick={() => handlePresetChange('diary')}>CALENDAR</button>
                    <button className={activePreset === 'contact' ? 'active' : ''} onClick={() => handlePresetChange('contact')}>CONTACT</button>
                </nav>
            </header>

            <main className="stage">
                <div className="grid-frame">
                    {/* New Cell: House (Members) */}
                    <div className={`cell cell-house ${activePreset === 'house' ? 'active' : ''}`}>
                        <div className="cell-cover"></div>
                        <div className="cell-content">
                            {/* Empty for now as requested */}
                        </div>
                    </div>

                    <div className={`cell cell-club ${activePreset === 'club' ? 'active' : ''}`}>
                        <div className="cell-cover"></div>
                        <div className="cell-content">Club</div>
                    </div>

                    <div className={`cell cell-contact ${activePreset === 'contact' ? 'active' : ''}`}>
                        <div className="cell-cover"></div>
                        <div className="cell-content contact-content">
                            <div className="contact-main">
                                <div className="contact-form-wrapper">
                                    <div className="contact-header-merged">
                                        <h2 className="contact-form-title">CONTACT US</h2>
                                        <div className="contact-header-info">
                                            <div className="header-info-item"><span className="info-label">INSTAGRAM</span><a href="https://www.instagram.com/iyohouse/" target="_blank" rel="noopener noreferrer" className="info-val">@iyohouse</a></div>
                                            <div className="header-info-item"><span className="info-label">EMAIL</span><a href="mailto:goyangiyoram@gmail.com" className="info-val">goyangiyoram@gmail.com</a></div>
                                        </div>
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

                    <div className={`cell cell-workshop ${activePreset === 'workshop' ? 'active' : ''}`}>
                        <div className="cell-cover"></div>
                        <div className="cell-content workshop-wrapper" onScroll={handleScroll}>
                            {selectedWorkshop ? (
                                (() => {
                                    const currentRegs = registrations.filter(r => r.workshop_id === (selectedWorkshop._id || selectedWorkshop.id)).length;
                                    const capacity = selectedWorkshop.capacity || 8;
                                    const isSoldOut = currentRegs >= capacity || selectedWorkshop.isClosed;

                                    return (
                                        <div className="workshop-detail-container">
                                            <div className="detail-layout">
                                                <div className="detail-left">
                                                    <div className="detail-poster-wrapper">
                                                        {(() => {
                                                            const imgUrl = selectedWorkshop._id
                                                                ? (selectedWorkshop.poster ? urlFor(selectedWorkshop.poster).width(800).auto('format').url() : null)
                                                                : (selectedWorkshop.id === 24 ? `/assets/24.jpg` : `/assets/${selectedWorkshop.id.toString().padStart(2, '0')}.png`);

                                                            return imgUrl ? (
                                                                <img
                                                                    src={imgUrl}
                                                                    className="detail-main-poster"
                                                                    alt="Workshop Poster"
                                                                    loading="lazy"
                                                                    decoding="async"
                                                                />
                                                            ) : null;
                                                        })()}
                                                    </div>
                                                </div>
                                                <div className="detail-right">
                                                    <div className="detail-info-inner">
                                                        <div className="detail-info-header">
                                                            <div className="detail-tutor-group">
                                                                <div className="detail-tags">
                                                                    {selectedWorkshop.tags ? selectedWorkshop.tags.map((tag: string, i: number) => (<span key={i} className={`pills pill-${getTagColor(tag)}`}>{tag}</span>)) : (<><span className="pills pill-black"></span><span className="pills pill-yellow"></span><span className="pills pill-green"></span></>)}
                                                                </div>
                                                            </div>
                                                            <div className="detail-title-wrapper">
                                                                {isSoldOut && <div className="tag-closed-detail">마감</div>}
                                                                <div className="detail-main-title">{selectedWorkshop.title || `워크숍 ${selectedWorkshop.id}`}</div>
                                                            </div>
                                                        </div>
                                                        <div className="detail-description">
                                                            {selectedWorkshop.description ? (
                                                                <div className="portable-text">{selectedWorkshop.description.map((block: any, i: number) => (<p key={i}>{block.children?.map((c: any) => c.text).join('')}</p>))}</div>
                                                            ) : (
                                                                <><p>Ai.zip은 생성형 AI의 사용법을 배우고 다양한 직업에 접목해 보는 워크숍 시리즈입니다. AI를 창작의 도구로 활용해 자신만의 작업물을 완성해 봅니다. 이번 Ai.zip의 주제는 VFX입니다.</p><p>기존 VFX 워크플로우에 생성형 AI 기술을 접목하여 새로운 실험을 진행합니다. 현재 AI VFX의 가능성과 한계를 파악하고 샷을 설계하며 시간, 비용, 기술 등의 한계를 이전에는 시도해 보지 못했던 방법들을 구현합니다.</p><ul><li>상업적인 완성도보다는 다양한 AI 기술과 접근법을 폭넓게 실험하는 것에 집중합니다.</li><li>워크숍에서 활용할 프로그램 중에는 유료 서비스도 일부 포함되어 있기 때문에 개인별로 추가 구독료가 발생할 수 있습니다.</li><li>2주차 과정으로, Nullab: AI+VFX의 핵심 내용을 밀도 있게 경험할 수 있는 워크숍입니다.</li></ul></>
                                                            )}
                                                        </div>
                                                        <div className="detail-curriculum">
                                                            <h4>커리큘럼</h4>
                                                            {selectedWorkshop.curriculum ? selectedWorkshop.curriculum.map((item: any, i: number) => (<div key={i} className="curr-week"><strong>{item.weekLabel}</strong><p style={{ whiteSpace: 'pre-line' }}>{item.content}</p></div>)) : (
                                                                <><div className="curr-week"><strong>1주차 (4/11, 4/12)</strong><p>- 2D Comp 개념/원리 이해<br />- Comfy Cloud 시작<br />- 플레이트 배경 확장 (포토샵, 나토 비나나)<br />- 확장된 배경 영상화</p></div><div className="curr-week"><strong>2주차 (4/18, 4/19)</strong><p>- 영상 인페인팅 (Kling 3.0 omni, Wan vace 소개)<br />- 에셋에 맞춘 리라이팅 (Beebie AI, After effect Depth map)<br />- 2D Comp 실습</p></div></>
                                                            )}
                                                        </div>
                                                        <div className="detail-meta"><div className="meta-item"><strong>정원</strong><span>{selectedWorkshop.capacity || '8'}명</span></div></div>
                                                        <div className="detail-tutor-intro">
                                                            <h3>튜터소개</h3>
                                                            <p>⚘ 안내원 <br /> <strong>{selectedWorkshop.tutor || '현'}</strong></p>
                                                            <p className="tutor-bio">{selectedWorkshop.tutorBio || "현은 다양한 창작의 방법론을 연구하는 서울 기반의 디렉터로 ‘실패를 통해 자기 이해를 한다’는 문장을 좋아하며, 무엇이든 도전하고 실패하기를 즐긴다. 현재는 히얼투필름(@heretofilm)과 키요이(@kiyoioffice), 그리고 이요하우스(@iyohouse )를 운영하는 중. 비주얼 기획, 연출 감독, 촬영/조명 감독, 포토그래퍼, 퍼실리테이터, 놀이 연구원으로 활동하며 Ai와 동시대 디자인 파이프라인 연구하고 지식의 공유로 지속가능한 창작 생태계를 만들고자 한다."}</p>
                                                        </div>
                                                        <div className="detail-footer-actions">
                                                            <div className="price-tag">{selectedWorkshop.price ? selectedWorkshop.price.toLocaleString() : '000,000'}원</div>
                                                            <div className="schedule-selector-wrapper" style={{ position: 'relative', flex: 1 }}>
                                                                <button
                                                                    className={`action-btn outline-btn ${selectedSession ? 'selected' : ''}`}
                                                                    onClick={() => setShowSchedule(!showSchedule)}
                                                                >
                                                                    {selectedSession ? `${selectedSession.date} ${selectedSession.time}` : '일정 선택'}
                                                                </button>

                                                                {showSchedule && selectedWorkshop.schedule && (
                                                                    <div className="schedule-dropdown">
                                                                        {selectedWorkshop.schedule.map((s: any, i: number) => (
                                                                            <div key={i} className="schedule-option" onClick={() => { setSelectedSession(s); setShowSchedule(false); }}>
                                                                                <span className="s-date">{s.date}</span>
                                                                                <span className="s-time">{s.time}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {isSoldOut ? (
                                                                <button className="action-btn fill-btn disabled" disabled style={{ background: '#ccc', cursor: 'not-allowed' }}>정원 마감</button>
                                                            ) : (
                                                                <button
                                                                    className={`action-btn fill-btn ${!selectedSession && selectedWorkshop.schedule ? 'locked' : ''}`}
                                                                    onClick={() => {
                                                                        if (!selectedSession && selectedWorkshop.schedule && selectedWorkshop.schedule.length > 0) {
                                                                            alert("일정을 먼저 선택해 주세요.");
                                                                            setShowSchedule(true);
                                                                            return;
                                                                        }
                                                                        handleWorkshopPayment(selectedWorkshop);
                                                                    }}
                                                                >
                                                                    워크숍 신청
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()
                            ) : (
                                <WorkshopGrid
                                    workshops={allWorkshops}
                                    registrations={registrations}
                                    onSelectWorkshop={handleSelectWorkshop}
                                    getTagColor={getTagColor}
                                />
                            )}
                        </div>
                    </div>

                    <div className={`cell cell-diary ${activePreset === 'diary' ? 'active' : ''}`}>
                        <div className="cell-cover"></div>
                        <div className="cell-content diary-wrapper">
                            <CalendarView
                                currentMonth={currentMonth}
                                onMonthChange={setCurrentMonth}
                                calendarEvents={calendarEvents}
                            />
                        </div>
                    </div>

                    <div className={`cell cell-main ${activePreset === 'main' ? 'active' : ''}`}>
                        <div className="cell-cover"></div>
                        <div className="cell-content" style={{ width: '100%', height: '100%', position: 'relative' }}>
                            <div className="main-left-text" ref={mainTextRef} style={{ textAlign: 'left', padding: '100px 40px' }}>
                                <p>가느다란 실이 손가락 사이를 자유롭게 오가듯, ‘이요’는 우연한 교차에 주목합니다.</p>
                                <p>팽팽히 당기고 느슨히 푸는 실뜨기처럼, 생각은 서로의 손길을 타며 끊임없이 변형됩니다. 요람 속의 실들은 무엇이 될지 모른 채 잠시 엉키고 때로는 끊어지기도 합니다.</p>
                                <p>하지만 우리는 어긋남조차 새로운 연결이 된다는 사실을 기꺼이 받아들입니다. 창작자를 위한 공공공원은 이요하우스로 이어집니다.</p>
                            </div>
                            <GuestbookCanvas
                                messages={guestMessages}
                                mainTextRef={mainTextRef}
                                inputContainerRef={inputContainerRef}
                            />
                            <div className="guestbook-input-container" ref={inputContainerRef}>
                                <form onSubmit={handleSendMessage} className="guestbook-form">
                                    <input type="text" value={inputTitle} onChange={(e) => setInputTitle(e.target.value)} placeholder="제목" className="guestbook-title-input" />
                                    <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="방명록을 남겨주세요 ! " className="guestbook-input" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { handleSendMessage(); } }} />
                                    <button type="submit" className="guestbook-send-btn">전송</button>
                                </form>
                            </div>
                        </div>
                    </div>

                    <div className="h-line grid-row-1"></div><div className="h-line grid-row-2"></div>
                    <div className="v-line top-v-1"></div><div className="v-line top-v-2"></div><div className="v-line top-v-3"></div>
                </div>
            </main>

            <div className={`address-footer ${showInfo ? 'active' : ''}`}>
                <div className="info-toggle" onClick={() => setShowInfo(!showInfo)}>사업자정보 {showInfo ? '▼' : '▲'}</div>
                {showInfo && (<div className="info-text">주식회사 이요하우스<br />ADDRESS : 서울시 마포구 희우정로 5길 29, 3층<br />BUSINESS LICENSE : 718-88-02112<br />MALL-ORDER LICENSE : 2024-서울송파-2708<br />EMAIL : goyangiyoram@gmail.com</div>)}
            </div>
        </div>
    );
}
