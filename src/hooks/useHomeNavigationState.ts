"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { resetHomeScrollPosition } from "@/hooks/useHomeScrollReset";

interface UseHomeNavigationStateOptions {
    sanityWorkshops: any[];
}

type GridTransitionPhase = "idle" | "pull" | "return" | "reveal";

const GRID_PULL_MS = 440;
const GRID_RETURN_MS = 660;
const GRID_REVEAL_MS = 40;

export function useHomeNavigationState({ sanityWorkshops }: UseHomeNavigationStateOptions) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const searchParamString = searchParams.toString();
    const pathname = usePathname();

    const [activePreset, setActivePreset] = useState<string>("main");
    const [selectedWorkshop, setSelectedWorkshop] = useState<any | null>(null);
    const [isContactOpen, setIsContactOpen] = useState(false);
    const [visited, setVisited] = useState<Record<string, boolean>>({ main: true });
    const [gridTransitionPreset, setGridTransitionPreset] = useState<string>("main");
    const [gridTransitionPhase, setGridTransitionPhase] = useState<GridTransitionPhase>("idle");
    const transitionTimersRef = useRef<number[]>([]);

    const clearTransitionTimers = useCallback(() => {
        transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
        transitionTimersRef.current = [];
    }, []);

    const revealPreset = useCallback((preset: string, workshop: any | null = null) => {
        setActivePreset((current) => current === preset ? current : preset);
        setSelectedWorkshop(workshop);
        setVisited(v => v[preset] ? v : { ...v, [preset]: true });
    }, []);

    const transitionToPreset = useCallback((preset: string, workshop: any | null = null, onComplete?: () => void) => {
        clearTransitionTimers();
        setGridTransitionPreset(preset);
        setGridTransitionPhase("pull");

        const returnTimer = window.setTimeout(() => {
            revealPreset(preset, workshop);
            setGridTransitionPhase("return");
        }, GRID_PULL_MS);

        const idleTimer = window.setTimeout(() => {
            setGridTransitionPreset(preset);
            setGridTransitionPhase("idle");
            onComplete?.();
        }, GRID_PULL_MS + GRID_RETURN_MS + GRID_REVEAL_MS);

        transitionTimersRef.current = [returnTimer, idleTimer];
    }, [clearTransitionTimers, revealPreset]);

    useEffect(() => clearTransitionTimers, [clearTransitionTimers]);

    useEffect(() => {
        const currentParams = new URLSearchParams(searchParamString);
        const workshopId = currentParams.get('workshop');
        const presetId = currentParams.get('preset');

        if (workshopId) {
            const found = sanityWorkshops.find(w => (w._id || w.id)?.toString() === workshopId) || null;

            if (found) {
                revealPreset('workshop', found);
                clearTransitionTimers();
                setGridTransitionPreset('workshop');
                setGridTransitionPhase("idle");
                return;
            }
        }

        if (presetId) {
            revealPreset(presetId, null);
            clearTransitionTimers();
            setGridTransitionPreset(presetId);
            setGridTransitionPhase("idle");
        } else {
            revealPreset('main', null);
            clearTransitionTimers();
            setGridTransitionPreset('main');
            setGridTransitionPhase("idle");
        }
    }, [clearTransitionTimers, revealPreset, sanityWorkshops, searchParamString]);

    const createQueryString = useCallback((name: string, value: string | null) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set(name, value);
        else params.delete(name);
        return params.toString();
    }, [searchParams]);

    const handleSelectWorkshop = useCallback((workshop: any) => {
        const id = workshop._id || workshop.id;
        resetHomeScrollPosition();
        router.push(`${pathname}?${createQueryString('workshop', id.toString())}`, { scroll: false });
    }, [createQueryString, pathname, router]);

    const handlePresetChange = useCallback((preset: string) => {
        if (preset === 'contact') {
            setIsContactOpen(open => !open);
            return;
        }
        setIsContactOpen(false);
        resetHomeScrollPosition();
        setVisited(v => v[preset] ? v : { ...v, [preset]: true });
        const params = new URLSearchParams(createQueryString('preset', preset === 'main' ? null : preset));
        params.delete('workshop');
        const nextPath = `${pathname}${params.toString() ? `?${params.toString()}` : ''}`;
        transitionToPreset(preset, null, () => {
            resetHomeScrollPosition();
            router.push(nextPath, { scroll: false });
        });
    }, [createQueryString, pathname, router, transitionToPreset]);

    return {
        activePreset,
        gridTransitionPhase,
        gridTransitionPreset,
        handlePresetChange,
        handleSelectWorkshop,
        isContactOpen,
        selectedWorkshop,
        setIsContactOpen,
        visited,
    };
}
