"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isLanguage, LANGUAGE_STORAGE_KEY, TEXT, type Language, type Translation } from "./translations";

type LanguageContextValue = {
    language: Language;
    t: Translation;
    setLanguage: (nextLanguage: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>("ko");

    useEffect(() => {
        try {
            const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
            if (isLanguage(savedLanguage)) {
                setLanguageState(savedLanguage);
            }
        } catch {
            // Keep the default language when browser storage is unavailable.
        }
    }, []);

    useEffect(() => {
        document.documentElement.lang = language;
    }, [language]);

    const setLanguage = useCallback((nextLanguage: Language) => {
        setLanguageState(nextLanguage);
        try {
            window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
        } catch {
            // Language still changes in memory if browser storage is unavailable.
        }
    }, []);

    const value = useMemo(
        () => ({
            language,
            t: TEXT[language],
            setLanguage,
        }),
        [language, setLanguage]
    );

    return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error("useLanguage must be used within LanguageProvider");
    }
    return context;
}
