"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { getRules } from "@/lib/api";
import {
  Layers,
  BadgeCheck,
  FileEdit,
  Clock3,
  ArrowRight,
  Server,
} from "lucide-react";

interface Rule {
  id: number;
  appName: string;
  published: boolean;
  hasPendingChanges: boolean;
  startDate?: string;
  endDate?: string;
  condition: { operator: string; children?: unknown[] };
}

export default function DashboardPage() {
  const router = useRouter();
  const { isLoggedIn } = useAuthStore();
  const [rules, setRules]     = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn) router.push("/login");
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const fetch = async () => {
      try {
        const res = await getRules();
        setRules(res.data.data ?? res.data ?? []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [isLoggedIn]);

  // ── Stats ──
  const total       = rules.length;
  const published   = rules.filter((r) => r.published).length;
  const draft       = rules.filter((r) => !r.published).length;
  const pending     = rules.filter((r) => r.hasPendingChanges).length;

  // Rules per appName
  const byApp = Object.entries(
    rules.reduce<Record<string, { total: number; published: number }>>((acc, r) => {
      if (!acc[r.appName]) acc[r.appName] = { total: 0, published: 0 };
      acc[r.appName].total++;
      if (r.published) acc[r.appName].published++;
      return acc;
    }, {})
  ).sort((a, b) => b[1].total - a[1].total);

  // Rules per operator
  const byOperator = Object.entries(
    rules.reduce<Record<string, number>>((acc, r) => {
      const op = r.condition?.operator ?? "UNKNOWN";
      acc[op] = (acc[op] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  // Recently added (last 5 by id desc)
  const recent = [...rules].sort((a, b) => b.id - a.id).slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-muted-foreground">
        <span className="animate-spin text-xl">⏳</span>
        <span className="text-sm">Loading dashboard...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[90rem] mx-auto lg:p-8">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of all rules · Publishing Service :8080
        </p>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Rules",     value: total,     Icon: Layers,     tint: "bg-primary/10 text-primary" },
          { label: "Published",       value: published, Icon: BadgeCheck, tint: "bg-primary/10 text-primary" },
          { label: "Draft",           value: draft,     Icon: FileEdit,   tint: "bg-primary/10 text-primary" },
          { label: "Pending Changes", value: pending,   Icon: Clock3,     tint: "bg-primary/10 text-primary" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.02] flex items-center gap-4"
          >
            <span className={`inline-flex items-center justify-center size-12 shrink-0 rounded-2xl ${s.tint}`}>
              <s.Icon className="size-6" />
            </span>
            <div className="min-w-0">
              <div className="text-3xl font-bold text-foreground tabular-nums">{s.value}</div>
              <div className="text-xs text-muted-foreground font-medium mt-1 truncate">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Published ratio ── */}
      {total > 0 && (
        <div className="mb-8 rounded-2xl border border-border/60 bg-card p-6 shadow-sm shadow-black/[0.02]">
          <div className="flex flex-col md:flex-row md:items-center gap-5 md:gap-10">
            <div className="shrink-0 md:w-56">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Server className="size-4 text-primary" /> Published Ratio
              </h2>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-4xl font-bold text-foreground tabular-nums">{Math.round((published / total) * 100)}%</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {published}/{total} rules published
              </div>
            </div>
            <div className="flex-1 w-full">
              <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${Math.max((published / total) * 100, 2)}%` }}
                />
              </div>
              <div className="flex gap-5 mt-3 text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-2.5 rounded-full bg-primary inline-block" />
                  Published ({published})
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-2.5 rounded-full bg-muted-foreground/30 inline-block" />
                  Draft ({draft})
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

        {/* ── Rules per App ── */}
        <div className="lg:col-span-2 rounded-2xl border border-border/60 bg-card p-6 shadow-sm shadow-black/[0.02]">
          <h2 className="text-sm font-semibold mb-5">Rules per App</h2>
          {byApp.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">No data</div>
          ) : (
            <div className="flex flex-col gap-4">
              {byApp.map(([app, stat]) => (
                <div key={app}>
                  <div className="flex items-center justify-between mb-1.5 gap-3">
                    <span className="text-sm font-medium text-foreground truncate">{app}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {stat.published}/{stat.total} published
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${Math.max((stat.total / total) * 100, 3)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Rules per Operator ── */}
        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm shadow-black/[0.02]">
          <h2 className="text-sm font-semibold mb-5">Rules per Operator</h2>
          {byOperator.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">No data</div>
          ) : (
            <div className="flex flex-col gap-3">
              {byOperator.map(([op, count]) => (
                <div key={op} className="flex items-center justify-between gap-3">
                  <span className="text-xs font-mono bg-muted px-2.5 py-1 rounded-lg text-foreground/80">{op}</span>
                  <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                    <div className="w-24 h-2 rounded-full bg-muted overflow-hidden shrink-0">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${Math.max((count / total) * 100, 6)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-6 text-right tabular-nums shrink-0">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Rules ── */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm shadow-black/[0.02]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-sm font-semibold">Latest Rules</h2>
          <button
            onClick={() => router.push("/rules")}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            View all <ArrowRight className="size-3.5" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "90px" }} />
              <col style={{ width: "160px" }} />
              <col style={{ width: "auto" }} />
              <col style={{ width: "120px" }} />
            </colgroup>
            <thead>
              <tr className="border-b border-border/60">
                {["ID", "App", "Action", "Status"].map((h) => (
                  <th key={h} className="text-left px-6 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {recent.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-sm text-muted-foreground">
                    No rules yet. Click <span className="font-medium text-primary">Create Rule</span> to get started.
                  </td>
                </tr>
              )}
              {recent.map((r) => (
                <tr key={r.id} onClick={() => router.push(`/rules/builder?id=${r.id}`)} className="cursor-pointer hover:bg-muted/40 transition-colors">
                  <td className="px-6 py-3 font-mono font-semibold text-primary text-xs whitespace-nowrap">#{r.id}</td>
                  <td className="px-6 py-3 text-xs font-medium text-foreground truncate max-w-0">{r.appName}</td>
                  <td className="px-6 py-3 text-xs font-mono text-muted-foreground truncate">
                    {r.condition?.operator} · {r.condition?.children?.length ?? 0} kondisi
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full font-medium border
                      ${r.published
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20"
                        : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20"}`}>
                      <span className={`size-1.5 rounded-full ${r.published ? "bg-emerald-500" : "bg-slate-400"}`} />
                      {r.published ? "Published" : "Draft"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t border-border/60 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Showing {recent.length} of {total} rules</span>
          <span className="text-xs text-muted-foreground">#{recent[0]?.id ?? "-"} newest</span>
        </div>
      </div>

      <div className="h-6" />
    </div>
  );
}