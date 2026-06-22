"use client";

import { urlFor } from "@/sanity/image";
import Image from "next/image";
import { CSSProperties, memo } from "react";
import { getWorkshopPath } from "@/lib/workshopRoutes";
import { useLanguage } from "@/lib/i18n";
import {
    getLocalizedWorkshopTitle,
    getLocalizedWorkshopTutor,
} from "@/lib/i18n/workshopLocalization";
import { parseCapacity } from "@/lib/workshopUtils";

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
    const { language, t } = useLanguage();
    const visibleWorkshops = workshops.filter((ws) => ws?.isActive !== false);
    const counts = registrationCounts || registrations.reduce<Record<string, number>>((acc, registration) => {
        const workshopId = registration?.workshop_id;
        if (typeof workshopId === 'string' || typeof workshopId === 'number') {
            acc[String(workshopId)] = (acc[String(workshopId)] || 0) + (typeof registration.count === 'number' ? registration.count : 1);
        }

        return acc;
    }, {});
    
    const renderWorkshopPreview = (ws: any, index: number) => {
        const id = ws._id || ws.id;
        const mobileColumns = 2;
        const lastRowStart = Math.floor((visibleWorkshops.length - 1) / mobileColumns) * mobileColumns;
        const isMobileRowEnd = (index + 1) % mobileColumns === 0;
        const isMobileLastRow = index >= lastRowStart;
        const itemClassName = [
            "workshop-item",
            isMobileRowEnd ? "is-mobile-row-end" : "",
            isMobileLastRow ? "is-mobile-last-row" : "",
        ].filter(Boolean).join(" ");
        const title = getLocalizedWorkshopTitle(ws, language, t);
        const workshopPath = getWorkshopPath(ws);
        const tutor = t.workshop.tutorLabel(getLocalizedWorkshopTutor(ws, language) || "000");
        const capacity = parseCapacity(ws.capacity, ws.schedule) ?? 8;
        const registeredCount = ws.supabase_workshop_id ? (counts[ws.supabase_workshop_id] || 0) : 0;
        const isClosed = ws.isClosed || registeredCount >= capacity;

        const posterWidth = ws.posterMeta?.width || 1080;
        const posterHeight = ws.posterMeta?.height || 1350;
        const aspectRatio = `${posterWidth} / ${posterHeight}`;

        const imgUrl = ws.poster ? urlFor(ws.poster).width(600).auto('format').url() : null;

        const content = (
            <>
                <div className="intersection-diamond"></div>
                <div className="color-dots">
                    <span className="dot-yellow">WORKSHOP</span>
                </div>
                <div
                    className={`blueprint-img-box ${!imgUrl ? 'is-empty' : ''}`}
                    style={{ "--aspect-ratio": aspectRatio } as CSSProperties}
                >
                    {imgUrl && (
                        <Image
                            src={imgUrl}
                            alt={ws.posterAlt || title}
                            width={posterWidth}
                            height={posterHeight}
                            loading={index < 2 ? "eager" : "lazy"}
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
                        {isClosed && <div className="tag-closed">{t.workshop.closed}</div>}
                        <div className="title-box">{title}</div>
                    </div>
                    <hr className="blueprint-hr" />
                    <div className="tutor-box">{tutor}</div>
                </div>
            </>
        );

        if (workshopPath) {
            return (
                <a
                    key={id}
                    className={itemClassName}
                    href={workshopPath}
                    onClick={(event) => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                        event.preventDefault();
                        onSelectWorkshop(ws);
                    }}
                    style={{ cursor: 'pointer' }}
                >
                    {content}
                </a>
            );
        }

        return (
            <div
                key={id}
                className={itemClassName}
                onClick={() => onSelectWorkshop(ws)}
                style={{ cursor: 'pointer' }}
            >
                {content}
            </div>
        );
    };

    return (
        <div className="workshop-grid">
            {visibleWorkshops.map((ws, index) => renderWorkshopPreview(ws, index))}
        </div>
    );
}

export default memo(WorkshopGrid);
