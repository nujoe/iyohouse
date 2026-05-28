"use client";

import { useCallback, useState } from "react";

import { THEME_COLORS } from "@/lib/home/pageConfig";

export function useHomeTheme() {
    const [dynamicColor, setDynamicColor] = useState("#f8f01dff");

    const handleThemeChange = useCallback(() => {
        setDynamicColor(currentColor => {
            const currentIndex = THEME_COLORS.indexOf(currentColor);
            const nextIndex = (currentIndex + 1) % THEME_COLORS.length;
            return THEME_COLORS[nextIndex];
        });
    }, []);

    return { dynamicColor, handleThemeChange };
}
