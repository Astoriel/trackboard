"use client";

import { useState, useEffect, useCallback } from "react";
import { plansApi, eventsApi, propertiesApi } from "@/lib/api";
import { toast } from "@/store/toast";

export interface PlanEvent {
  id: string;
  event_name: string;
  description?: string;
  category?: string;
  status: string;
  sort_order: number;
  properties: PlanProperty[];
}

export interface PlanProperty {
  id: string;
  name: string;
  type: string;
  required: boolean;
  description?: string;
  constraints: Record<string, unknown>;
  examples: unknown[];
}

export interface TrackingPlan {
  id: string;
  name: string;
  description?: string;
  status: string;
  current_version: number;
  branch_name?: string;
  is_main: boolean;
  events: PlanEvent[];
}

export function useTrackingPlan(planId: string) {
  const [plan, setPlan] = useState<TrackingPlan | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    try {
      const { data } = await plansApi.get(planId);
      setPlan(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error("Failed to load plan", msg);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => { fetch(); }, [fetch]);

  const addEvent = useCallback(
    async (data: { event_name: string; category?: string; description?: string }) => {
      try {
        await eventsApi.create(planId, data);
        await fetch();
        toast.success("Event added");
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        toast.error("Failed to add event", msg);
        throw err;
      }
    },
    [planId, fetch]
  );

  const updateEvent = useCallback(
    async (eventId: string, data: object) => {
      try {
        await eventsApi.update(eventId, data);
        await fetch();
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        toast.error("Failed to update event", msg);
        throw err;
      }
    },
    [fetch]
  );

  const deleteEvent = useCallback(
    async (eventId: string) => {
      try {
        await eventsApi.delete(eventId);
        await fetch();
        toast.success("Event deleted");
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        toast.error("Failed to delete event", msg);
        throw err;
      }
    },
    [fetch]
  );

  const addProperty = useCallback(
    async (eventId: string, data: object) => {
      try {
        await propertiesApi.create(eventId, data);
        await fetch();
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        toast.error("Failed to add property", msg);
        throw err;
      }
    },
    [fetch]
  );

  const updateProperty = useCallback(
    async (propertyId: string, data: object) => {
      try {
        await propertiesApi.update(propertyId, data);
        await fetch();
      } catch {
        toast.error("Failed to update property");
        throw new Error("update failed");
      }
    },
    [fetch]
  );

  const deleteProperty = useCallback(
    async (propertyId: string) => {
      try {
        await propertiesApi.delete(propertyId);
        await fetch();
      } catch {
        toast.error("Failed to delete property");
        throw new Error("delete failed");
      }
    },
    [fetch]
  );

  return {
    plan,
    events: plan?.events ?? [],
    loading,
    refresh: fetch,
    addEvent,
    updateEvent,
    deleteEvent,
    addProperty,
    updateProperty,
    deleteProperty,
  };
}
