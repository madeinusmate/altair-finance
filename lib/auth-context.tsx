"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  unlock: (key: string) => Promise<{ success: boolean; error?: string }>;
  lock: () => void;
  getKey: () => string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_KEY = "netly_encryption_key";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if key exists in session storage on mount
    const key = sessionStorage.getItem(SESSION_KEY);
    if (key) {
      // Verify the key is still valid
      verifyKey(key).then((valid) => {
        setIsAuthenticated(valid);
        if (!valid) {
          sessionStorage.removeItem(SESSION_KEY);
        }
        setIsLoading(false);
      });
    } else {
      setIsLoading(false);
    }
  }, []);

  const verifyKey = async (key: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await response.json();
      return data.valid === true;
    } catch {
      return false;
    }
  };

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
        setIsAuthenticated(true);
        return { success: true };
      } else {
        return { success: false, error: data.error || "Invalid encryption key" };
      }
    } catch (error) {
      return { success: false, error: "Failed to verify key" };
    }
  }, []);

  const lock = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setIsAuthenticated(false);
  }, []);

  const getKey = useCallback((): string | null => {
    return sessionStorage.getItem(SESSION_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, unlock, lock, getKey }}>
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
