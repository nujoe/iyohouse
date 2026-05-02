import { useState, useEffect } from "react";

export function useWorkshopData() {
    const [sanityWorkshops, setSanityWorkshops] = useState<any[]>([]);
    const [registrations, setRegistrations] = useState<any[]>([]);
    const [registrationCounts, setRegistrationCounts] = useState<Record<string, number>>({});
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
                setRegistrations([]);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    // Sanity 데이터와 하드코딩 데이터를 통합하여 최신순으로 정렬된 리스트 반환
    const allWorkshops = [
        ...sanityWorkshops.map(ws => ({ ...ws, isSanity: true, sortNum: ws.number || 0 })),
        ...Array.from({ length: 24 }, (_, i) => 24 - i)
            .filter(id => !sanityWorkshops.find(sws => sws.number === id))
            .map(id => ({
                id,
                isSanity: false,
                sortNum: id,
                supabase_workshop_id: null,
            }))
    ].sort((a, b) => b.sortNum - a.sortNum);

    return {
        sanityWorkshops,
        registrations,
        registrationCounts,
        calendarEvents,
        allWorkshops,
        loading
    };
}
