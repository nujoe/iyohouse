"use client";

import { useEffect, useRef, useState, CSSProperties, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { urlFor } from "@/sanity/image";
import { useWorkshopData } from "@/hooks/useWorkshopData";
import { useGuestbookData } from "@/hooks/useGuestbookData";
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

type IyoThread = {
    id: number;
    y: number;
    amplitude: number;
    frequency: number;
    phase: number;
    speed: number;
};

const getThreadWave = (thread: IyoThread, time: number, x: number) =>
    Math.sin(time * thread.speed + x * thread.frequency + thread.phase) * thread.amplitude;

const getEasedThreadMorph = (current: number, target: number) =>
    current + (target - current) * 0.085;

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
    const { guestMessages, refresh: refreshGuestbook } = useGuestbookData();

    const [activePreset, setActivePreset] = useState<string>("main");
    const [showInfo, setShowInfo] = useState(false);
    const [selectedWorkshop, setSelectedWorkshop] = useState<any | null>(null);
    const [dynamicColor, setDynamicColor] = useState("#2563eb");
    const [scrollColor, setScrollColor] = useState<string | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [isContactOpen, setIsContactOpen] = useState(false);
    const [isBooting, setIsBooting] = useState(true);
    const [showIyo, setShowIyo] = useState(true); // IYO 버튼 상태 (기본값 true: 텍스트 모드 시작)
    const mainTextRef = useRef<HTMLDivElement>(null);
    const textContentRef = useRef<HTMLDivElement>(null);
    const [splitText, setSplitText] = useState<any>(null);
    const [inputTitle, setInputTitle] = useState('');
    const [inputText, setInputText] = useState('');
    const [selectedMessage, setSelectedMessage] = useState<any | null>(null);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputText.trim()) return;

        try {
            const { error } = await supabase
                .from('guestbook')
                .insert([{ title: inputTitle, text: inputText }]);

            if (error) throw error;
            setInputTitle('');
            setInputText('');
            refreshGuestbook(); // 데이터 갱신
        } catch (err) {
            console.error('Error sending message:', err);
        }
    };

    const splitInstanceRef = useRef<any>(null);

    // 텍스트 분절 및 초기화
    useEffect(() => {
        if (textContentRef.current && activePreset === 'main') {
            // 이전 인스턴스가 있다면 먼저 복구
            if (splitInstanceRef.current) {
                splitInstanceRef.current.revert();
            }

            import('split-type').then((mod: any) => {
                const SplitType = mod['default'] || mod;
                if (!SplitType || typeof SplitType !== 'function' || !textContentRef.current) return;

                // lines와 chars를 모두 추적하도록 변경
                const split = new SplitType(textContentRef.current, { types: 'lines,chars' });
                splitInstanceRef.current = split;
                setSplitText(split);

                if (split.chars) {
                    (split.chars as any[]).forEach((char: any) => {
                        char.style.display = 'inline-block';
                        char.style.position = 'relative';
                        char.style.zIndex = '2';
                        char.classList.add('threaded-char');
                    });
                }
            }).catch(err => console.error("SplitType 로드 실패:", err));
        }

        // Cleanup: 컴포넌트가 사라지거나 프리셋이 바뀔 때 DOM 복구
        return () => {
            if (splitInstanceRef.current) {
                try {
                    splitInstanceRef.current.revert();
                    splitInstanceRef.current = null;
                } catch (e) {
                    console.warn("SplitType revert 중 오류 발생 (무시 가능):", e);
                }
            }
        };
    }, [activePreset]);

    // 애니메이션 제어 (Pure CSS/JS)
    useEffect(() => {
        if (!splitText || !splitText.chars) return;

        const chars = splitText.chars;

        if (showIyo) {
            // 텍스트 모드
            chars.forEach((char: any, i: number) => {
                const textWidth = char.dataset.textWidth || `${Math.max(char.getBoundingClientRect().width, 4)}px`;
                const textHeight = char.dataset.textHeight || `${Math.max(char.getBoundingClientRect().height, 12)}px`;
                char.dataset.textWidth = textWidth;
                char.dataset.textHeight = textHeight;
                char.style.transition = `opacity 0.45s ease ${i * 0.002}s, width 0.52s cubic-bezier(0.22, 1, 0.36, 1), height 0.52s cubic-bezier(0.22, 1, 0.36, 1), border-radius 0.52s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.45s ease, color 0.35s ease`;
                char.style.opacity = '1';
                char.style.display = 'inline-flex';
                char.style.alignItems = 'center';
                char.style.justifyContent = 'center';
                char.style.width = textWidth;
                char.style.height = textHeight;
                char.style.borderRadius = '0%';
                char.style.backgroundColor = 'transparent';
                char.style.color = 'inherit';
                char.style.cursor = 'default';
                char.style.boxShadow = 'none';
                char.onclick = null;
                char.onmouseenter = null;
                char.onmouseleave = null;
                char.classList.remove('threaded-dot');
            });
        } else {
            // 방명록 모드: 컬러풀한 원 및 호버 팝업 (순환 구조)
            const totalSlots = chars.length;

            chars.forEach((char: any, i: number) => {
                // 순환 인덱싱: 전체 슬롯보다 메시지가 많으면 (index % totalSlots) 자리에 덮어쓰기
                // 최신 메시지부터 역순으로 찾아서 해당 슬롯(i)에 해당하는 가장 최신 메시지를 할당
                const messageForThisSlot = [...guestMessages].reverse().find((_, revIdx) => {
                    const originalIdx = guestMessages.length - 1 - revIdx;
                    return originalIdx % totalSlots === i;
                });
                const hasMessage = !!messageForThisSlot;

                // 각 점마다 고유한 색상 부여 (HSL 활용)
                const hue = (i * 137.5) % 360;
                const color = `hsl(${hue}, 80%, 65%)`;
                const dimmedColor = `hsl(${hue}, 25%, 92%)`;

                const rect = char.getBoundingClientRect();
                if (!char.dataset.textWidth) char.dataset.textWidth = `${Math.max(rect.width, 4)}px`;
                if (!char.dataset.textHeight) char.dataset.textHeight = `${Math.max(rect.height, 12)}px`;
                const syllableSize = `${Math.max(
                    parseFloat(char.dataset.textWidth),
                    parseFloat(char.dataset.textHeight),
                    12
                )}px`;

                char.style.transition = `opacity 0.35s ease ${i * 0.001}s, width 0.6s cubic-bezier(0.22, 1, 0.36, 1), height 0.6s cubic-bezier(0.22, 1, 0.36, 1), border-radius 0.6s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.45s ease, box-shadow 0.3s ease, color 0.28s ease`;
                char.style.opacity = hasMessage ? '1' : '0.4';
                char.style.display = 'inline-flex';
                char.style.alignItems = 'center';
                char.style.justifyContent = 'center';
                char.style.width = syllableSize;
                char.style.height = syllableSize;
                char.style.borderRadius = '50%';
                char.style.backgroundColor = hasMessage ? color : dimmedColor;
                char.style.color = 'transparent';
                char.style.boxShadow = hasMessage ? `0 0 0 2px #000, 0 0 0 5px ${color}` : '0 0 0 1px #000';
                char.classList.add('threaded-dot');

                if (hasMessage) {
                    char.style.cursor = 'pointer';
                    // 호버 시 메시지 표시
                    char.onmouseenter = () => setSelectedMessage(messageForThisSlot);
                    char.onmouseleave = () => setSelectedMessage(null);
                    char.onclick = null; // 클릭 기능 제거
                    char.classList.add('floating-dot');
                } else {
                    char.style.cursor = 'default';
                    char.onmouseenter = null;
                    char.onmouseleave = null;
                    char.onclick = null;
                }
            });
        }
    }, [showIyo, splitText, guestMessages]);

    const [threads, setThreads] = useState<IyoThread[]>([]);
    const threadPathRefs = useRef<(SVGPathElement | null)[]>([]);
    const requestRef = useRef<number | null>(null);
    const timeRef = useRef<number>(0);
    const threadMorphRef = useRef<number>(0);

    // 실 위치 계산 및 애니메이션 루프
    useEffect(() => {
        if (!splitText || !splitText.lines || !splitText.chars || activePreset !== 'main') return;

        let rafId: number | null = null;
        let initialThreads: IyoThread[] = [];
        let charBindings: { char: HTMLElement; lineIndex: number; phase: number }[] = [];

        const setupThreads = () => {
            const containerRect = mainTextRef.current?.getBoundingClientRect();
            if (!containerRect || !splitText.lines) return;

            // 모든 유효한 라인을 추출 (textContent가 있는 모든 요소)
            const allLines = (splitText.lines as HTMLElement[]).filter(line => line.innerText.trim().length > 0);

            initialThreads = allLines.map((line, idx) => {
                const rect = line.getBoundingClientRect();
                return {
                    id: idx,
                    y: rect.top - containerRect.top + rect.height / 2,
                    amplitude: 4.5 + (idx % 3) * 1.5,
                    frequency: 0.003 + idx * 0.0002,
                    phase: idx * 1.5,
                    speed: 1.0 + idx * 0.05,
                };
            });

            charBindings = (splitText.chars as HTMLElement[]).map((char, idx) => {
                const parentLine = allLines.find(line => line.contains(char));
                const lineIndex = allLines.indexOf(parentLine as HTMLElement);
                return {
                    char,
                    lineIndex: lineIndex !== -1 ? lineIndex : 0,
                    phase: idx * 0.4,
                };
            });

            setThreads(initialThreads);
        };

        // 초기 실행 전 약간의 지연을 주어 레이아웃이 확정된 후 계산
        const timeoutId = setTimeout(setupThreads, 100);
        window.addEventListener('resize', setupThreads);

        // 애니메이션 루프
        const animate = () => {
            if (initialThreads.length === 0) {
                rafId = requestAnimationFrame(animate);
                return;
            }

            const containerRect = mainTextRef.current?.getBoundingClientRect();
            if (!containerRect) {
                rafId = requestAnimationFrame(animate);
                return;
            }

            timeRef.current += 0.025;
            const time = timeRef.current;
            const width = window.innerWidth * 2;
            const morphTarget = showIyo ? 0 : 1;
            threadMorphRef.current = getEasedThreadMorph(threadMorphRef.current, morphTarget);
            const morph = threadMorphRef.current;

            // 1. 실 애니메이션
            initialThreads.forEach((thread) => {
                const path = threadPathRefs.current[thread.id];
                if (path) {
                    const points = [];
                    for (let x = 0; x <= width; x += 15) {
                        const wave = getThreadWave(thread, time, x) * (1 + morph * 0.4);
                        points.push(`${x},${thread.y + wave}`);
                    }
                    path.setAttribute('d', `M ${points.join(' L ')}`);
                }
            });

            // 2. 글자 애니메이션
            charBindings.forEach(({ char, lineIndex, phase }) => {
                const thread = initialThreads[lineIndex];
                if (!thread) return;

                const charRect = char.getBoundingClientRect();
                const charXInSVG = charRect.left - containerRect.left + (window.innerWidth * 0.5) + (charRect.width / 2);
                const wave = getThreadWave(thread, time, charXInSVG) * (1 + morph * 0.4);
                
                // 방명록 모드일 때만 추가되는 미세한 흔들림
                const beadBob = Math.sin(time * 1.5 + phase) * 2 * morph;
                const scale = 1 + Math.sin(time * 1.2 + phase) * 0.03 * morph;

                char.style.transform = `translate3d(0, ${wave + beadBob}px, 0) scale(${scale})`;
            });

            rafId = requestAnimationFrame(animate);
        };

        rafId = requestAnimationFrame(animate);
        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener('resize', setupThreads);
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [splitText, showIyo, activePreset]);

    useEffect(() => {
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
                                {/* <img
                                    src="/logo.png"
                                    alt="IYOHOUSE Logo"
                                    style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
                                /> */}
                            </div>
                            <div className="main-content-area" style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <div className="main-left-text" ref={mainTextRef} style={{ textAlign: 'left', position: 'relative' }}>
                                    {/* 실(Threads) SVG 레이어 (텍스트 위에 배치하여 관통 느낌 극대화) */}
                                    <svg className="threads-overlay">
                                        {threads.map((thread) => (
                                            <path
                                                key={thread.id}
                                                ref={(node) => {
                                                    threadPathRefs.current[thread.id] = node;
                                                }}
                                                fill="none"
                                                stroke="#000"
                                                strokeWidth={showIyo ? "1.2" : "1.8"}
                                                opacity={showIyo ? "0.95" : "1"}
                                            />
                                        ))}
                                    </svg>

                                    <div className="text-content-wrapper" ref={textContentRef}>
                                        <p>가느다란 실이 손가락 사이를 자유롭게 오가듯, &apos;이요&apos;는 우연한 교차에 주목합니다.</p>
                                        <p>팽팽히 당기고 느슨히 푸는 실뜨기처럼, 생각은 서로의 손길을 타며 끊임없이 변형됩니다. 요람 속의 실들은 무엇이 될지 모른 채 잠시 엉키고 때로는 끊어지기도 합니다.</p>
                                        <p>하지만 우리는 어긋남조차 새로운 연결이 된다는 사실을 기꺼이 받아들입니다. 창작자를 위한 공공공원은 이요하우스로 이어집니다.</p>
                                    </div>
                                </div>
                            </div>

                            {/* 텍스트가 모핑되어 원이 되었을 때(방명록 모드)만 입력창 노출 */}
                            {activePreset === 'main' && !showIyo && (
                                <div className="guestbook-input-container">
                                    <form onSubmit={handleSendMessage} className="guestbook-form">
                                        <input
                                            type="text"
                                            value={inputTitle}
                                            onChange={(e) => setInputTitle(e.target.value)}
                                            placeholder="제목"
                                            className="guestbook-title-input"
                                        />
                                        <input
                                            type="text"
                                            value={inputText}
                                            onChange={(e) => setInputText(e.target.value)}
                                            placeholder="방명록을 남겨주세요 ! "
                                            className="guestbook-input"
                                        />
                                        <button type="submit" className="guestbook-send-btn">전송</button>
                                    </form>
                                </div>
                            )}

                            {/* 방명록 메시지 팝업 */}
                            {selectedMessage && (
                                <div className="guestbook-message-popup">
                                    <div className="message-popup-inner">
                                        <div className="message-title">{selectedMessage.title || 'Message'}</div>
                                        <div className="message-text">{selectedMessage.text}</div>
                                        <div className="message-date">{new Date(selectedMessage.created_at).toLocaleDateString()}</div>
                                    </div>
                                </div>
                            )}
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



            {activePreset === 'main' && (
                <>
                    <div className="footer-left-group">
                        <div className="iyo-footer-v2">
                            <div className={`iyo-container-v2 ${showIyo ? 'active' : ''}`} onClick={() => setShowIyo(true)}>
                                <div className="iyo-text-v2">
                                    글자를 원래의 위치로<br />
                                    모아줍니다.
                                </div>
                                <div className="iyo-label-v2">IYO</div>
                            </div>
                        </div>
                        <div className="guestbook-footer-v2">
                            <div className={`iyo-container-v2 ${!showIyo ? 'active' : ''}`} onClick={() => setShowIyo(false)}>
                                <div className="iyo-text-v2">
                                    방명록을 작성하거나<br />
                                    친구들의 메시지를 확인해보세요.
                                </div>
                                <div className="iyo-label-v2">방명록</div>
                            </div>
                        </div>
                    </div>

                    <div className="address-footer">
                        <div className="info-container">
                            <div className="info-text">
                                주식회사 이요하우스<br />
                                ADDRESS : 서울시 마포구 희우정로 5길 29, 3층<br />
                                BUSINESS LICENSE : 718-88-02112<br />
                                MALL-ORDER LICENSE : 2024-서울송파-2708<br />
                                EMAIL : goyangiyoram@gmail.com<br />
                                웹사이트 디자인 : 어준 / <a href="https://www.instagram.com/djwns1234/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 'bold' }}>@djwns1234</a>
                            </div>
                            <div className="info-label">INFO</div>
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
