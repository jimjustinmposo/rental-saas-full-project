import React, { createContext, useContext, useState, useCallback } from "react";
import apiClient from "./apiClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [owner, setOwner] = useState(() => {
    const stored = localStorage.getItem("owner");
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem("token"));

  const login = useCallback(async (email, password) => {
    const res = await apiClient.post("/auth/login", { email, password });
    localStorage.setItem("token", res.data.token);
    localStorage.setItem("owner", JSON.stringify(res.data.owner));
    setToken(res.data.token);
    setOwner(res.data.owner);
    return res.data;
  }, []);

  const signup = useCallback(async (payload) => {
    const res = await apiClient.post("/auth/signup", payload);
    localStorage.setItem("token", res.data.token);
    localStorage.setItem("owner", JSON.stringify(res.data.owner));
    setToken(res.data.token);
    setOwner(res.data.owner);
    return res.data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("owner");
    setToken(null);
    setOwner(null);
  }, []);

  const updateCurrency = useCallback(async (currency) => {
    const res = await apiClient.put("/auth/currency", { currency });
    setOwner((prev) => {
      const updated = { ...prev, currency: res.data.currency };
      localStorage.setItem("owner", JSON.stringify(updated));
      return updated;
    });
    return res.data;
  }, []);

  return (
    <AuthContext.Provider
      value={{ owner, token, login, signup, logout, updateCurrency, isAuthenticated: !!token }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
