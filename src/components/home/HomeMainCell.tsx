"use client";

import HomeInfoButton from "@/components/home/HomeInfoButton";
import MemberVisualStack from "@/components/MemberVisualStack";
import type { Translation } from "@/lib/i18n";

interface HomeMainCellProps {
    activePreset: string;
    t: Translation;
}

export default function HomeMainCell({ activePreset, t }: HomeMainCellProps) {
    return (
        <div className={`cell cell-main ${activePreset === 'main' ? 'active' : ''}`}>
            <div className="cell-cover"></div>
            <div className="cell-content main-content-layout">
                <div className="main-text-column">
                    <div className="main-intro-text">
                        {t.mainIntro}
                    </div>
                    <HomeInfoButton className="main-inline-info" t={t} />
                </div>
                <div className="mobile-main-divider"></div>
                <div className="main-visual-column">
                    <MemberVisualStack />
                </div>
            </div>
        </div>
    );
}
