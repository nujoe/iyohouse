"use client";

import type { UIEventHandler } from "react";

import WorkshopGrid from "@/components/WorkshopGrid";
import WorkshopDetailOverlay from "@/components/workshop/WorkshopDetailOverlay";
import type { Language, Translation } from "@/lib/i18n";

interface HomeWorkshopCellProps {
    activePreset: string;
    allWorkshops: any[];
    getTagColor: (tag: string) => string;
    isVisited: boolean;
    language: Language;
    onRequireLogin: () => void;
    onScroll: UIEventHandler<HTMLDivElement>;
    onSelectWorkshop: (workshop: any) => void;
    registrationCounts: Record<string, number>;
    selectedWorkshop: any | null;
    t: Translation;
}

export default function HomeWorkshopCell({
    activePreset,
    allWorkshops,
    getTagColor,
    isVisited,
    language,
    onRequireLogin,
    onScroll,
    onSelectWorkshop,
    registrationCounts,
    selectedWorkshop,
    t,
}: HomeWorkshopCellProps) {
    return (
        <div className={`cell cell-workshop ${activePreset === 'workshop' ? 'active' : ''}`}>
            <div className="cell-cover"></div>
            <div className="cell-content workshop-wrapper" onScroll={onScroll}>
                {isVisited && (
                    selectedWorkshop ? (
                        <WorkshopDetailOverlay
                            key={selectedWorkshop._id || selectedWorkshop.id}
                            workshop={selectedWorkshop}
                            t={t}
                            language={language}
                            registrationCounts={registrationCounts}
                            onRequireLogin={onRequireLogin}
                        />
                    ) : (
                        <WorkshopGrid
                            workshops={allWorkshops}
                            registrationCounts={registrationCounts}
                            onSelectWorkshop={onSelectWorkshop}
                            getTagColor={getTagColor}
                        />
                    )
                )}
            </div>
        </div>
    );
}
