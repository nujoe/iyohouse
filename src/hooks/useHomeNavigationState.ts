"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { createLegacyWorkshop } from "@/lib/home/pageConfig";

interface UseHomeNavigationStateOptions {
    sanityWorkshops: any[];
}

export function useHomeNavigationState({ sanityWorkshops }: UseHomeNavigationStateOptions) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();

    const [activePreset, setActivePreset] = useState<string>("main");
    const [selectedWorkshop, setSelectedWorkshop] = useState<any | null>(null);
    const [isContactOpen, setIsContactOpen] = useState(false);
    const [visited, setVisited] = useState<Record<string, boolean>>({ main: true });

    useEffect(() => {
        const workshopId = searchParams.get('workshop');
        const presetId = searchParams.get('preset');

        if (workshopId) {
            const legacyId = Number(workshopId);
            const found = sanityWorkshops.find(w => (w._id || w.id)?.toString() === workshopId)
                || (Number.isInteger(legacyId) && legacyId > 0 && legacyId <= 24
                    ? createLegacyWorkshop(legacyId)
                    : null);

            if (found) {
                setSelectedWorkshop(found);
                setActivePreset('workshop');
                setVisited(v => v.workshop ? v : { ...v, workshop: true });
                return;
            }
        }

        if (presetId) {
            setActivePreset(presetId);
            setVisited(v => v[presetId] ? v : { ...v, [presetId]: true });
            setSelectedWorkshop(null);
        } else {
            setSelectedWorkshop(null);
            setActivePreset('main');
        }
    }, [searchParams, sanityWorkshops]);

    const createQueryString = useCallback((name: string, value: string | null) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set(name, value);
        else params.delete(name);
        return params.toString();
    }, [searchParams]);

    const handleSelectWorkshop = useCallback((workshop: any) => {
        const id = workshop._id || workshop.id;
        router.push(`${pathname}?${createQueryString('workshop', id.toString())}`, { scroll: false });
    }, [createQueryString, pathname, router]);

    const handlePresetChange = useCallback((preset: string) => {
        if (preset === 'contact') {
            setIsContactOpen(open => !open);
            return;
        }
        setIsContactOpen(false);
        setVisited(v => v[preset] ? v : { ...v, [preset]: true });
        const params = new URLSearchParams(createQueryString('preset', preset === 'main' ? null : preset));
        params.delete('workshop');
        router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
        setActivePreset((current) => current === preset ? current : preset);
        setSelectedWorkshop((current: any | null) => current === null ? current : null);
    }, [createQueryString, pathname, router]);

    return {
        activePreset,
        handlePresetChange,
        handleSelectWorkshop,
        isContactOpen,
        selectedWorkshop,
        setIsContactOpen,
        visited,
    };
}
