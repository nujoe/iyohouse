"use client";

import { useEffect } from "react";

export function useHomeScrollReset(activePreset: string, selectedWorkshop: any | null) {
    useEffect(() => {
        const scrollContainers = document.querySelectorAll('.scroll-container');
        scrollContainers.forEach(container => {
            container.scrollTop = 0;
        });
    }, [activePreset, selectedWorkshop]);
}
