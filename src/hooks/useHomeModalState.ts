"use client";

import { useCallback, useState } from "react";

type LoginModalMode = "login" | "signup";

export function useHomeModalState() {
    const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [loginModalMode, setLoginModalMode] = useState<LoginModalMode>("login");
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const closeSidebar = useCallback(() => {
        setIsSidebarExpanded(false);
    }, []);

    const toggleSidebar = useCallback(() => {
        setIsSidebarExpanded((current) => !current);
    }, []);

    const closeLoginModal = useCallback(() => {
        setIsLoginModalOpen(false);
    }, []);

    const closeMenu = useCallback(() => {
        setIsMenuOpen(false);
    }, []);

    const openLogin = useCallback(() => {
        setLoginModalMode("login");
        setIsLoginModalOpen(true);
    }, []);

    const openSignup = useCallback(() => {
        setLoginModalMode("signup");
        setIsLoginModalOpen(true);
    }, []);

    const openAccountModal = useCallback(() => {
        setIsLoginModalOpen(true);
    }, []);

    return {
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
    };
}
