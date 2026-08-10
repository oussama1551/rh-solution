import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { Permission, User } from "./types";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: Permission) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: User }>("/api/auth/me", { method: "POST" })
      .then(result => setUser(result.user))
      .catch(async () => {
        setUser(null);
        await api("/api/auth/clear-session", { method: "POST" }).catch(() => null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async login(username, password) {
      const result = await api<{ user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      setUser(result.user);
    },
    async logout() {
      await api("/api/auth/logout", { method: "POST" }).catch(() => null);
      setUser(null);
    },
    can(permission) {
      return Boolean(user?.permissions.includes(permission));
    }
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth doit être utilisé dans AuthProvider.");
  }
  return context;
}

export function PermissionGate({ permission, children }: PropsWithChildren<{ permission: Permission }>) {
  const { can } = useAuth();
  return can(permission) ? <>{children}</> : null;
}
