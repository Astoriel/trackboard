"use client";

import { useState, useEffect, useCallback } from "react";
import { validationApi } from "@/lib/api";
import { toast } from "@/store/toast";

export interface ValidationStats {
  total_events: number;
  valid_count: number;
  invalid_count: number;
  compliance_rate: number;
  top_failing_events: Array<{ event_name: string; count: number }>;
  top_failing_properties: Array<{ property: string; count: number }>;
}

export type StatsPeriod = "24h" | "7d" | "30d";

export function useValidation(planId: string, period: StatsPeriod = "24h") {
  const [stats, setStats] = useState<ValidationStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    try {
      const { data } = await validationApi.stats(planId, period);
      setStats(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error("Failed to load validation stats", msg);
    } finally {
      setLoading(false);
    }
  }, [planId, period]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  return { stats, loading, refresh: fetchStats };
}
