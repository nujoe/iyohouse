import { memo } from "react";
import {
    GRID_HORIZONTAL_LINES,
    GRID_INTERSECTIONS,
    GRID_VERTICAL_LINES,
} from "@/lib/gridIntersections";

function GridLines() {
    return (
        <>
            {GRID_HORIZONTAL_LINES.map((line) => (
                <div key={line.id} className={`h-line ${line.className}`}></div>
            ))}

            {GRID_VERTICAL_LINES.map((line) => (
                <div
                    key={line.id}
                    className={`v-line ${line.className ?? ""}`}
                    style={{ left: line.left }}
                ></div>
            ))}

            {GRID_INTERSECTIONS.map((intersection) => (
                <div
                    key={intersection.id}
                    className={intersection.className}
                    style={{
                        left: intersection.left,
                        top: intersection.top,
                    }}
                ></div>
            ))}
        </>
    );
}

export default memo(GridLines);
