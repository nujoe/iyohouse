"use client";

import { useEffect, useRef, useState } from "react";

export function useLogoMetrics() {
    const logoRef = useRef<HTMLDivElement>(null);
    const [logoWidth, setLogoWidth] = useState("32rem");
    const [logoHeight, setLogoHeight] = useState("5.2rem");

    useEffect(() => {
        if (!logoRef.current) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.target === logoRef.current) {
                    const width = entry.borderBoxSize?.[0]?.inlineSize || entry.contentRect.width;
                    const height = entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height;
                    const nextWidth = `${width}px`;
                    const nextHeight = `${height + 20}px`;
                    setLogoWidth(prev => prev === nextWidth ? prev : nextWidth);
                    setLogoHeight(prev => prev === nextHeight ? prev : nextHeight);
                }
            }
        });

        observer.observe(logoRef.current);
        return () => observer.disconnect();
    }, []);

    return { logoRef, logoWidth, logoHeight };
}
