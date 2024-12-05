"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { authApi } from "@/lib/api";

export function useAuth() {
  const store = useAuthStore();
  const router = useRouter();

  const isAuthenticated = !!store.accessToken;

  const checkAuth = useCallback(async () => {
    if (!store.accessToken) return;
    try {
      await authApi.me();
    } catch {
      store.logout();
      router.push("/login");
    }
  }, [store, router]);

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ...store,
    isAuthenticated,
  };
}
