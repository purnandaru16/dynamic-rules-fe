"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore, getClientIdentity } from "@/lib/store";
import { useTheme } from "next-themes";
import { useState, useEffect, useRef } from "react";
import { Zap, FileStack, PlusCircle, FlaskConical, Sun, Moon, LogOut, LogIn, ChevronUp } from "lucide-react";

const navItems = [
  { href: "/dashboard",     label: "Dashboard",     icon: Zap },
  { href: "/rules",         label: "Rules",         icon: FileStack },
  { href: "/rules/builder", label: "New Rule",   icon: PlusCircle },
  { href: "/evaluate",      label: "Evaluate",    icon: FlaskConical },
];

export function Sidebar() {
  const pathname               = usePathname();
  const router                 = useRouter();
  const { logout, isLoggedIn, accessToken } = useAuthStore();
  const { resolvedTheme, setTheme } = useTheme();
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  // Tutup dropdown saat klik di luar / tekan Escape
  useEffect(() => {
    if (!userOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setUserOpen(false); };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [userOpen]);

  if (!isLoggedIn) return null;

  const identity = getClientIdentity(accessToken);

  const handleLogout = () => {
    setUserOpen(false);
    logout();
    router.push("/login");
  };

  const isDark = resolvedTheme === "dark";

  return (
    <aside className="w-56 h-screen border-r border-border/60 bg-card flex flex-col shrink-0">

      {/* Logo */}
      <div className="px-5 py-6">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center size-9 rounded-xl bg-primary/10 text-primary">
            <Zap className="size-5" />
          </span>
          <div>
            <div className="text-sm font-bold leading-tight text-foreground">Dynamic Rules</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Publishing Console</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 flex flex-col gap-1">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Menu
        </p>
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/rules" && item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors
                ${isActive
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}>
              <item.icon className={`size-[18px] shrink-0 ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
              <span>{item.label}</span>
              {isActive && <span className="ml-auto size-1.5 rounded-full bg-primary" />}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 border-t border-border/60 flex flex-col gap-1">

        {/* User dropdown: klik card → buka menu */}
        {identity.name && (
          <div className="relative mb-1" ref={userRef}>
            <button
              onClick={() => setUserOpen((o) => !o)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors text-left
                ${userOpen ? "bg-primary/10" : "bg-muted/70 hover:bg-muted"}`}>
              <span className="inline-flex items-center justify-center size-9 rounded-full bg-primary/15 text-primary font-bold text-sm shrink-0">
                {identity.initial}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground truncate">{identity.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">Client Application</div>
              </div>
              <ChevronUp className={`size-4 text-muted-foreground shrink-0 transition-transform ${userOpen ? "" : "rotate-180"}`} />
            </button>

            {userOpen && (
              <div className="absolute left-0 right-0 bottom-full z-50 mb-1 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
                <h4 className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Akun
                </h4>
                <div className="p-1">
                  <button
                    onClick={() => setUserOpen(false)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted transition-colors pointer-events-none opacity-70">
                    <LogIn className="size-4 text-muted-foreground" />
                    <span>{identity.name}</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors">
                    <LogOut className="size-4" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dark mode toggle */}
        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          {isDark ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
          <span className="flex-1 text-left">{isDark ? "Dark Mode" : "Light Mode"}</span>
          <div className={`w-9 h-5 rounded-full transition-colors relative ${isDark ? "bg-primary" : "bg-muted-foreground/25"}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200
              ${isDark ? "translate-x-4" : "translate-x-0.5"}`} />
          </div>
        </button>

      </div>

    </aside>
  );
}