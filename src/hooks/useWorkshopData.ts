import { useState, useEffect, useMemo } from "react";

export function useWorkshopData() {
    const [sanityWorkshops, setSanityWorkshops] = useState<any[]>([]);
    const [registrations, setRegistrations] = useState<any[]>([]);
    const [registrationCounts, setRegistrationCounts] = useState<Record<string, number>>({});
    const [scheduleCounts, setScheduleCounts] = useState<Record<string, Record<string, number>>>({});
    const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);

                const dataResponse = await fetch('/api/workshops/data', {
                    cache: 'no-store',
                });

                if (dataResponse.ok) {
                    const workshopData = await dataResponse.json();
                    const counts = workshopData.counts || {};

                    setSanityWorkshops(workshopData.workshops || []);
                    setCalendarEvents(workshopData.events || []);
                    setRegistrationCounts(counts);
                    setScheduleCounts(workshopData.scheduleCounts || {});
                    setRegistrations(
                        Object.entries(counts).map(([workshop_id, count]) => ({
                            workshop_id,
                            count,
                            status: 'confirmed',
                        }))
                    );
                } else {
                    throw new Error('Workshop data API request failed');
                }
            } catch (error) {
                console.error("Workshop 데이터 로딩 실패:", error);
                setSanityWorkshops([]);
                setCalendarEvents([]);
                setRegistrationCounts({});
                setScheduleCounts({});
                setRegistrations([]);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const allWorkshops = useMemo(() =>
        sanityWorkshops
            .map(ws => ({ ...ws, sortNum: ws.number || 0 }))
            .sort((a, b) => b.sortNum - a.sortNum),
    [sanityWorkshops]);

    return {
        sanityWorkshops,
        registrations,
        registrationCounts,
        scheduleCounts,
        calendarEvents,
        allWorkshops,
        loading
    };
}
