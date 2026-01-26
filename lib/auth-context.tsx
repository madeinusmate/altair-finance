"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

type AppState = "loading" | "new" | "locked" | "unlocked" | "corrupt";

interface AuthContextType {
  state: AppState;
  isAuthenticated: boolean;
  isLoading: boolean;
  unlock: (key: string) => Promise<{ success: boolean; error?: string }>;
  bootstrap: (key: string) => Promise<{ success: boolean; error?: string }>;
  lock: () => void;
  getKey: () => string | null;
  refreshStatus: () => Promise<AppState>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_KEY = "netly_encryption_key";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AppState>("loading");

  const getSessionKey = useCallback((): string | null => {
    return sessionStorage.getItem(SESSION_KEY);
  }, []);

  const refreshStatus = useCallback(async (): Promise<AppState> => {
    try {
      const key = getSessionKey();
      const response = await fetch("/api/app/status", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { "X-Encryption-Key": key } : {}),
        },
      });
      const data = await response.json();
      const nextState = data.state as AppState;

      if (nextState !== "unlocked") {
        sessionStorage.removeItem(SESSION_KEY);
      }

      setState(nextState);
      return nextState;
    } catch {
      setState("locked");
      return "locked";
    }
  }, [getSessionKey]);

  useEffect(() => {
    const initializeStatus = async () => {
      await refreshStatus();
    };
    void initializeStatus();
  }, [refreshStatus]);

  const unlock = useCallback(async (key: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await response.json();

      if (data.valid) {
        sessionStorage.setItem(SESSION_KEY, key);
        setState("unlocked");
        return { success: true };
      }

      setState("locked");
      return { success: false, error: data.error || "Invalid encryption key" };
    } catch (error) {
      setState("locked");
      return { success: false, error: "Failed to verify key" };
    }
  }, []);

  const bootstrap = useCallback(async (key: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch("/api/app/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await response.json();

      if (data.success) {
        sessionStorage.setItem(SESSION_KEY, key);
        setState("unlocked");
        return { success: true };
      }

      setState("new");
      return { success: false, error: data.error || "Failed to initialize database" };
    } catch (error) {
      setState("new");
      return { success: false, error: "Failed to initialize database" };
    }
  }, []);

  const lock = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setState("locked");
  }, []);

  const getKey = useCallback((): string | null => {
    return sessionStorage.getItem(SESSION_KEY);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        state,
        isAuthenticated: state === "unlocked",
        isLoading: state === "loading",
        unlock,
        bootstrap,
        lock,
        getKey,
        refreshStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
