"use client";

import { urlFor } from "@/sanity/image";
import { CSSProperties } from "react";

interface WorkshopGridProps {
    workshops: any[];
    registrations: any[];
    onSelectWorkshop: (workshop: any) => void;
    getTagColor: (tag: string) => string;
}

export default function WorkshopGrid({ 
    workshops, 
    registrations, 
    onSelectWorkshop, 
    getTagColor 
}: WorkshopGridProps) {
    
    const renderWorkshopPreview = (ws: any) => {
        const isHardcoded = !ws.isSanity;
        const id = isHardcoded ? ws.id : ws._id;
        const title = isHardcoded ? `AI.zip ${ws.id} 그래픽` : ws.title;
        const tutor = isHardcoded ? "튜터 : 000 @asdf1234" : `튜터 : ${ws.tutor || '000'}`;
        const isClosed = isHardcoded ? ws.id <= 11 : ws.isClosed;

        // 이미지 비율 계산 (CSS 변수용)
        let aspectRatio = "1080 / 1350";
        if (!isHardcoded && ws.posterMeta) {
            aspectRatio = `${ws.posterMeta.width} / ${ws.posterMeta.height}`;
        }

        // Sanity URL 최적화: width 힌트만 주고 height는 원본 비율에 맡김
        const imgUrl = isHardcoded
            ? (ws.id === 24 ? `/assets/24.jpg` : `/assets/${ws.id.toString().padStart(2, '0')}.png`)
            : (ws.poster ? urlFor(ws.poster).width(600).auto('format').url() : null);

        return (
            <div 
                key={id} 
                className="workshop-item" 
                onClick={() => onSelectWorkshop(ws)} 
                style={{ cursor: 'pointer' }}
            >
                <div className="intersection-diamond"></div>
                <div className="color-dots">
                    {isHardcoded ? (
                        <>
                            <span className="dot-black">AI</span>
                            <span className="dot-yellow">WORKSHOP</span>
                            <span className="dot-green">GRAPHIC</span>
                        </>
                    ) : (
                        ws.tags?.map((tag: string, idx: number) => (
                            <span key={idx} className={`dot-${getTagColor(tag)}`}>{tag}</span>
                        ))
                    )}
                </div>
                <div
                    className="blueprint-img-box"
                    style={{ "--aspect-ratio": aspectRatio } as CSSProperties}
                >
                    {imgUrl && (
                        <img 
                            src={imgUrl} 
                            loading="lazy" 
                            decoding="async"
                            alt={title}
                            onLoad={(e) => {
                                // 이미지 로드 완료 후 skeleton shimmer 해제
                                const box = (e.target as HTMLImageElement).parentElement;
                                if (box) box.classList.add('loaded');
                            }}
                        />
                    )}
                </div>
                <div className={`blueprint-info ${isClosed ? 'is-closed' : ''}`}>
                    <div className="info-row" style={{ justifyContent: 'flex-start', gap: '0.8rem' }}>
                        {isClosed && <div className="tag-closed">마감</div>}
                        <div className="title-box">{title}</div>
                    </div>
                    <hr className="blueprint-hr" />
                    <div className="tutor-box">{tutor}</div>
                </div>
            </div>
        );
    };

    return (
        <div className="workshop-grid">
            {workshops.map(ws => renderWorkshopPreview(ws))}
        </div>
    );
}
