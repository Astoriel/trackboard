"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface ValidationEvent {
  event: string;
  is_valid: boolean;
  errors: Array<{ property: string; error: string; type: string }>;
  payload: Record<string, unknown>;
  validated_at: string;
  source_label?: string;
}

export function useWebSocket(planId: string) {
  const [events, setEvents] = useState<ValidationEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (typeof window === "undefined") return;
    const wsUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000")
      .replace(/^http/, "ws");
    const token = localStorage.getItem("access_token");
    const url = `${wsUrl}/api/v1/ws/live/${planId}${token ? `?token=${token}` : ""}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (e) => {
      try {
        const data: ValidationEvent = JSON.parse(e.data);
        setEvents((prev) => [data, ...prev].slice(0, 200)); // keep last 200
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect after 3s
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [planId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    wsRef.current?.close();
  }, []);

  return { events, connected, disconnect };
}
