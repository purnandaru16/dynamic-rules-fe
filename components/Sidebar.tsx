"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Layers,
  Workflow,
  Zap,
  Moon,
  Sun,
  LogOut,
  ChevronRight,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    description: "Overview & metrics",
    icon: LayoutDashboard,
  },
  {
    href: "/rules",
    label: "Procedures & Rules",
    description: "Rule catalogue & actions",
    icon: Layers,
  },
  {
    href: "/rules/builder",
    label: "Flow Builder",
    description: "Visual logic designer",
    icon: Workflow,
    highlight: true,
  },
  {
    href: "/evaluate",
    label: "Test Runner",
    description: "Fact evaluation simulator",
    icon: Zap,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, isLoggedIn } = useAuthStore();
  const { resolvedTheme, setTheme } = useTheme();

  const [isCollapsed, setIsCollapsed] = useState(false);

  // Restore collapsed state from localStorage & register shortcut
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sidebar_collapsed");
      if (saved === "true") {
        setIsCollapsed(true);
      }
    } catch {
      // ignore
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setIsCollapsed((prev) => {
          const next = !prev;
          try {
            localStorage.setItem("sidebar_collapsed", String(next));
          } catch {
            // ignore
          }
          return next;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar_collapsed", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  if (!isLoggedIn) return null;

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const isDark = resolvedTheme === "dark";

  return (
    <aside
      className={`h-screen border-r border-border/80 bg-sidebar flex flex-col shrink-0 select-none z-30 transition-[width] duration-300 ease-in-out overflow-x-hidden ${
        isCollapsed ? "w-[72px]" : "w-64"
      }`}
    >
      {/* Brand Header */}
      <div
        className={`border-b border-border/70 transition-all ${
          isCollapsed
            ? "py-3.5 px-2 flex flex-col items-center gap-2"
            : "px-4 py-3.5 flex items-center justify-between"
        }`}
      >
        <div className={`flex items-center gap-3 min-w-0 ${isCollapsed ? "justify-center" : ""}`}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
            <Workflow className="w-5 h-5" />
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-foreground truncate">
                  Dynamic Rules
                </span>
                <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  v2.0
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                Publishing Console
              </p>
            </div>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggleCollapse}
          className={`h-8 w-8 p-0 text-muted-foreground hover:text-foreground rounded-lg shrink-0 transition-colors ${
            isCollapsed ? "h-7 w-7 mt-0.5" : ""
          }`}
          title={isCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Workspace / Service Status Card */}
      <div className={`pt-3 transition-all ${isCollapsed ? "px-2 flex justify-center" : "px-3"}`}>
        {isCollapsed ? (
          <div
            className="w-10 h-10 rounded-xl bg-muted/40 border border-border/60 flex items-center justify-center relative cursor-help"
            title="Drools Engine • ONLINE"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
        ) : (
          <div className="px-3 py-2 rounded-xl bg-muted/40 border border-border/60 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-medium text-foreground truncate">
                Drools Engine
              </span>
            </div>
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
              ONLINE
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-4 flex flex-col gap-1 overflow-y-auto overflow-x-hidden">
        {!isCollapsed && (
          <div className="px-3 pb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Workspace Navigation
          </div>
        )}

        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/rules" &&
              item.href !== "/dashboard" &&
              pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? `${item.label} — ${item.description}` : undefined}
              className={`group flex items-center rounded-xl text-xs font-medium transition-all relative ${
                isCollapsed
                  ? "w-10 h-10 mx-auto justify-center"
                  : "gap-3 px-3 py-2.5"
              } ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/70"
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                  isActive
                    ? "text-primary-foreground"
                    : "text-muted-foreground group-hover:text-foreground"
                }`}
              />
              {!isCollapsed && (
                <>
                  <div className="flex-1 truncate">
                    <div className="leading-tight">{item.label}</div>
                    <div
                      className={`text-[10px] truncate ${
                        isActive
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground/80"
                      }`}
                    >
                      {item.description}
                    </div>
                  </div>
                  {item.highlight && !isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  )}
                  {isActive && (
                    <ChevronRight className="w-3.5 h-3.5 text-primary-foreground/70" />
                  )}
                </>
              )}
              {isCollapsed && item.highlight && !isActive && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-sidebar" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Session Footer */}
      <div
        className={`p-2.5 border-t border-border/80 flex flex-col gap-1.5 bg-sidebar/50 ${
          isCollapsed ? "items-center" : ""
        }`}
      >
        {/* Auth status */}
        {isCollapsed ? (
          <div
            className="w-10 h-8 rounded-lg bg-muted/30 border border-border/40 flex items-center justify-center text-blue-500 cursor-help"
            title="OAuth2 Client Auth • Authenticated"
          >
            <ShieldCheck className="w-4 h-4" />
          </div>
        ) : (
          <div className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border/40 flex items-center gap-2 mb-1">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <div className="truncate text-[11px] font-mono text-muted-foreground">
              OAuth2 Client Auth
            </div>
          </div>
        )}

        {/* Dark mode switch */}
        {isCollapsed ? (
          <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            title={isDark ? "Ganti ke Light Theme" : "Ganti ke Dark Theme"}
          >
            {isDark ? (
              <Moon className="w-4 h-4 text-indigo-400" />
            ) : (
              <Sun className="w-4 h-4 text-amber-500" />
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <span className="flex items-center gap-2.5">
              {isDark ? (
                <Moon className="w-4 h-4 text-indigo-400" />
              ) : (
                <Sun className="w-4 h-4 text-amber-500" />
              )}
              <span>{isDark ? "Dark Theme" : "Light Theme"}</span>
            </span>
            <div
              className={`w-8 h-4.5 rounded-full transition-colors relative ${
                isDark ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            >
              <div
                className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-xs transition-transform duration-200 ${
                  isDark ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </div>
          </button>
        )}

        {/* Logout */}
        {isCollapsed ? (
          <button
            type="button"
            onClick={handleLogout}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        )}
      </div>
    </aside>
  );
}
