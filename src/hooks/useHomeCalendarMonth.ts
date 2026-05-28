"use client";

import { useEffect, useState } from "react";

import { getClientCurrentMonth, HYDRATION_SAFE_CALENDAR_MONTH } from "@/lib/home/pageConfig";

export function useHomeCalendarMonth() {
    const [currentMonth, setCurrentMonth] = useState(HYDRATION_SAFE_CALENDAR_MONTH);

    useEffect(() => {
        setCurrentMonth(getClientCurrentMonth());
    }, []);

    return { currentMonth, setCurrentMonth };
}
