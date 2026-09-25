"use client";

import React from "react";
import { useAuthStore } from "@/lib/store";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

export function AppLayoutClient({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isInitialized } = useAuthStore();
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Tampilkan sidebar hanya jika sudah login dan bukan halaman login */}
      {isInitialized && isLoggedIn && !isLoginPage && <Sidebar />}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
