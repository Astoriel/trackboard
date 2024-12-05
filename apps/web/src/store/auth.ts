import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: { id: string; name: string; email: string } | null;
  orgId: string | null;
  orgName: string | null;
  role: string | null;
  setTokens: (access: string, refresh: string) => void;
  setUser: (user: AuthState["user"], orgId: string, orgName: string, role: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      orgId: null,
      orgName: null,
      role: null,
      setTokens: (access, refresh) => {
        set({ accessToken: access, refreshToken: refresh });
        if (typeof window !== "undefined") {
          localStorage.setItem("access_token", access);
          localStorage.setItem("refresh_token", refresh);
        }
      },
      setUser: (user, orgId, orgName, role) => set({ user, orgId, orgName, role }),
      logout: () => {
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          orgId: null,
          orgName: null,
          role: null,
        });
        if (typeof window !== "undefined") {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          window.location.href = "/login";
        }
      },
    }),
    { name: "trackboard-auth" }
  )
);
