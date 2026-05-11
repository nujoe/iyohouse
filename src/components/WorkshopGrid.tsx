"use client";

import { urlFor } from "@/sanity/image";
import Image from "next/image";
import { CSSProperties, memo } from "react";
import { getLegacyPosterMeta } from "@/lib/legacyPosters";

interface WorkshopGridProps {
    workshops: any[];
    registrationCounts?: Record<string, number>;
    registrations?: any[];
    onSelectWorkshop: (workshop: any) => void;
    getTagColor: (tag: string) => string;
}

function WorkshopGrid({
    workshops,
    registrationCounts,
    registrations = [],
    onSelectWorkshop,
    getTagColor
}: WorkshopGridProps) {
    const counts = registrationCounts || registrations.reduce<Record<string, number>>((acc, registration) => {
        const workshopId = registration?.workshop_id;
        if (typeof workshopId === 'string' || typeof workshopId === 'number') {
            acc[String(workshopId)] = (acc[String(workshopId)] || 0) + (typeof registration.count === 'number' ? registration.count : 1);
        }

        return acc;
    }, {});
    
    const renderWorkshopPreview = (ws: any) => {
        const isHardcoded = !ws.isSanity;
        const id = isHardcoded ? ws.id : ws._id;
        const title = isHardcoded ? `AI.zip ${ws.id} 그래픽` : ws.title;
        const tutor = isHardcoded ? "튜터 : 000 @asdf1234" : `튜터 : ${ws.tutor || '000'}`;
        const capacity = typeof ws.capacity === 'number' ? ws.capacity : 8;
        const registeredCount = ws.supabase_workshop_id ? (counts[ws.supabase_workshop_id] || 0) : 0;
        const isClosed = isHardcoded
            ? ws.id <= 11 || registeredCount >= capacity
            : ws.isClosed || registeredCount >= capacity;

        const legacyPoster = isHardcoded ? getLegacyPosterMeta(Number(ws.id)) : null;
        let posterWidth = legacyPoster?.width || 1080;
        let posterHeight = legacyPoster?.height || 1350;
        if (!isHardcoded && ws.posterMeta) {
            posterWidth = ws.posterMeta.width;
            posterHeight = ws.posterMeta.height;
        }
        const aspectRatio = `${posterWidth} / ${posterHeight}`;

        const imgUrl = isHardcoded
            ? legacyPoster?.src
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
                    className={`blueprint-img-box ${!imgUrl ? 'is-empty' : ''}`}
                    style={{ "--aspect-ratio": aspectRatio } as CSSProperties}
                >
                    {imgUrl && (
                        <Image
                            src={imgUrl}
                            alt={title}
                            width={posterWidth}
                            height={posterHeight}
                            sizes="(max-width: 900px) 50vw, (max-width: 1400px) 25vw, 300px"
                            style={{
                                width: '100%',
                                height: 'auto',
                                objectFit: 'contain',
                                objectPosition: 'center',
                            }}
                            onLoad={(e) => {
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

export default memo(WorkshopGrid);
