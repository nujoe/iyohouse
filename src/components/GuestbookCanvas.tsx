"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { GuestMessage } from "@/hooks/useGuestbookData";

interface GuestbookCanvasProps {
    messages: GuestMessage[];
    mainTextRef: React.RefObject<HTMLElement | null>;
    inputContainerRef: React.RefObject<HTMLElement | null>;
    onOpenIndex?: () => void;
    active?: boolean;
}

interface Node extends d3.SimulationNodeDatum {
    id: string;
    text: string;
    title: string;
    shape: string;
    timestamp: number;
    el?: HTMLDivElement;
    isHovered: boolean;
    size: number;
    targetX?: number;
    targetY?: number;
}

interface Link extends d3.SimulationLinkDatum<Node> {
    id: string;
    opacity: number;
}

const manualPositions: Record<string, { x: number, y: number }> = {
    "example_id_1": { x: 500, y: 300 },
};

export default function GuestbookCanvas({
    messages,
    mainTextRef,
    inputContainerRef,
    onOpenIndex,
    active = true,
}: GuestbookCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const nodesContainerRef = useRef<HTMLDivElement>(null);
    const simulationRef = useRef<any>(null);
    const [nodes, setNodes] = useState<Node[]>([]);
    const [hubId, setHubId] = useState<string | null>(null);
    const [isOrbitHovered, setIsOrbitHovered] = useState(false);

    // A: 비활성 시 시뮬레이션 일시정지 → CPU 발열 제거
    useEffect(() => {
        if (!simulationRef.current) return;
        if (active) {
            simulationRef.current.alpha(0.05).restart();
        } else {
            simulationRef.current.stop();
        }
    }, [active]);

    useEffect(() => {
        if (messages.length === 0) return;
        const latestMessage = [...messages].sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];
        setHubId(latestMessage.id);
    }, [messages]);

    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const parent = canvas.parentElement!;
            const { width, height } = parent.getBoundingClientRect();
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            if (simulationRef.current) {
                simulationRef.current.force("center", d3.forceCenter(width / 2, height / 2));
                simulationRef.current.alpha(0.3).restart();
            }
        };

        window.addEventListener("resize", resize);
        resize();

        const simulation = d3.forceSimulation<Node>()
            .force("link", d3.forceLink<Node, Link>().id(d => d.id).distance(150).strength(0.1))
            .force("charge", d3.forceManyBody().strength(-200)) // 반발력을 살짝 낮춤
            .force("center", d3.forceCenter(canvas.width * 0.65 / (window.devicePixelRatio || 1), canvas.height / (2 * (window.devicePixelRatio || 1))))
            .force("collision", d3.forceCollide().radius(d => (d as Node).size / 2 + 30))
            // 그리드 위치를 유지하려는 복원력(Anchor Force) 추가
            .force("x", d3.forceX<Node>(d => (d as any).targetX || (canvas.width / 2)).strength(0.08))
            .force("y", d3.forceY<Node>(d => (d as any).targetY || (canvas.height / 2)).strength(0.08))
            .velocityDecay(0.45)
            .alphaDecay(0.03);

        simulationRef.current = simulation;

        simulation.on("tick", () => {
            const dpr = window.devicePixelRatio || 1;
            const width = canvas.width / dpr;
            const height = canvas.height / dpr;
            ctx.clearRect(0, 0, width, height);

            // 안전한 색상 및 상태 참조
            const intersectColor = (typeof document !== 'undefined')
                ? getComputedStyle(document.documentElement).getPropertyValue('--intersect').trim() || '#000'
                : '#000';
            const isOrbitActive = simulationRef.current?.isOrbitHovered;
            const currentHubId = simulationRef.current?.hubId;

            const avoidRect = (rectRef: React.RefObject<HTMLElement | null>, strength = 1.5) => {
                const parentRect = canvas.parentElement!.getBoundingClientRect();
                let r;
                
                if (rectRef.current) {
                    const rect = rectRef.current.getBoundingClientRect();
                    r = { 
                        left: rect.left - parentRect.left - 40,
                        right: rect.right - parentRect.left + 40, 
                        top: rect.top - parentRect.top - 40, 
                        bottom: rect.bottom - parentRect.top + 40 
                    };
                } else {
                    // Fallback for main text area if ref is not ready
                    r = { left: 0, right: window.innerWidth * 0.45, top: 0, bottom: window.innerHeight * 0.6 };
                }
                
                simulation.nodes().forEach(node => {
                    const margin = node.size / 2 + 10;
                    if (node.x! > r.left - margin && node.x! < r.right + margin && 
                        node.y! > r.top - margin && node.y! < r.bottom + margin) {
                        
                        const dx = node.x! - (r.left + r.right) / 2;
                        const dy = node.y! - (r.top + r.bottom) / 2;
                        const dist = Math.hypot(dx, dy) || 1;
                        
                        // Push out harder and prioritize rightwards/downwards push
                        node.vx! += (dx / dist) * strength * 3;
                        node.vy! += (dy / dist) * strength * 3;
                        if (node.x! < r.right) node.vx! += 1; // Extra nudge to the right
                    }
                });
            };

            const avoidCircle = (cx: number, cy: number, radius: number, strength = 0.5) => {
                simulation.nodes().forEach(node => {
                    const dx = node.x! - cx; const dy = node.y! - cy;
                    const dist = Math.hypot(dx, dy); const buffer = node.size / 2 + 20;
                    if (dist < radius + buffer) {
                        const push = (radius + buffer - dist) * strength * 0.1;
                        node.vx! += (dist !== 0 ? dx / dist : 0) * push;
                        node.vy! += (dist !== 0 ? dy / dist : 0) * push;
                    }
                });
            };

            avoidRect(mainTextRef, 2.0); // 텍스트 영역 회피 강도 대폭 강화
            avoidRect(inputContainerRef, 1.5); // 입력창 영역 회피
            avoidCircle(75, height - 75, 250, 1.5); // 블랙 오빗 주변 반반력 강화

            // 화면 밖으로 나가지 않도록 강제 제한 (Hard Bound)
            simulation.nodes().forEach(node => {
                const margin = node.size / 2 + 20;
                const topHeaderHeight = 100; // 상단 네비게이션 공간 확보
                
                if (node.x! < margin) { node.x = margin; node.vx! += 2; }
                if (node.x! > width - margin) { node.x = width - margin; node.vx! -= 2; }
                if (node.y! < topHeaderHeight) { node.y = topHeaderHeight; node.vy! += 2; }
                if (node.y! > height - margin) { node.y = height - margin; node.vy! -= 2; }

                // 우측 하단 회피 (사업자 정보 영역)
                if (node.x! > width * 0.75 && node.y! > height * 0.75) {
                    node.vx! -= 3;
                    node.vy! -= 3;
                }
            });

            // 1. 기본 선 및 블랙 오빗 드로잉 상태 격리
            ctx.save();
            // 기본 실뜨기
            ctx.beginPath();
            (simulation.force("link") as d3.ForceLink<Node, Link>).links().forEach(link => {
                const s = link.source as Node; const t = link.target as Node;
                const dist = Math.hypot(t.x! - s.x!, t.y! - s.y!);
                ctx.moveTo(s.x!, s.y!); ctx.lineTo(t.x!, t.y!);
                ctx.strokeStyle = `rgba(0, 0, 0, ${Math.max(0, 1 - dist / 500) * 0.4})`;
                ctx.lineWidth = 0.5;
            });
            ctx.stroke();

            ctx.restore();

            // 2. 허브 노드 연결
            const hubNode = simulation.nodes().find(n => n.id === currentHubId);
            if (hubNode) {
                ctx.save();
                ctx.beginPath();
                simulation.nodes().forEach(n => {
                    if (n.id !== hubNode.id) { ctx.moveTo(hubNode.x!, hubNode.y!); ctx.lineTo(n.x!, n.y!); }
                });
                ctx.strokeStyle = `rgba(0, 0, 0, 0.12)`;
                ctx.lineWidth = 0.4; ctx.stroke();
                ctx.restore();
            }

            // 3. 외곽 선
            ctx.save();
            const allNodes = simulation.nodes();
            const edgeNodes = allNodes.map(n => ({ node: n, dist: Math.min(n.x!, width - n.x!, n.y!, height - n.y!) })).sort((a, b) => a.dist - b.dist).slice(0, Math.max(0, allNodes.length - 10)).map(item => item.node);
            ctx.beginPath();
            edgeNodes.forEach((n) => {
                const seed = n.id;
                const getSV = (s: string) => (Math.abs(s.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % 1000) / 1000;
                const tc = 1 + Math.floor(getSV(seed + "multi") * 2);
                for (let j = 0; j < tc; j++) {
                    let tx = n.x!, ty = n.y!; const dxL = n.x!, dxR = width - n.x!, dyT = n.y!, dyB = height - n.y!; const minDist = Math.min(dxL, dxR, dyT, dyB);
                    if (minDist === dxR) tx = width + 500 + getSV(seed + j) * 200; else if (minDist === dxL) tx = -500 - getSV(seed + j) * 200; else if (minDist === dyT) ty = -500 - getSV(seed + j) * 200; else ty = height + 500 + getSV(seed + j) * 200;
                    if (minDist === dxR || minDist === dxL) ty += (getSV(seed + j + "Y") - 0.5) * 800; else tx += (getSV(seed + j + "X") - 0.5) * 800;
                    ctx.moveTo(n.x!, n.y!); ctx.lineTo(tx, ty);
                }
            });
            ctx.strokeStyle = `rgba(0, 0, 0, 0.1)`; ctx.lineWidth = 0.4; ctx.stroke();
            ctx.restore();

            simulation.nodes().forEach(node => { if (node.el) node.el.style.transform = `translate(${node.x}px, ${node.y}px) translate(-50%, -50%)`; });
        });

        return () => { window.removeEventListener("resize", resize); simulation.stop(); };
    }, [mainTextRef, inputContainerRef]);

    // 상태 동기화 고도화: 시뮬레이션 객체에 직접 상태 주입
    useEffect(() => {
        if (simulationRef.current) {
            simulationRef.current.hubId = hubId;
            simulationRef.current.isOrbitHovered = isOrbitHovered;
            // 상태 변경 즉시 시뮬레이션 재개 (반응성 강화)
            simulationRef.current.alpha(0.01).restart();
        }
    }, [hubId, isOrbitHovered]);

    useEffect(() => {
        if (!simulationRef.current) return;
        const currentNodes = [...simulationRef.current.nodes()];
        const currentLinks = [...(simulationRef.current.force("link") as any).links()];
        const getSR = (s: string) => (Math.abs(s.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % 1000) / 1000;
        // 1. 최신순 정렬 및 최신 ID 확보
        const sortedMsgs = [...messages].sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const latestId = sortedMsgs[0]?.id;

        // 2. 가용 영역 그리드 포인트 계산
        const gridPoints: {x: number, y: number}[] = [];
        const cellW = 180, cellH = 180;
        const columns = Math.ceil(window.innerWidth / cellW);
        const rows = Math.ceil(window.innerHeight / cellH);

        for (let r = 1; r < rows - 1; r++) {
            for (let c = 1; c < columns - 1; c++) {
                const px = c * cellW;
                const py = r * cellH;
                const isForbidden = (px < window.innerWidth * 0.45 && py < window.innerHeight * 0.6) || 
                                    (px > window.innerWidth * 0.7 && py > window.innerHeight * 0.75) ||
                                    (py < 120);
                if (!isForbidden) gridPoints.push({ x: px, y: py });
            }
        }

        // 3. 노드별 위치 할당
        sortedMsgs.forEach((msg, idx) => {
            if (currentNodes.find(n => n.id === msg.id)) return;
            const r3 = getSR(msg.id + "shape");
            const isNewest = msg.id === latestId;
            let initX, initY;

            if (manualPositions[msg.id]) { 
                initX = manualPositions[msg.id].x; 
                initY = manualPositions[msg.id].y; 
            } else if (isNewest) { 
                initX = window.innerWidth * 0.6; 
                initY = window.innerHeight * 0.5; 
            } else {
                // 그리드 포인트 중 하나 선택 (메시지 인덱스 기반)
                const pointIdx = idx % gridPoints.length;
                const basePoint = gridPoints[pointIdx];
                const jitterX = (getSR(msg.id + "jx") - 0.5) * 80;
                const jitterY = (getSR(msg.id + "jy") - 0.5) * 80;
                initX = basePoint.x + jitterX;
                initY = basePoint.y + jitterY;
            }

            const newNode: Node = { 
                id: msg.id, 
                text: msg.text, 
                title: msg.title || 'IYORAM', 
                shape: ['circle', 'diamond'][Math.floor(r3 * 2)], 
                timestamp: Date.parse(msg.created_at) || Date.now(), 
                isHovered: false, 
                size: 80, 
                x: initX, 
                y: initY,
                targetX: initX, // 그리드 목표 지점 저장
                targetY: initY 
            };
            currentNodes.push(newNode);
            if (currentNodes.length > 1) {
                const targets = currentNodes.filter(n => n.id !== newNode.id).sort((a, b) => Math.hypot(a.x! - newNode.x!, a.y! - newNode.y!) - Math.hypot(b.x! - newNode.x!, b.y! - newNode.y!)).slice(0, Math.floor(getSR(msg.id + "links") * 2) + 1);
                targets.forEach(t => currentLinks.push({ id: `${newNode.id}-${t.id}`, source: newNode, target: t, opacity: 1 }));
            }
        });
        simulationRef.current.nodes(currentNodes);
        (simulationRef.current.force("link") as any).links(currentLinks);

        // 정적 초기화 (Warm start): 렌더링 전 시뮬레이션을 여러 번 실행하여 노드들을 안정적인 위치로 미리 이동시킵니다.
        // 이를 통해 로딩 시 노드들이 "날아오는" 애니메이션을 없앨 수 있습니다.
        simulationRef.current.alpha(1);
        for (let i = 0; i < 100; ++i) simulationRef.current.tick();
        simulationRef.current.alpha(0.05); // 초기 배정 후에는 최소한의 움직임만 유지

        setNodes(currentNodes);
        simulationRef.current.restart();
    }, [messages, hubId]);

    return (
        <div id="network-container" className={isOrbitHovered ? 'orbit-active' : ''} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
            <canvas ref={canvasRef} id="edgeCanvas" style={{ zIndex: 1 }} />
            <div ref={nodesContainerRef} id="nodesContainer" style={{ zIndex: 3, position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {nodes.map(node => <NodeComponent key={node.id} node={node} simulation={simulationRef.current} />)}
            </div>
            <div
                className="black-orbit"
                onMouseEnter={() => setIsOrbitHovered(true)}
                onMouseLeave={() => setIsOrbitHovered(false)}
                onClick={onOpenIndex}
                style={{
                    position: 'absolute', left: '-150px', bottom: '-150px', width: '450px', height: '450px',
                    backgroundColor: 'var(--intersect)', borderRadius: '50%', zIndex: 2, pointerEvents: 'auto',
                    transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
            >
                <div style={{
                    color: 'var(--bg)',
                    fontFamily: 'inherit',
                    fontSize: '26px',
                    fontWeight: '600',
                    letterSpacing: isOrbitHovered ? '0.15em' : '0.1em',
                    transform: `translate(60px, -60px) scale(${isOrbitHovered ? 1.05 : 1})`,
                    opacity: isOrbitHovered ? 1 : 0.8,
                    transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                    whiteSpace: 'nowrap'
                }}>
                    방명록 index
                </div>
            </div>
        </div>
    );
}

function NodeComponent({ node, simulation }: { node: Node, simulation: any }) {
    const elRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!elRef.current || !simulation) return;
        node.el = elRef.current;
        const drag = d3.drag<HTMLDivElement, any>().on("start", (event) => { if (!event.active) simulation.alphaTarget(0.3).restart(); node.fx = node.x; node.fy = node.y; }).on("drag", (event) => { node.fx = event.x; node.fy = event.y; }).on("end", (event) => { if (!event.active) simulation.alphaTarget(0); node.fx = null; node.fy = null; });
        d3.select(elRef.current).call(drag as any);
    }, [node, simulation]);

    const svgShape = node.shape === 'circle' ? '<circle cx="50" cy="50" r="48" />' : (node.shape === 'square' ? '<rect x="1" y="1" width="98" height="98" />' : '<polygon points="50,2 98,50 50,98 2,50" stroke-linejoin="round" />');
    return (
        <div ref={elRef} className={`network-node guest-node shape-${node.shape}`} style={{ position: 'absolute', width: node.size, height: node.size, pointerEvents: 'auto' }} onMouseEnter={() => { node.isHovered = true; }} onMouseLeave={() => { node.isHovered = false; }}>
            <div className="node-visual-wrapper">
                <svg className="shape-outline" viewBox="0 0 100 100" preserveAspectRatio="none" dangerouslySetInnerHTML={{ __html: `<g stroke="#000" stroke-width="1">${svgShape}</g>` }} />
                <div className="msg-title"><span>{node.title}</span></div>
                <div className="msg-content"><div className="msg-text">{node.text}</div></div>
                <div className="msg-date">{`${new Date(node.timestamp).getMonth() + 1}.${new Date(node.timestamp).getDate()} ${String(new Date(node.timestamp).getHours()).padStart(2, '0')}:${String(new Date(node.timestamp).getMinutes()).padStart(2, '0')}`}</div>
            </div>
        </div>
    );
}
