import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export interface GuestMessage {
    id: string;
    text: string;
    title?: string;
    created_at: string;
}

export function useGuestbookData() {
    const [guestMessages, setGuestMessages] = useState<GuestMessage[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchGuestMessages = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('guestbook')
                .select('*')
                .order('created_at', { ascending: true });
            
            if (!error && data) {
                setGuestMessages(data);
            }
        } catch (error) {
            console.error("방명록 로딩 실패:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchGuestMessages();

        // 실시간 업데이트 구독 (Realtime)
        const channel = supabase
            .channel('guestbook-realtime')
            .on('postgres_changes', 
                { event: 'INSERT', schema: 'public', table: 'guestbook' }, 
                (payload) => {
                    setGuestMessages(prev => [...prev, payload.new as GuestMessage]);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchGuestMessages]);

    return {
        guestMessages,
        loading,
        refresh: fetchGuestMessages
    };
}
