import { useMemo, type CSSProperties } from "react";
import { getGridPreset } from "@/lib/gridPresets";

type UseGridLayoutArgs = {
    activePreset: string;
    gridPreset: string;
    logoWidth: string;
    logoHeight: string;
    dynamicColor: string;
};

export function useGridLayout({
    activePreset,
    gridPreset,
    logoWidth,
    logoHeight,
    dynamicColor,
}: UseGridLayoutArgs) {
    return useMemo(() => {
        const currentPreset = getGridPreset(activePreset);
        const currentGridPreset = gridPreset === "main"
            ? {
                line1: "0px",
                line3: "calc(var(--stage-width) - var(--line-gap))",
                top2: "calc(100% - var(--line-gap))",
            }
            : getGridPreset(gridPreset);
        const intersectColor = dynamicColor;
        const lineX4 = activePreset === 'main' ? logoWidth : currentPreset.line4;

        const containerStyle = {
            "--line-x-1": currentPreset.line1,
            "--line-x-3": currentPreset.line3,
            "--line-x-4": lineX4,
            "--grid-line-x-1": currentGridPreset.line1,
            "--grid-line-x-2": "calc(50% - var(--line-gap) / 2)",
            "--grid-line-x-3": currentGridPreset.line3,
            "--grid-line-x-center": "calc(50% - var(--line-gap) / 2)",
            "--grid-top-row-2": currentGridPreset.top2,
            "--top-row-1-actual": logoHeight,
            "--top-row-2": currentPreset.top2,
            "--line-x-center": "calc(50% - var(--line-gap) / 2)",
            "--intersect": intersectColor,
        } as CSSProperties;

        const rootGridStyle = `:root { --line-x-1: ${currentPreset.line1}; --line-x-3: ${currentPreset.line3}; --line-x-4: ${lineX4}; --line-x-center: calc(50% - var(--line-gap) / 2); --grid-line-x-1: ${currentGridPreset.line1}; --grid-line-x-2: calc(50% - var(--line-gap) / 2); --grid-line-x-3: ${currentGridPreset.line3}; --grid-line-x-center: calc(50% - var(--line-gap) / 2); --grid-top-row-2: ${currentGridPreset.top2}; --top-row-1-actual: ${logoHeight}; --top-row-2: ${currentPreset.top2}; --intersect: ${intersectColor}; --accent-fixed: ${dynamicColor}; --scroll-hue: 220; }`;

        return {
            currentPreset,
            intersectColor,
            containerStyle,
            rootGridStyle,
        };
    }, [activePreset, dynamicColor, gridPreset, logoHeight, logoWidth]);
}
