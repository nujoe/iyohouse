"use client";

import ContactSidebar from "@/components/home/ContactSidebar";
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
    return (
        <div className={`left-panel ${isSidebarExpanded || isContactOpen ? 'expanded' : ''} ${isContactOpen ? 'contact-mode' : ''}`} onClick={() => !isContactOpen && onToggleSidebar()}>
            <div
                className="panel-icon"
                style={{ opacity: isSidebarExpanded || isContactOpen ? 0 : 1, pointerEvents: isSidebarExpanded || isContactOpen ? 'none' : 'auto' }}
                onClick={(e) => { if (isContactOpen) { e.stopPropagation(); onCloseContact(); } }}
            >
                <span></span>
                <span></span>
                <span></span>
            </div>

            {(isSidebarExpanded || isContactOpen) && (
                <button
                    className="sidebar-close-btn"
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
