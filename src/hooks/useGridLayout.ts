import { useMemo, type CSSProperties } from "react";
import { getGridPreset } from "@/lib/gridPresets";

type UseGridLayoutArgs = {
    activePreset: string;
    logoWidth: string;
    logoHeight: string;
    isSidebarExpanded: boolean;
    isContactOpen: boolean;
    dynamicColor: string;
};

export function useGridLayout({
    activePreset,
    logoWidth,
    logoHeight,
    isSidebarExpanded,
    isContactOpen,
    dynamicColor,
}: UseGridLayoutArgs) {
    return useMemo(() => {
        const currentPreset = getGridPreset(activePreset);
        const intersectColor = dynamicColor;
        const lineX4 = activePreset === 'main' ? logoWidth : currentPreset.line4;
        const sidebarWidth = isSidebarExpanded || isContactOpen ? "60%" : "var(--panel-width)";

        const containerStyle = {
            "--line-x-1": currentPreset.line1,
            "--line-x-3": currentPreset.line3,
            "--line-x-4": lineX4,
            "--sidebar-width": sidebarWidth,
            "--top-row-1": logoHeight,
            "--top-row-2": currentPreset.top2,
            "--line-x-center": "50%",
            "--intersect": intersectColor,
        } as CSSProperties;

        const rootGridStyle = `:root { --line-x-1: ${currentPreset.line1}; --line-x-3: ${currentPreset.line3}; --line-x-4: ${lineX4}; --line-x-center: calc((100% - var(--sidebar-width)) / 2 + var(--sidebar-width)); --top-row-1: ${logoHeight}; --top-row-2: ${currentPreset.top2}; --intersect: ${intersectColor}; --accent-fixed: ${dynamicColor}; --scroll-hue: 220; }`;

        return {
            currentPreset,
            intersectColor,
            containerStyle,
            rootGridStyle,
        };
    }, [activePreset, dynamicColor, isContactOpen, isSidebarExpanded, logoHeight, logoWidth]);
}
