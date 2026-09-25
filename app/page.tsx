"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";

export default function Home() {
  const router = useRouter();
  const { isLoggedIn, isInitialized } = useAuthStore();

  useEffect(() => {
    if (!isInitialized) return;
    if (isLoggedIn) {
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
  }, [isLoggedIn, isInitialized, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <span className="h-7 w-7 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <p className="text-xs font-medium text-muted-foreground animate-pulse">
          Memuat Dynamic Drools Studio...
        </p>
      </div>
    </div>
  );
}
