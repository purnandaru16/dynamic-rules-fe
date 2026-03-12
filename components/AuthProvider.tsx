"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/store";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setToken } = useAuthStore();

  useEffect(() => {
    // Baca localStorage hanya di client side setelah mount
    const token = localStorage.getItem("access_token");
    if (token) {
      setToken(token);
    }
  }, []);

  return <>{children}</>;
}