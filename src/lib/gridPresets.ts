export type GridPresetName = "main" | "member" | "contact" | "workshop" | "diary";

export type GridPreset = {
    line1: string;
    line3: string;
    line4: string;
    top2: string;
};

export const gridPresets = {
    main: {
        line1: "calc(var(--stage-width) - (var(--unit) * 2))",
        line3: "calc(var(--stage-width) - var(--unit))",
        line4: "32rem",
        top2: "calc(100% - var(--line-gap))"
    },
    member: {
        line1: "calc(var(--stage-width) - (var(--unit) * 2))",
        line3: "calc(var(--stage-width) - var(--unit))",
        line4: "32rem",
        top2: "calc(var(--top-row-1) + var(--unit))"
    },
    contact: {
        line1: "0px",
        line3: "calc(var(--stage-width) - var(--unit))",
        line4: "40%",
        top2: "calc(var(--top-row-1) + var(--unit))"
    },
    workshop: {
        line1: "0px",
        line3: "calc(var(--stage-width) - var(--unit))",
        line4: "40%",
        top2: "calc(var(--top-row-1) + var(--unit))"
    },
    diary: {
        line1: "0px",
        line3: "var(--unit)",
        line4: "40%",
        top2: "calc(var(--top-row-1) + var(--unit))"
    }
} as const satisfies Record<GridPresetName, GridPreset>;

export function getGridPreset(preset: string): GridPreset {
    return gridPresets[preset as GridPresetName] || gridPresets.main;
}
