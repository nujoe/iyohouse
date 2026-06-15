"use client";

import { useRef, useState } from "react";
import { useWorkshopData } from "@/hooks/useWorkshopData";
import { useAuth } from "@/hooks/useAuth";
import { useProfileNavigation } from "@/hooks/useProfileNavigation";
import { useGridLayout } from "@/hooks/useGridLayout";
import { useHomeBootState } from "@/hooks/useHomeBootState";
import { useHomeCalendarMonth } from "@/hooks/useHomeCalendarMonth";
import { useHomeScrollReset } from "@/hooks/useHomeScrollReset";
import { useHomeTheme } from "@/hooks/useHomeTheme";
import { useIncompleteProfileRedirect } from "@/hooks/useIncompleteProfileRedirect";
import { useLogoMetrics } from "@/hooks/useLogoMetrics";
import { useHomeNavigationState } from "@/hooks/useHomeNavigationState";
import { useHomeModalState } from "@/hooks/useHomeModalState";
import HomeHeader from "@/components/home/HomeHeader";
import HomeInfoButton from "@/components/home/HomeInfoButton";
import HomeSidebar from "@/components/home/HomeSidebar";
import HomeStage from "@/components/home/HomeStage";
import MobileMenu from "@/components/home/MobileMenu";
import LoginModal from "@/components/home/LoginModal";

import ChatbotWidget from "@/features/iyohouse-chatbot/components/ChatbotWidget";
import {
    getTagColor,
    noopScrollHandler,
} from "@/lib/home/pageConfig";
import { useLanguage } from "@/lib/i18n";

export default function HomePageContent() {
    const {
        sanityWorkshops,
        registrationCounts,
        calendarEvents,
        allWorkshops,
    } = useWorkshopData();

        const { user, profile, isLoading: authLoading, isProfileComplete, signOut } = useAuth();

    const { language, t, setLanguage } = useLanguage();
    const containerRef = useRef<HTMLDivElement>(null);
    const { logoRef, logoWidth, logoHeight } = useLogoMetrics();
    const { isBooting, isMounted } = useHomeBootState();
    const { currentMonth, setCurrentMonth } = useHomeCalendarMonth();
    const { dynamicColor, handleThemeChange } = useHomeTheme();
    const [isHeaderHovered, setIsHeaderHovered] = useState(false);
    const {
        closeLoginModal,
        closeMenu,
        closeSidebar,
        isLoginModalOpen,
        isMenuOpen,
        isSidebarExpanded,
        loginModalMode,
        openAccountModal,
        openLogin,
        openSignup,
        toggleSidebar,
    } = useHomeModalState();
    const {
        activePreset,
        handlePresetChange,
        handleSelectWorkshop,
        isContactOpen,
        selectedWorkshop,
        setIsContactOpen,
        visited,
    } = useHomeNavigationState({ sanityWorkshops });

    useHomeScrollReset(activePreset, selectedWorkshop);

    const { goToCompleteProfile, getCurrentNextPath } = useProfileNavigation();

    useIncompleteProfileRedirect({
        authLoading,
        getCurrentNextPath,
        isProfileComplete,
        user,
    });

    const handleScroll = noopScrollHandler;

    const { containerStyle, rootGridStyle } = useGridLayout({
        activePreset,
        logoWidth,
        logoHeight,
        dynamicColor,
    });

    return (
        <div ref={containerRef} style={containerStyle} className={`app-container preset-${activePreset} ${isBooting ? 'is-booting' : ''} ${isHeaderHovered ? 'header-hovered' : ''}`}>
            <style>{rootGridStyle}</style>

            <div 
                className="header-trigger" 
                onMouseEnter={() => setIsHeaderHovered(true)} 
            />

            <HomeSidebar
                activePreset={activePreset}
                isContactOpen={isContactOpen}
                isProfileComplete={isProfileComplete}
                isSidebarExpanded={isSidebarExpanded}
                onCloseContact={() => setIsContactOpen(false)}
                onCloseSidebar={closeSidebar}
                onGoToCompleteProfile={goToCompleteProfile}
                onOpenAccountModal={openAccountModal}
                onOpenLogin={openLogin}
                onOpenSignup={openSignup}
                onPresetChange={handlePresetChange}
                onSignOut={signOut}
                onToggleSidebar={toggleSidebar}
                t={t}
                user={user}
            />

            <HomeHeader
                activePreset={activePreset}
                language={language}
                logoRef={logoRef}
                t={t}
                user={user}
                profile={profile}
                isProfileComplete={isProfileComplete}
                onLanguageChange={setLanguage}
                onPresetChange={handlePresetChange}
                onOpenLogin={openLogin}
                onOpenAccountModal={openAccountModal}
                onGoToCompleteProfile={goToCompleteProfile}
                onMouseEnter={() => setIsHeaderHovered(true)}
                onMouseLeave={() => setIsHeaderHovered(false)}
            />

            {/* Info overlay removed in favor of expandable header-right */}

            <HomeStage
                activePreset={activePreset}
                allWorkshops={allWorkshops}
                calendarEvents={calendarEvents}
                currentMonth={currentMonth}
                getTagColor={getTagColor}
                language={language}
                onCalendarMonthChange={setCurrentMonth}
                onRequireLogin={openLogin}
                onWorkshopScroll={handleScroll}
                onSelectWorkshop={handleSelectWorkshop}
                registrationCounts={registrationCounts}
                selectedWorkshop={selectedWorkshop}
                t={t}
                visited={visited}
            />

            <HomeInfoButton className="mobile-fixed-info" t={t} />

            <MobileMenu
                isOpen={isMenuOpen}
                t={t}
                onClose={closeMenu}
                onPresetChange={handlePresetChange}
            />

            {isMounted && (
                <>
                    <LoginModal
                        isOpen={isLoginModalOpen}
                        onClose={closeLoginModal}
                        initialMode={loginModalMode}
                    />
                </>
            )}

            <ChatbotWidget />
        </div>
    );
}
