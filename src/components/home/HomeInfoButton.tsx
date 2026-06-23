"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Translation } from "@/lib/i18n";

interface HomeInfoButtonProps {
    className?: string;
    label?: string;
    t: Translation;
}

export default function HomeInfoButton({ className = "", label = "info", t }: HomeInfoButtonProps) {
    const [isPinned, setIsPinned] = useState(false);

    useEffect(() => {
        if (!isPinned) return;
        const handleOutsideClick = () => {
            setIsPinned(false);
        };
        window.addEventListener("click", handleOutsideClick);
        return () => {
            window.removeEventListener("click", handleOutsideClick);
        };
    }, [isPinned]);

    return (
        <div
            className={`info-bottom-text-wrapper ${className} ${isPinned ? "is-pinned" : ""}`}
            onClick={(e) => {
                e.stopPropagation();
                setIsPinned((prev) => !prev);
            }}
        >
            <div className="info-bottom-text">{label}</div>
            <div className="business-info-overlay" onClick={(e) => e.stopPropagation()}>
                <strong>{t.footer.company}</strong><br />
                PRIVACY POLICY : <Link href="/privacy">개인정보처리방침</Link><br />
                {t.footer.address}<br />
                {t.footer.businessLicense}<br />
                {t.footer.mallOrderLicense}<br />
                {t.footer.email}<br />
                WEBSITE : <a href="https://www.instagram.com/djwns1234/" target="_blank" rel="noopener noreferrer">@djwns1234</a>
            </div>
        </div>
    );
}
