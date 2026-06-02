"use client";

import type { RefObject } from "react";
import type { Language, Translation } from "@/lib/i18n";

interface HomeHeaderProps {
    activePreset: string;
    language: Language;
    logoRef: RefObject<HTMLDivElement | null>;
    t: Translation;
    user: any;
    profile: any;
    isProfileComplete: boolean;
    onLanguageChange: (language: Language) => void;
    onPresetChange: (preset: string) => void;
    onOpenLogin: () => void;
    onOpenAccountModal: () => void;
    onGoToCompleteProfile: () => void;
}

export default function HomeHeader({
    activePreset,
    language,
    logoRef,
    t,
    user,
    profile,
    isProfileComplete,
    onLanguageChange,
    onPresetChange,
    onOpenLogin,
    onOpenAccountModal,
    onGoToCompleteProfile,
}: HomeHeaderProps) {
    const nickname = profile?.full_name || user?.email?.split('@')[0] || user?.phone || "";
    const displayGreeting = language === "en"
        ? `Hello, ${nickname}`
        : `안녕하세요 ${nickname} 님`;

    return (
        <header className="header">
            <div className="header-left" ref={logoRef} onClick={() => onPresetChange('main')} style={{ cursor: 'pointer' }}>
                <div className="logo-main-text">iYOHOUSE</div>
            </div>
            <div className="btn-sep"></div>
            <div className="header-right">
                <button
                    className={`header-nav-item ${activePreset === 'member' ? 'active' : ''}`}
                    onClick={() => onPresetChange('member')}
                >
                    {t.nav.member}
                </button>

                <div className="header-lang">
                    <button
                        type="button"
                        className={language === "ko" ? "active" : ""}
                        onClick={() => onLanguageChange("ko")}
                        aria-pressed={language === "ko"}
                    >
                        KOR
                    </button>
                    <span aria-hidden="true">/</span>
                    <button
                        type="button"
                        className={language === "en" ? "active" : ""}
                        onClick={() => onLanguageChange("en")}
                        aria-pressed={language === "en"}
                    >
                        ENG
                    </button>
                </div>

                <button className="header-email" onClick={() => onPresetChange('contact')}>
                    goyangiyoram@gmail.com
                </button>

                <button
                    className="header-auth-btn"
                    onClick={user ? (isProfileComplete ? onOpenAccountModal : onGoToCompleteProfile) : onOpenLogin}
                    title={user ? "Edit Profile / Account" : "Log In"}
                >
                    {user ? displayGreeting : t.auth.login}
                </button>
            </div>
        </header>
    );
}
