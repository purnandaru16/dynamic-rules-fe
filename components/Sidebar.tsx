"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/dashboard",     label: "Dashboard",     icon: "📊" },
  { href: "/rules",         label: "Rules",         icon: "📋" },
  { href: "/rules/builder", label: "Buat Rule",     icon: "➕" },
  { href: "/evaluate",      label: "Test Evaluasi", icon: "⚡" },
];

export function Sidebar() {
  const pathname               = usePathname();
  const router                 = useRouter();
  const { logout, isLoggedIn } = useAuthStore();
  const { theme, setTheme }    = useTheme();
  const [mounted, setMounted]  = useState(false);

  useEffect(() => setMounted(true), []);

  if (!isLoggedIn) return null;

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const isDark = theme === "dark";

  return (
    <aside className="w-56 h-screen border-r bg-muted/30 flex flex-col">

      {/* Logo */}
      <div className="px-4 py-5 border-b">
        <div className="flex items-center gap-2">
          <span className="text-xl">⚡</span>
          <div>
            <div className="text-sm font-bold leading-tight">Dynamic Rules</div>
            <div className="text-xs text-muted-foreground">Publishing Console</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/rules" && item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
                ${isActive
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 border-t flex flex-col gap-1">

        {/* Dark mode toggle */}
        {mounted && (
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <span className="flex items-center gap-3">
              <span>{isDark ? "🌙" : "☀️"}</span>
              <span>{isDark ? "Dark Mode" : "Light Mode"}</span>
            </span>
            <div className={`w-9 h-5 rounded-full transition-colors relative ${isDark ? "bg-primary" : "bg-muted-foreground/30"}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200
                ${isDark ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
          </button>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
          <span>🚪</span>
          <span>Logout</span>
        </button>
      </div>

    </aside>
  );
}