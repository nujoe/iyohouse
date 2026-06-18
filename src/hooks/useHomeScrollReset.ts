"use client";

import { useEffect } from "react";

export function resetHomeScrollPosition() {
    if (typeof window === "undefined") return;

    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    const scrollContainers = document.querySelectorAll<HTMLElement>([
        ".scroll-container",
        ".cell-main",
        ".cell-member",
        ".cell-workshop",
        ".cell-diary",
        ".cell-content",
        ".workshop-wrapper",
        ".diary-wrapper",
        ".calendar-container",
        ".main-content-layout",
        ".member-main-content",
        ".workshop-detail-container",
        ".detail-right",
    ].join(", "));

    scrollContainers.forEach((container) => {
        container.scrollTop = 0;
        container.scrollLeft = 0;
    });
}

export function useHomeScrollReset(activePreset: string, selectedWorkshop: any | null) {
    useEffect(() => {
        resetHomeScrollPosition();

        const frame = window.requestAnimationFrame(() => {
            resetHomeScrollPosition();
        });

        return () => window.cancelAnimationFrame(frame);
    }, [activePreset, selectedWorkshop]);
}
