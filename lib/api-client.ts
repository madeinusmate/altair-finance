import { readSessionKey } from "@/lib/session-key";

const getAuthHeaders = (): HeadersInit => {
  const key = readSessionKey();
  return {
    "Content-Type": "application/json",
    ...(key ? { "X-Encryption-Key": key } : {}),
  };
};

export const apiClient = {
  get: async <T>(url: string): Promise<T> => {
    const response = await fetch(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Request failed");
    }
    return response.json();
  },

  post: async <T>(url: string, data: unknown): Promise<T> => {
    const response = await fetch(url, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Request failed");
    }
    return response.json();
  },

  patch: async <T>(url: string, data: unknown): Promise<T> => {
    const response = await fetch(url, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Request failed");
    }
    return response.json();
  },

  put: async <T>(url: string, data: unknown): Promise<T> => {
    const response = await fetch(url, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Request failed");
    }
    return response.json();
  },

  delete: async <T>(url: string): Promise<T> => {
    const response = await fetch(url, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Request failed");
    }
    return response.json();
  },
};
