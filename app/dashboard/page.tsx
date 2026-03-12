"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { getRules } from "@/lib/api";

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
        <span className="text-sm">Memuat dashboard...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Ringkasan seluruh rules · Publishing Service :8080
        </p>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Rules",     value: total,     icon: "📋", color: "text-blue-500",   bg: "bg-blue-50 dark:bg-blue-950",    border: "border-blue-100 dark:border-blue-900" },
          { label: "Published",       value: published, icon: "✅", color: "text-green-600",  bg: "bg-green-50 dark:bg-green-950",  border: "border-green-100 dark:border-green-900" },
          { label: "Draft",           value: draft,     icon: "📝", color: "text-slate-500",  bg: "bg-slate-50 dark:bg-slate-900",  border: "border-slate-100 dark:border-slate-800" },
          { label: "Pending Changes", value: pending,   icon: "⏳", color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950", border: "border-orange-100 dark:border-orange-900" },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border p-5 flex items-center gap-4 ${s.bg} ${s.border}`}>
            <span className="text-3xl">{s.icon}</span>
            <div>
              <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground font-medium mt-0.5">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Published ratio bar */}
      {total > 0 && (
        <div className="mb-6 p-4 rounded-xl border bg-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Rasio Published</span>
            <span className="text-sm text-muted-foreground">
              {published}/{total} ({Math.round((published / total) * 100)}%)
            </span>
          </div>
          <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-500"
              style={{ width: `${(published / total) * 100}%` }}
            />
          </div>
          <div className="flex gap-4 mt-2">
            <span className="text-xs flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
              Published ({published})
            </span>
            <span className="text-xs flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30 inline-block" />
              Draft ({draft})
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-6">

        {/* ── Rules per App ── */}
        <div className="col-span-2 rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold mb-4">Rules per App</h2>
          {byApp.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">Tidak ada data</div>
          ) : (
            <div className="flex flex-col gap-3">
              {byApp.map(([app, stat]) => (
                <div key={app}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{app}</span>
                    <span className="text-xs text-muted-foreground">
                      {stat.published}/{stat.total} published
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-500"
                      style={{ width: `${(stat.total / total) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Rules per Operator ── */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold mb-4">Rules per Operator</h2>
          {byOperator.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">Tidak ada data</div>
          ) : (
            <div className="flex flex-col gap-2">
              {byOperator.map(([op, count]) => (
                <div key={op} className="flex items-center justify-between">
                  <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{op}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent-foreground/20 bg-purple-500"
                        style={{ width: `${(count / total) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-4 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Rules ── */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Rule Terbaru</h2>
          <button
            onClick={() => router.push("/rules")}
            className="text-xs text-primary hover:underline">
            Lihat semua →
          </button>
        </div>
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "60px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "auto" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "100px" }} />
          </colgroup>
          <thead>
            <tr className="border-b">
              {["ID", "App", "Action", "App Name", "Status"].map((h) => (
                <th key={h} className="text-left pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {recent.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                <td className="py-2.5 font-mono font-semibold text-primary text-xs">#{r.id}</td>
                <td className="py-2.5 text-xs">{r.appName}</td>
                <td className="py-2.5 text-xs font-mono text-muted-foreground truncate">
                  {r.condition?.operator} · {r.condition?.children?.length ?? 0} kondisi
                </td>
                <td className="py-2.5 text-xs text-muted-foreground">{r.appName}</td>
                <td className="py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                    ${r.published
                      ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"}`}>
                    {r.published ? "Published" : "Draft"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}