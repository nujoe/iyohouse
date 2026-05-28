"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface UseIncompleteProfileRedirectOptions {
    authLoading: boolean;
    getCurrentNextPath: () => string;
    isProfileComplete: boolean;
    user: any;
}

export function useIncompleteProfileRedirect({
    authLoading,
    getCurrentNextPath,
    isProfileComplete,
    user,
}: UseIncompleteProfileRedirectOptions) {
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && user && !isProfileComplete) {
            const currentPath = getCurrentNextPath();
            const nextPath = currentPath.startsWith('/complete-profile') ? '/' : currentPath;
            router.replace(`/complete-profile?next=${encodeURIComponent(nextPath)}`);
        }
    }, [authLoading, getCurrentNextPath, isProfileComplete, router, user]);
}
