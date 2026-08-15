import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

type AuthContextValue = {
  user: Auth.User | null;
  loading: boolean;
  error: Error | null;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizedRole(role: unknown): Auth.User["role"] {
  return role === "coach" || role === "admin" ? role : "client";
}

function useAuthState(): AuthContextValue {
  const [user, setUser] = useState<Auth.User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const apiUser = await Api.getMe();
      if (!apiUser) {
        setUser(null);
        await Auth.clearUserInfo();
        return;
      }

      const verifiedUser: Auth.User = {
        id: apiUser.id,
        openId: apiUser.openId,
        name: apiUser.name,
        email: apiUser.email,
        loginMethod: apiUser.loginMethod,
        role: normalizedRole(apiUser.role),
        lastSignedIn: new Date(apiUser.lastSignedIn),
      };
      setUser(verifiedUser);
      await Auth.setUserInfo(verifiedUser);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error("Unable to verify the current session."));
      setUser(null);
      await Auth.clearUserInfo();
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await Api.logout();
    } finally {
      await Auth.removeSessionToken();
      await Auth.clearUserInfo();
      setUser(null);
      setError(null);
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return useMemo(() => ({ user, loading, error, isAuthenticated: Boolean(user), refresh, logout }), [user, loading, error, refresh, logout]);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const value = useAuthState();
  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
