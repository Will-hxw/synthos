import type { SystemStats } from "@/types/system";

import { useEffect, useState } from "react";

import { getLatestSystemStats } from "@/api/systemApi";

export function useSystemStats(enabled: boolean) {
    const [stats, setStats] = useState<SystemStats | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        let canceled = false;

        setLoading(true);
        getLatestSystemStats()
            .then(response => {
                if (canceled) {
                    return;
                }

                if (response.success) {
                    setStats(response.data);
                }
            })
            .catch(() => {
                if (!canceled) {
                    setStats(null);
                }
            })
            .finally(() => {
                if (!canceled) {
                    setLoading(false);
                }
            });

        return () => {
            canceled = true;
        };
    }, [enabled]);

    return { stats, loading };
}
