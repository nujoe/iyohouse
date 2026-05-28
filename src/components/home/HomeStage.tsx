"use client";

import type { UIEventHandler } from "react";

import GridLines from "@/components/GridLines";
import HomeCalendarCell from "@/components/home/HomeCalendarCell";
import HomeMainCell from "@/components/home/HomeMainCell";
import HomeMemberCell from "@/components/home/HomeMemberCell";
import HomeWorkshopCell from "@/components/home/HomeWorkshopCell";
import type { Language, Translation } from "@/lib/i18n";

interface HomeStageProps {
    activePreset: string;
    allWorkshops: any[];
    calendarEvents: any[];
    currentMonth: Date;
    getTagColor: (tag: string) => string;
    language: Language;
    onCalendarMonthChange: (month: Date) => void;
    onRequireLogin: () => void;
    onWorkshopScroll: UIEventHandler<HTMLDivElement>;
    onSelectWorkshop: (workshop: any) => void;
    registrationCounts: Record<string, number>;
    selectedWorkshop: any | null;
    t: Translation;
    visited: Record<string, boolean>;
}

export default function HomeStage({
    activePreset,
    allWorkshops,
    calendarEvents,
    currentMonth,
    getTagColor,
    language,
    onCalendarMonthChange,
    onRequireLogin,
    onWorkshopScroll,
    onSelectWorkshop,
    registrationCounts,
    selectedWorkshop,
    t,
    visited,
}: HomeStageProps) {
    return (
        <main className="stage">
            <div className="grid-frame">
                <HomeWorkshopCell
                    activePreset={activePreset}
                    allWorkshops={allWorkshops}
                    getTagColor={getTagColor}
                    isVisited={Boolean(visited.workshop)}
                    language={language}
                    onRequireLogin={onRequireLogin}
                    onScroll={onWorkshopScroll}
                    onSelectWorkshop={onSelectWorkshop}
                    registrationCounts={registrationCounts}
                    selectedWorkshop={selectedWorkshop}
                    t={t}
                />

                <HomeCalendarCell
                    activePreset={activePreset}
                    calendarEvents={calendarEvents}
                    currentMonth={currentMonth}
                    isVisited={Boolean(visited.diary)}
                    onMonthChange={onCalendarMonthChange}
                />

                <HomeMainCell activePreset={activePreset} t={t} />

                <HomeMemberCell activePreset={activePreset} isVisited={Boolean(visited.member)} />

                <GridLines />
            </div>
        </main>
    );
}
