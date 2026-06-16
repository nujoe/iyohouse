"use client";

import { useLayoutEffect, useRef, useState } from "react";

import ContactSidebar from "@/components/home/ContactSidebar";
import HomeInfoButton from "@/components/home/HomeInfoButton";
import type { Translation } from "@/lib/i18n";

interface HomeSidebarProps {
    activePreset: string;
    isContactOpen: boolean;
    isProfileComplete: boolean;
    isSidebarExpanded: boolean;
    onCloseContact: () => void;
    onCloseSidebar: () => void;
    onGoToCompleteProfile: () => void;
    onOpenAccountModal: () => void;
    onOpenLogin: () => void;
    onOpenSignup: () => void;
    onPresetChange: (preset: string) => void;
    onSignOut: () => Promise<void>;
    onToggleSidebar: () => void;
    t: Translation;
    user: any;
}

export default function HomeSidebar({
    activePreset,
    isContactOpen,
    isProfileComplete,
    isSidebarExpanded,
    onCloseContact,
    onCloseSidebar,
    onGoToCompleteProfile,
    onOpenAccountModal,
    onOpenLogin,
    onOpenSignup,
    onPresetChange,
    onSignOut,
    onToggleSidebar,
    t,
    user,
}: HomeSidebarProps) {
    const isPanelOpen = isSidebarExpanded || isContactOpen;
    const wasPanelOpenRef = useRef(isPanelOpen);
    const [isPanelClosing, setIsPanelClosing] = useState(false);

    useLayoutEffect(() => {
        const wasPanelOpen = wasPanelOpenRef.current;
        wasPanelOpenRef.current = isPanelOpen;

        if (wasPanelOpen && !isPanelOpen) {
            setIsPanelClosing(true);
            const timeoutId = window.setTimeout(() => {
                setIsPanelClosing(false);
            }, 200);

            return () => window.clearTimeout(timeoutId);
        }

        if (isPanelOpen) {
            setIsPanelClosing(false);
        }
    }, [isPanelOpen]);

    const shouldShowPanelIcon = !isPanelOpen && !isPanelClosing;

    return (
        <div className={`left-panel ${isPanelOpen ? 'expanded' : ''} ${isContactOpen ? 'contact-mode' : ''}`} onClick={() => !isContactOpen && onToggleSidebar()}>
            <div className="mobile-panel-actions" style={{ opacity: shouldShowPanelIcon ? 1 : 0, pointerEvents: shouldShowPanelIcon ? 'auto' : 'none' }}>
                <button
                    type="button"
                    className="panel-icon"
                    aria-label={isPanelOpen ? "메뉴 닫기" : "메뉴 열기"}
                    aria-expanded={isPanelOpen}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (isContactOpen) {
                            onCloseContact();
                        } else {
                            onToggleSidebar();
                        }
                    }}
                >
                    <span></span>
                    <span></span>
                    <span></span>
                </button>
                <button
                    type="button"
                    className="mobile-panel-action mobile-home-action"
                    aria-label="홈으로 이동"
                    onClick={(e) => {
                        e.stopPropagation();
                        onPresetChange("main");
                    }}
                >
                    <span className="mobile-home-glyph">⌂</span>
                </button>
                <button
                    type="button"
                    className="mobile-panel-action mobile-contact-action"
                    aria-label="컨택트 열기"
                    onClick={(e) => {
                        e.stopPropagation();
                        onPresetChange("contact");
                    }}
                >
                    <span className="mobile-mail-glyph">✉</span>
                </button>
                <HomeInfoButton className="mobile-sidebar-info" label="i" t={t} />
            </div>

            {isPanelOpen && (
                <button
                    className="sidebar-close-btn"
                    aria-label="메뉴 닫기"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (isContactOpen) {
                            onCloseContact();
                        } else {
                            onCloseSidebar();
                        }
                    }}
                >
                    <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            )}

            {!isContactOpen ? (
                <nav className="sidebar-nav" onClick={(e) => e.stopPropagation()}>
                    <div className="sidebar-nav-top">
                        <button className={`${activePreset === 'main' ? 'active' : ''}`} onClick={() => { onPresetChange('main'); onCloseSidebar(); }}>{t.nav.main}</button>
                        <button className={`${activePreset === 'member' ? 'active' : ''}`} onClick={() => { onPresetChange('member'); onCloseSidebar(); }}>{t.nav.member}</button>
                        <button className={`${activePreset === 'workshop' ? 'active' : ''}`} onClick={() => { onPresetChange('workshop'); onCloseSidebar(); }}>{t.nav.workshop}</button>
                        <button className={`${activePreset === 'diary' ? 'active' : ''}`} onClick={() => { onPresetChange('diary'); onCloseSidebar(); }}>{t.nav.calendar}</button>
                        <button className={`${isContactOpen ? 'active' : ''}`} onClick={() => { onPresetChange('contact'); }}>{t.nav.contact}</button>
                    </div>

                    <div className="sidebar-nav-bottom">
                        {!user ? (
                            <>
                                <button className="user-login-btn" onClick={() => { onOpenLogin(); onCloseSidebar(); }}>
                                    {t.auth.login}
                                </button>
                                <button className="user-signup-btn" onClick={() => { onOpenSignup(); onCloseSidebar(); }}>
                                    {t.auth.signup}
                                </button>
                            </>
                        ) : !isProfileComplete ? (
                            <>
                                <button className="user-signup-btn" onClick={() => { onGoToCompleteProfile(); onCloseSidebar(); }}>
                                    {t.auth.editProfile}
                                </button>
                                <button className="user-login-btn" onClick={async () => { await onSignOut(); onCloseSidebar(); }}>
                                    {t.auth.logout}
                                </button>
                            </>
                        ) : (
                            <>
                                <button className="user-signup-btn" onClick={() => { onOpenAccountModal(); onCloseSidebar(); }}>
                                    {t.auth.editProfile}
                                </button>
                                <button className="user-login-btn" onClick={async () => { await onSignOut(); onCloseSidebar(); }}>
                                    {t.auth.logout}
                                </button>
                            </>
                        )}
                    </div>
                </nav>
            ) : (
                <ContactSidebar
                    isOpen={isContactOpen}
                    onClose={onCloseContact}
                    t={t}
                />
            )}
        </div>
    );
}
