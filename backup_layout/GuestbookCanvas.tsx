"use client";

import { useEffect, useRef } from "react";
import { GuestMessage } from "@/hooks/useGuestbookData";

interface GuestbookCanvasProps {
    messages: GuestMessage[];
    mainTextRef: React.RefObject<HTMLElement | null>;
    inputContainerRef: React.RefObject<HTMLElement | null>;
}

interface Node {
    id: string;
    text: string;
    title: string;
    shape: string;
    timestamp: number;
    x: number;
    y: number;
    anchorX: number;
    anchorY: number;
    quadrant: number;
    floatRadius: number;
    phaseX: number;
    phaseY: number;
    floatSpeed: number;
    el: HTMLElement;
    currentSize: number;
    isHovered: boolean;
}

export default function GuestbookCanvas({ 
    messages, 
    mainTextRef, 
    inputContainerRef 
}: GuestbookCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const nodesContainerRef = useRef<HTMLDivElement>(null);
    const nodesRef = useRef<Node[]>([]);
    const edgesRef = useRef<{ source: Node; target: Node }[]>([]);

    useEffect(() => {
        const nodesContainer = nodesContainerRef.current;
        const canvas = canvasRef.current;
        if (!canvas || !nodesContainer) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animationId: number;
        let draggedNode: Node | null = null;

        const resizeCanvas = () => {
            const container = canvas.parentElement;
            if (container) {
                const dpr = window.devicePixelRatio || 1;
                const rect = container.getBoundingClientRect();
                canvas.width = rect.width * dpr;
                canvas.height = rect.height * dpr;
                canvas.style.width = `${rect.width}px`;
                canvas.style.height = `${rect.height}px`;
                if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        const updatePhysics = () => {
            const dpr = window.devicePixelRatio || 1;
            const width = canvas.width / dpr;
            const height = canvas.height / dpr;
            const nodes = nodesRef.current;

            // 1. 노드 간 반발력 (Repulsion)
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const ni = nodes[i];
                    const nj = nodes[j];
                    if (ni.isHovered || nj.isHovered) continue;

                    let adx = nj.anchorX - ni.anchorX;
                    let ady = nj.anchorY - ni.anchorY;
                    let distSq = adx * adx + ady * ady;
                    if (distSq === 0) { adx = Math.random() - 0.5; ady = Math.random() - 0.5; distSq = adx * adx + ady * ady; }

                    const dist = Math.sqrt(distSq);
                    const minAllowedDist = ((ni.currentSize || 80) + (nj.currentSize || 80)) / 2 + (ni.floatRadius || 30) + (nj.floatRadius || 30) + 20;

                    if (dist < minAllowedDist) {
                        const push = (minAllowedDist - dist) * 0.2;
                        const amx = (adx / dist) * push;
                        const amy = (ady / dist) * push;
                        if (ni !== draggedNode) { ni.anchorX -= amx; ni.anchorY -= amy; }
                        if (nj !== draggedNode) { nj.anchorX += amx; nj.anchorY += amy; }
                    }
                }
            }

            const now = Date.now();
            const containerRect = nodesContainer.getBoundingClientRect();

            const getRelativeRect = (ref: React.RefObject<HTMLElement | null>) => {
                if (!ref.current) return null;
                const r = ref.current.getBoundingClientRect();
                return {
                    left: r.left - containerRect.left,
                    right: r.right - containerRect.left,
                    top: r.top - containerRect.top,
                    bottom: r.bottom - containerRect.top
                };
            };

            const dynamicTextRect = getRelativeRect(mainTextRef);
            const dynamicInputRect = getRelativeRect(inputContainerRef);

            nodes.forEach(n => {
                if (n.isHovered) return;
                if (n !== draggedNode) {
                    const t = now / 1000;
                    const targetX = n.anchorX + Math.sin(t * n.floatSpeed + n.phaseX) * n.floatRadius;
                    const targetY = n.anchorY + Math.cos(t * n.floatSpeed * 0.7 + n.phaseY) * n.floatRadius;

                    n.x += (targetX - n.x) * 0.05;
                    n.y += (targetY - n.y) * 0.05;

                    const nudgeAnchor = (rect: any) => {
                        if (!rect) return;
                        const radius = (n.currentSize || 120) / 2 + 20;
                        const ax = n.anchorX, ay = n.anchorY;
                        if (ax > rect.left - radius && ax < rect.right + radius && ay > rect.top - radius && ay < rect.bottom + radius) {
                            const rcx = (rect.left + rect.right) / 2;
                            const rcy = (rect.top + rect.bottom) / 2;
                            const ddx = ax - rcx, ddy = ay - rcy;
                            const d = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
                            const push = ((rect.right - rect.left) / 2 + radius - d) * 1.2;
                            n.anchorX += (ddx / d) * push;
                            n.anchorY += (ddy / d) * push;
                        }
                    };
                    nudgeAnchor(dynamicTextRect);
                    nudgeAnchor(dynamicInputRect);

                    const ap = 80;
                    n.anchorX = Math.min(Math.max(n.anchorX, ap), width - ap);
                    n.anchorY = Math.min(Math.max(n.anchorY, ap), height - ap);
                }
            });
        };

        const drawNetwork = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const edges = edgesRef.current;
            const nodes = nodesRef.current;

            ctx.beginPath();
            edges.forEach(e => { ctx.moveTo(e.source.x, e.source.y); ctx.lineTo(e.target.x, e.target.y); });
            ctx.strokeStyle = '#000000'; ctx.globalAlpha = 1.0; ctx.lineWidth = 0.4; ctx.stroke();

            const now = Date.now();
            nodes.forEach(n => {
                const isMobile = window.innerWidth < 768;
                const targetSize = isMobile ? 60 : 80;

                n.currentSize += (targetSize - n.currentSize) * 0.1;

                if (n.isHovered) {
                    n.el.style.width = '320px';
                    n.el.style.height = ''; 
                    n.el.style.minHeight = '140px';
                    n.el.style.zIndex = '9999';
                    n.el.style.left = n.x + 'px';
                    n.el.style.top = (n.y - 40) + 'px'; 
                    n.el.style.transform = 'translateX(-50%)'; 
                } else {
                    n.el.style.width = n.currentSize + 'px'; n.el.style.height = n.currentSize + 'px';
                    const age = now - n.timestamp;
                    n.el.style.minHeight = ''; n.el.style.zIndex = Math.floor(1000 - (age / 1000)).toString();
                    
                    const titleEl = n.el.querySelector('.msg-title') as HTMLElement;
                    const contentEl = n.el.querySelector('.msg-content') as HTMLElement;
                    if (targetSize <= 20) {
                        if (titleEl) titleEl.style.display = 'none';
                        if (contentEl) contentEl.style.display = 'none';
                    } else {
                        if (titleEl) titleEl.style.display = '';
                        if (contentEl) contentEl.style.display = '';
                    }
                }
                n.el.style.left = n.x + 'px'; n.el.style.top = n.y + 'px'; n.el.style.transform = `translate(-50%, -50%)`;
            });
        };

        const loop = () => { updatePhysics(); drawNetwork(); animationId = requestAnimationFrame(loop); };
        loop();

        return () => { 
            cancelAnimationFrame(animationId); 
            window.removeEventListener('resize', resizeCanvas); 
        };
    }, [mainTextRef, inputContainerRef]);

    useEffect(() => {
        const nodesContainer = nodesContainerRef.current;
        if (!nodesContainer || messages.length === 0) return;

        messages.forEach((msg) => {
            if (nodesRef.current.find(n => n.id === msg.id)) return;
            const el = document.createElement("div");
            const shapes = ['circle', 'square', 'diamond'];
            const shapeType = shapes[Math.floor(Math.random() * shapes.length)];
            el.className = `network-node guest-node shape-${shapeType}`;
            
            const date = new Date(msg.created_at);
            const dateStr = `${date.getMonth() + 1}.${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

            let svgShape = '';
            if (shapeType === 'circle') svgShape = '<circle cx="50" cy="50" r="48" />';
            else if (shapeType === 'square') svgShape = '<rect x="1" y="1" width="98" height="98" />';
            else if (shapeType === 'diamond') svgShape = '<polygon points="50,2 98,50 50,98 2,50" stroke-linejoin="round" />';

            el.innerHTML = `
                <svg class="shape-outline" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <g fill="var(--node-color, var(--bg))" stroke="#000" stroke-width="1">${svgShape}</g>
                </svg>
                <div class="msg-title"><span>${msg.title || "IYORAM"}</span></div>
                <div class="msg-content"><div class="msg-text">${msg.text}</div></div>
                <div class="msg-date">${dateStr}</div>
            `;
            el.style.setProperty('--node-color', 'var(--bg)');
            nodesContainer.appendChild(el);

            const containerW = nodesContainer.clientWidth || window.innerWidth;
            const containerH = nodesContainer.clientHeight || window.innerHeight;
            const cx = containerW / 2;
            const cy = containerH / 2;

            const counts = [0, 0, 0, 0];
            nodesRef.current.forEach(n => {
                const isLeft = n.x < cx;
                const isTop = n.y < cy;
                if (isLeft && isTop) counts[0]++;
                else if (!isLeft && isTop) counts[1]++;
                else if (isLeft && !isTop) counts[2]++;
                else counts[3]++;
            });

            const targetQuad = counts.indexOf(Math.min(...counts));
            const margin = 0.05, innerMargin = 0.1;
            let spawnX = 0, spawnY = 0;

            if (targetQuad === 0) {
                spawnX = containerW * (margin + Math.random() * (0.5 - margin - innerMargin / 2));
                spawnY = containerH * (margin + Math.random() * (0.5 - margin - innerMargin / 2));
            } else if (targetQuad === 1) {
                spawnX = containerW * (0.5 + innerMargin / 2 + Math.random() * (0.5 - margin - innerMargin / 2));
                spawnY = containerH * (margin + Math.random() * (0.5 - margin - innerMargin / 2));
            } else if (targetQuad === 2) {
                spawnX = containerW * (margin + Math.random() * (0.5 - margin - innerMargin / 2));
                spawnY = containerH * (0.5 + innerMargin / 2 + Math.random() * (0.5 - margin - innerMargin / 2));
            } else {
                spawnX = containerW * (0.5 + innerMargin / 2 + Math.random() * (0.5 - margin - innerMargin / 2));
                spawnY = containerH * (0.5 + innerMargin / 2 + Math.random() * (0.5 - margin - innerMargin / 2));
            }

            const newNode: Node = {
                id: msg.id, text: msg.text, title: msg.title || 'IYORAM',
                shape: shapeType, timestamp: Date.parse(msg.created_at) || Date.now(),
                x: spawnX, y: spawnY, anchorX: spawnX, anchorY: spawnY,
                quadrant: targetQuad, floatRadius: 20 + Math.random() * 25,
                phaseX: Math.random() * Math.PI * 2, phaseY: Math.random() * Math.PI * 2,
                floatSpeed: 0.25 + Math.random() * 0.2, el, currentSize: 10, isHovered: false
            };
            el.addEventListener('mouseenter', () => { newNode.isHovered = true; });
            el.addEventListener('mouseleave', () => { newNode.isHovered = false; });
            nodesRef.current.push(newNode);

            if (nodesRef.current.length > 1) {
                const numEdges = Math.floor(Math.random() * 2) + 1;
                const existingNodes = nodesRef.current.slice(0, -1);
                const oppositeQuad = 3 - targetQuad;
                const oppositeNodes = existingNodes.filter(n => n.quadrant === oppositeQuad);

                for (let i = 0; i < numEdges; i++) {
                    const targetNode = (Math.random() < 0.8 && oppositeNodes.length > 0)
                        ? oppositeNodes[Math.floor(Math.random() * oppositeNodes.length)]
                        : existingNodes[Math.floor(Math.random() * existingNodes.length)];
                    edgesRef.current.push({ source: newNode, target: targetNode });
                }
            }
        });
    }, [messages]);

    return (
        <div id="network-container">
            <canvas ref={canvasRef} id="edgeCanvas" />
            <div ref={nodesContainerRef} id="nodesContainer" />
        </div>
    );
}
