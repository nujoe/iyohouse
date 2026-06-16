export type GridVerticalLine = {
    className?: string;
    id: string;
    left: string;
};

export type GridHorizontalLine = {
    className: string;
    id: string;
    top: string;
};

export type GridIntersection = {
    className: string;
    id: string;
    left: string;
    top: string;
};

export const GRID_HORIZONTAL_LINES: GridHorizontalLine[] = [
    {
        id: "top",
        className: "grid-row-1",
        top: "var(--top-row-1)",
    },
    {
        id: "bottom",
        className: "grid-row-2",
        top: "var(--grid-top-row-2)",
    },
];

export const GRID_VERTICAL_LINES: GridVerticalLine[] = [
    {
        id: "left",
        left: "var(--grid-line-x-1)",
    },
    {
        id: "right",
        left: "var(--grid-line-x-3)",
    },
    {
        id: "center",
        className: "v-line-center",
        left: "var(--grid-line-x-center)",
    },
];

export function createGridIntersections(
    verticalLines: GridVerticalLine[],
    horizontalLines: GridHorizontalLine[],
): GridIntersection[] {
    return verticalLines.flatMap((verticalLine) =>
        horizontalLines.map((horizontalLine) => ({
            id: `${verticalLine.id}-${horizontalLine.id}`,
            className: [
                "grid-intersection-marker",
                `grid-intersection-marker-${verticalLine.id}`,
                `grid-intersection-marker-${horizontalLine.id}`,
            ].join(" "),
            left: verticalLine.left,
            top: horizontalLine.top,
        })),
    );
}

export const GRID_INTERSECTIONS = createGridIntersections(
    GRID_VERTICAL_LINES,
    GRID_HORIZONTAL_LINES,
);
