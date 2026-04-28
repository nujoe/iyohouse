import { useState, useEffect } from "react";
import { client } from "@/sanity/client";
import { supabase } from "@/lib/supabase";

export function useWorkshopData() {
    const [sanityWorkshops, setSanityWorkshops] = useState<any[]>([]);
    const [registrations, setRegistrations] = useState<any[]>([]);
    const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                // 1. Sanity 워크숍 데이터 (최신 번호순) + 이미지 메타데이터
                const wsQuery = `*[_type == "workshop"] | order(number desc) {
                    ...,
                    "posterMeta": poster.asset->metadata.dimensions
                }`;
                const wsData = await client.fetch(wsQuery);
                setSanityWorkshops(wsData);

                // 2. Sanity 달력 이벤트 데이터 (날짜순)
                const evQuery = `*[_type == "event"] | order(date asc)`;
                const evData = await client.fetch(evQuery);
                setCalendarEvents(evData);

                // 3. Supabase 결제 완료 신청자 목록
                const { data: regData, error: regError } = await supabase
                    .from('workshop_registrations')
                    .select('*')
                    .eq('payment_status', 'completed');
                
                if (!regError && regData) {
                    setRegistrations(regData);
                }
            } catch (error) {
                console.error("Workshop 데이터 로딩 실패:", error);
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
            .map(id => ({ id, isSanity: false, sortNum: id }))
    ].sort((a, b) => b.sortNum - a.sortNum);

    return {
        sanityWorkshops,
        registrations,
        calendarEvents,
        allWorkshops,
        loading
    };
}
