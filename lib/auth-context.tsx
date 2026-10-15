"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

type AppState = "loading" | "new" | "locked" | "unlocked" | "corrupt";

interface AuthContextType {
  state: AppState;
  isAuthenticated: boolean;
  isLoading: boolean;
  usesBooksOwner: boolean;
  unlock: (key: string) => Promise<{ success: boolean; error?: string }>;
  bootstrap: (key: string, username: string) => Promise<{ success: boolean; error?: string }>;
  importDatabase: (file: File, key: string) => Promise<{ success: boolean; error?: string }>;
  lock: () => void;
  getKey: () => string | null;
  refreshStatus: () => Promise<AppState>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_KEY = "netly_encryption_key";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AppState>("loading");
  const [usesBooksOwner, setUsesBooksOwner] = useState(false);

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
      
      if (response.status === 429) {
        sessionStorage.removeItem(SESSION_KEY);
        setUsesBooksOwner(false);
        setState("locked");
        return "locked";
      }

      if (!response.ok) {
        console.error("Status API returned error:", response.status);
        sessionStorage.removeItem(SESSION_KEY);
        setUsesBooksOwner(false);
        setState("new");
        return "new";
      }
      
      const data = await response.json();
      const nextState = data.state as AppState;
      const booksOwner = Boolean(data.booksOwner);
      setUsesBooksOwner(booksOwner);

      if (booksOwner) {
        sessionStorage.removeItem(SESSION_KEY);
      }

      if (nextState !== "unlocked") {
        sessionStorage.removeItem(SESSION_KEY);
      }

      setState(nextState);
      return nextState;
    } catch (error) {
      // On network error or other failure, treat as new install
      console.error("Failed to fetch status:", error);
      sessionStorage.removeItem(SESSION_KEY);
      setUsesBooksOwner(false);
      setState("new");
      return "new";
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
    } catch {
      setState("locked");
      return { success: false, error: "Failed to verify key" };
    }
  }, []);

  const bootstrap = useCallback(async (key: string, username: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch("/api/app/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, username }),
      });
      const data = await response.json();

      if (data.success) {
        sessionStorage.setItem(SESSION_KEY, key);
        setState("unlocked");
        return { success: true };
      }

      setState("new");
      return { success: false, error: data.error || "Failed to initialize database" };
    } catch {
      setState("new");
      return { success: false, error: "Failed to initialize database" };
    }
  }, []);

  const importDatabase = useCallback(
    async (file: File, key: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("key", key);

        const response = await fetch("/api/app/import", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();

        if (data.success) {
          sessionStorage.setItem(SESSION_KEY, key);
          setState("unlocked");
          return { success: true };
        }

        return {
          success: false,
          error: data.error || "Failed to import database",
        };
      } catch {
        return {
          success: false,
          error: "Failed to import database",
        };
      }
    },
    []
  );

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
        usesBooksOwner,
        unlock,
        bootstrap,
        importDatabase,
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
