"use client";

import { Suspense } from "react";
import HomePageContent from "@/components/home/HomePageContent";

export default function Home() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <HomePageContent />
        </Suspense>
    );
}
