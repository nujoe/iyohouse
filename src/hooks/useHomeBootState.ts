"use client";

import { useEffect, useState } from "react";

export function useHomeBootState() {
    const [isBooting, setIsBooting] = useState(true);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);

        const raf = requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setIsBooting(false);
            });
        });

        return () => {
            cancelAnimationFrame(raf);
        };
    }, []);

    return { isBooting, isMounted };
}
