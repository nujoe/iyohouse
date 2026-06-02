import { useMemo, type CSSProperties } from "react";
import { getGridPreset } from "@/lib/gridPresets";

type UseGridLayoutArgs = {
    activePreset: string;
    logoWidth: string;
    logoHeight: string;
    dynamicColor: string;
};

export function useGridLayout({
    activePreset,
    logoWidth,
    logoHeight,
    dynamicColor,
}: UseGridLayoutArgs) {
    return useMemo(() => {
        const currentPreset = getGridPreset(activePreset);
        const intersectColor = dynamicColor;
        const lineX4 = activePreset === 'main' ? logoWidth : currentPreset.line4;

        const containerStyle = {
            "--line-x-1": currentPreset.line1,
            "--line-x-3": currentPreset.line3,
            "--line-x-4": lineX4,
            "--top-row-1": logoHeight,
            "--top-row-2": currentPreset.top2,
            "--line-x-center": "50%",
            "--intersect": intersectColor,
        } as CSSProperties;

        const rootGridStyle = `:root { --line-x-1: ${currentPreset.line1}; --line-x-3: ${currentPreset.line3}; --line-x-4: ${lineX4}; --line-x-center: 50%; --top-row-1: ${logoHeight}; --top-row-2: ${currentPreset.top2}; --intersect: ${intersectColor}; --accent-fixed: ${dynamicColor}; --scroll-hue: 220; }`;

        return {
            currentPreset,
            intersectColor,
            containerStyle,
            rootGridStyle,
        };
    }, [activePreset, dynamicColor, logoHeight, logoWidth]);
}
