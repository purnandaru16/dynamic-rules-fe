"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { getRules, publishRules, unpublishRules } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Layers,
  Workflow,
  Zap,
  Plus,
  CheckCircle2,
  Clock,
  ArrowRight,
  Activity,
  Calendar,
  Search,
  RotateCcw,
  AlertTriangle,
  Boxes,
  Database,
  Cpu,
  RefreshCw,
} from "lucide-react";

interface RuleConditionLeaf {
  object?: string;
  attribute?: string;
  operator?: string;
  value?: unknown;
}

interface RuleCondition {
  operator?: string;
  children?: (RuleCondition | RuleConditionLeaf)[];
  object?: string;
  attribute?: string;
  value?: unknown;
}

interface Rule {
  id: number;
  appName?: string;
  published: boolean;
  hasPendingChanges: boolean;
  startDate?: string;
  endDate?: string;
  condition: RuleCondition;
  action?: Record<string, unknown> | unknown[];
}

type TemporalStatus = "all" | "active" | "scheduled" | "draft" | "pending" | "expired";

function extractFactsFromCondition(cond?: RuleCondition): { objects: string[]; attributes: string[] } {
  const objects = new Set<string>();
  const attributes = new Set<string>();

  const traverse = (node?: RuleCondition | RuleConditionLeaf) => {
    if (!node) return;
    if ("object" in node && node.object) {
      objects.add(node.object);
    }
    if ("attribute" in node && node.attribute) {
      attributes.add(node.attribute);
    }
    if ("children" in node && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  };

  traverse(cond);
  return { objects: Array.from(objects), attributes: Array.from(attributes) };
}

function extractActionKeys(action?: Record<string, unknown> | unknown[]): string[] {
  if (!action) return [];
  if (typeof action === "object" && !Array.isArray(action)) {
    return Object.keys(action);
  }
  if (Array.isArray(action)) {
    return action.flatMap((item) => (typeof item === "object" && item ? Object.keys(item) : []));
  }
  return [];
}

function getRuleTemporalStatus(r: Rule, nowMs: number = Date.now()): "active" | "scheduled" | "draft" | "expired" {
  if (!r.published) return "draft";
  const parseTime = (ts?: string) => {
    if (!ts) return null;
    const num = Number(ts);
    if (!isNaN(num) && num > 0) return num;
    const d = new Date(ts).getTime();
    return isNaN(d) ? null : d;
  };

  const start = parseTime(r.startDate);
  const end = parseTime(r.endDate);

  if (start && start > nowMs) return "scheduled";
  if (end && end < nowMs) return "expired";
  return "active";
}

// Format unix timestamp → tanggal readable (dd-MMM-yyyy)
const formatTs = (ts?: string | number) => {
  if (!ts) return "—";
  const num = Number(ts);
  const date = !isNaN(num) && num > 0 ? new Date(num) : new Date(ts);
  if (isNaN(date.getTime())) return String(ts);
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export default function DashboardPage() {
  const router = useRouter();
  const { isLoggedIn, isInitialized } = useAuthStore();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  // ─── Interactive Filters ───
  const [selectedStatus, setSelectedStatus] = useState<TemporalStatus>("all");
  const [selectedAction, setSelectedAction] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (isInitialized && !isLoggedIn) router.push("/login");
  }, [isInitialized, isLoggedIn, router]);

  const loadRules = async () => {
    try {
      setLoading(true);
      const res = await getRules();
      setRules(res.data.data ?? res.data ?? []);
    } catch (e) {
      console.error(e);
      toast.error("Gagal memuat data rules dari server");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isInitialized || !isLoggedIn) return;
    loadRules();
  }, [isInitialized, isLoggedIn]);

  // ─── Fast Toggle Publish/Unpublish directly from Dashboard ───
  const handleTogglePublish = async (rule: Rule) => {
    try {
      setActionLoadingId(rule.id);
      if (rule.published) {
        await unpublishRules([rule.id]);
        toast.success(`Rule #${rule.id} berhasil di-unpublish ke status Draft`);
      } else {
        await publishRules([rule.id]);
        toast.success(`Rule #${rule.id} berhasil di-publish ke Drools Engine!`);
      }
      await loadRules();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Gagal mengubah status rule";
      toast.error(msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  // ─── Metrics Computation ───
  const nowMs = Date.now();

  const {
    total,
    activeNow,
    scheduled,
    draft,
    pending,
    expired,
    actionCounts,
    factObjectCounts,
    totalFactEvaluations,
  } = useMemo(() => {
    let act = 0;
    let sch = 0;
    let drf = 0;
    let pnd = 0;
    let exp = 0;

    const actionMap: Record<string, number> = {};
    const objMap: Record<string, number> = {};

    rules.forEach((r) => {
      const status = getRuleTemporalStatus(r, nowMs);
      if (status === "active") act++;
      else if (status === "scheduled") sch++;
      else if (status === "draft") drf++;
      else if (status === "expired") exp++;

      if (r.hasPendingChanges) pnd++;

      const { objects } = extractFactsFromCondition(r.condition);
      objects.forEach((obj) => {
        objMap[obj] = (objMap[obj] || 0) + 1;
      });

      const actions = extractActionKeys(r.action);
      actions.forEach((actKey) => {
        actionMap[actKey] = (actionMap[actKey] || 0) + 1;
      });
    });

    const actionList = Object.entries(actionMap).sort((a, b) => b[1] - a[1]);
    const objList = Object.entries(objMap).sort((a, b) => b[1] - a[1]);
    const totalFacts = Object.values(objMap).reduce((acc, c) => acc + c, 0);

    return {
      total: rules.length,
      activeNow: act,
      scheduled: sch,
      draft: drf,
      pending: pnd,
      expired: exp,
      actionCounts: actionList,
      factObjectCounts: objList,
      totalFactEvaluations: totalFacts,
    };
  }, [rules, nowMs]);

  // ─── Filtered Rules for Interactive Table ───
  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      // Filter by Action
      if (selectedAction !== "all") {
        const keys = extractActionKeys(r.action);
        if (!keys.includes(selectedAction)) return false;
      }

      // Filter by Status
      const status = getRuleTemporalStatus(r, nowMs);
      if (selectedStatus === "active" && status !== "active") return false;
      if (selectedStatus === "scheduled" && status !== "scheduled") return false;
      if (selectedStatus === "draft" && !(!r.published)) return false;
      if (selectedStatus === "pending" && !r.hasPendingChanges) return false;
      if (selectedStatus === "expired" && status !== "expired") return false;

      // Filter by Search Query (ID, condition text, action text)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const idMatch = String(r.id).includes(q);
        const condMatch = JSON.stringify(r.condition || {}).toLowerCase().includes(q);
        const actionMatch = JSON.stringify(r.action || {}).toLowerCase().includes(q);
        if (!idMatch && !condMatch && !actionMatch) return false;
      }

      return true;
    });
  }, [rules, selectedAction, selectedStatus, searchQuery, nowMs]);

  const isFilterActive = selectedStatus !== "all" || selectedAction !== "all" || searchQuery.trim() !== "";

  const handleResetFilters = () => {
    setSelectedStatus("all");
    setSelectedAction("all");
    setSearchQuery("");
  };

  if (!isInitialized || loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px] gap-3 text-muted-foreground">
        <span className="w-5 h-5 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
        <span className="text-xs font-medium">Memuat metrik analitik engine...</span>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto flex flex-col gap-6">
      {/* ─── Header ─── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
            <Badge
              variant="outline"
              className="text-xs font-mono text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 gap-1.5 py-0.5"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Engine Live
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Ringkasan status workflow, prosedur rule, dan metrik publikasi
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={loadRules}
            disabled={loading}
            className="h-9 text-xs rounded-xl gap-1.5 border-border hover:bg-muted"
            title="Refresh data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => router.push("/evaluate")}
            className="h-9 text-xs rounded-xl gap-1.5 border-border hover:bg-muted"
          >
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Fact Test Runner</span>
          </Button>

          <Button
            onClick={() => router.push("/rules/builder")}
            className="h-9 px-4 text-xs font-semibold rounded-xl gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm shadow-primary/25"
          >
            <Plus className="w-4 h-4" />
            <span>New Flow Procedure</span>
          </Button>
        </div>
      </div>

      {/* ─── Interactive Top Metric Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Procedures */}
        <div
          onClick={() => setSelectedStatus("all")}
          className={`cursor-pointer rounded-2xl border p-4.5 flex flex-col justify-between transition-all hover:scale-[1.01] shadow-xs relative overflow-hidden group ${
            selectedStatus === "all"
              ? "border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/40 dark:bg-blue-950/20"
              : "border-border bg-card hover:border-blue-300 dark:hover:border-blue-800"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100/70 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
              Total Catalog
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold tracking-tight text-foreground">{total}</div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-between">
              <span>Prosedur DRL</span>
              <span className="text-[11px] font-medium text-purple-600 dark:text-purple-400 group-hover:underline">
                {actionCounts.length} Action Types
              </span>
            </div>
          </div>
        </div>

        {/* Active Now (Live Evaluating) */}
        <div
          onClick={() => setSelectedStatus(selectedStatus === "active" ? "all" : "active")}
          className={`cursor-pointer rounded-2xl border p-4.5 flex flex-col justify-between transition-all hover:scale-[1.01] shadow-xs relative overflow-hidden group ${
            selectedStatus === "active"
              ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/30"
              : "border-border bg-card hover:border-emerald-300 dark:hover:border-emerald-800"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Now
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
              {activeNow}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-between">
              <span>Aktif mengevaluasi</span>
              <span className="text-[11px] font-bold text-emerald-600">
                {total > 0 ? Math.round((activeNow / total) * 100) : 0}% total
              </span>
            </div>
          </div>
        </div>

        {/* Scheduled & Upcoming */}
        <div
          onClick={() => setSelectedStatus(selectedStatus === "scheduled" ? "all" : "scheduled")}
          className={`cursor-pointer rounded-2xl border p-4.5 flex flex-col justify-between transition-all hover:scale-[1.01] shadow-xs relative overflow-hidden group ${
            selectedStatus === "scheduled"
              ? "border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/50 dark:bg-indigo-950/30"
              : "border-border bg-card hover:border-indigo-300 dark:hover:border-indigo-800"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <Calendar className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300">
              Scheduled
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold tracking-tight text-indigo-600 dark:text-indigo-400">
              {scheduled}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-between">
              <span>Masa depan aktif</span>
              <span className="text-[11px] font-mono text-muted-foreground">Mulai terjadwal</span>
            </div>
          </div>
        </div>

        {/* Pending Changes / Drafts */}
        <div
          onClick={() => setSelectedStatus(selectedStatus === "draft" ? "all" : "draft")}
          className={`cursor-pointer rounded-2xl border p-4.5 flex flex-col justify-between transition-all hover:scale-[1.01] shadow-xs relative overflow-hidden group ${
            selectedStatus === "draft" || selectedStatus === "pending"
              ? "border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/50 dark:bg-amber-950/30"
              : "border-border bg-card hover:border-amber-300 dark:hover:border-amber-800"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-amber-600/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
            {pending > 0 ? (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                {pending} Pending
              </span>
            ) : (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                Draft Mode
              </span>
            )}
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold tracking-tight text-amber-600 dark:text-amber-400">
              {draft}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-between">
              <span>Draft belum live</span>
              <span className="text-[11px] font-mono text-amber-600">
                {pending} butuh publish
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Operational Health & Lifecycle Distribution Bar ─── */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-xs flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">
              Rule Lifecycle & Session Health Distribution
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">
              {activeNow + scheduled} dari {total} rule telah ter-deploy ke engine
            </span>
          </div>
        </div>

        {/* Multi-segment Progress Bar */}
        <div className="w-full h-3.5 rounded-full bg-muted/60 overflow-hidden flex p-0.5 gap-0.5">
          {total > 0 ? (
            <>
              {activeNow > 0 && (
                <div
                  className="h-full bg-emerald-500 rounded-l-full transition-all duration-700 cursor-pointer hover:opacity-90"
                  style={{ width: `${(activeNow / total) * 100}%` }}
                  onClick={() => setSelectedStatus("active")}
                  title={`Active Now: ${activeNow} (${Math.round((activeNow / total) * 100)}%)`}
                />
              )}
              {scheduled > 0 && (
                <div
                  className="h-full bg-indigo-500 transition-all duration-700 cursor-pointer hover:opacity-90"
                  style={{ width: `${(scheduled / total) * 100}%` }}
                  onClick={() => setSelectedStatus("scheduled")}
                  title={`Scheduled: ${scheduled} (${Math.round((scheduled / total) * 100)}%)`}
                />
              )}
              {draft > 0 && (
                <div
                  className="h-full bg-amber-400 transition-all duration-700 cursor-pointer hover:opacity-90"
                  style={{ width: `${(draft / total) * 100}%` }}
                  onClick={() => setSelectedStatus("draft")}
                  title={`Draft: ${draft} (${Math.round((draft / total) * 100)}%)`}
                />
              )}
              {expired > 0 && (
                <div
                  className="h-full bg-slate-400 rounded-r-full transition-all duration-700 cursor-pointer hover:opacity-90"
                  style={{ width: `${(expired / total) * 100}%` }}
                  onClick={() => setSelectedStatus("expired")}
                  title={`Expired: ${expired} (${Math.round((expired / total) * 100)}%)`}
                />
              )}
            </>
          ) : (
            <div className="h-full w-full bg-muted rounded-full" />
          )}
        </div>

        {/* Legend buttons */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <button
            type="button"
            onClick={() => setSelectedStatus("active")}
            className={`flex items-center gap-1.5 transition-colors ${
              selectedStatus === "active" ? "font-bold text-emerald-600" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Active Now ({activeNow})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedStatus("scheduled")}
            className={`flex items-center gap-1.5 transition-colors ${
              selectedStatus === "scheduled" ? "font-bold text-indigo-600" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
            <span>Scheduled ({scheduled})</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedStatus("draft")}
            className={`flex items-center gap-1.5 transition-colors ${
              selectedStatus === "draft" ? "font-bold text-amber-600" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span>Draft ({draft})</span>
          </button>

          {expired > 0 && (
            <button
              type="button"
              onClick={() => setSelectedStatus("expired")}
              className={`flex items-center gap-1.5 transition-colors ${
                selectedStatus === "expired" ? "font-bold text-slate-600" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
              <span>Expired ({expired})</span>
            </button>
          )}

          {selectedStatus !== "all" && (
            <button
              type="button"
              onClick={() => setSelectedStatus("all")}
              className="ml-auto text-[11px] text-primary hover:underline flex items-center gap-1 font-semibold"
            >
              <span>Reset Status Filter</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── 2-Column Analytics: Fact Intelligence (WHEN) & Action Radar (THEN) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fact Object Intelligence (Column 1 & 2 - WHEN) */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-border/70">
            <div className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-indigo-600" />
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  WHEN: Business Fact Triggers (Input Objects)
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Objek bisnis yang paling sering dievaluasi oleh logic gate Drools
                </p>
              </div>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground px-2 py-0.5 rounded-md bg-muted">
              {factObjectCounts.length} Objek Terdeteksi
            </span>
          </div>

          {factObjectCounts.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-6 text-center">
              Belum ada object fact yang didaftarkan pada rule logic.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {factObjectCounts.map(([obj, count]) => {
                const ratio = totalFactEvaluations > 0 ? Math.round((count / totalFactEvaluations) * 100) : 0;
                return (
                  <div
                    key={obj}
                    onClick={() => setSearchQuery(obj)}
                    className="p-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/50 cursor-pointer transition-all flex flex-col gap-2 group"
                    title={`Klik untuk memfilter rule yang memuat object ${obj}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-indigo-500" />
                        {obj}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {count} rules ({ratio}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Decision Action Outcomes (Column 3 - THEN Effects) */}
        <div className="rounded-2xl border border-purple-200/80 dark:border-purple-800/60 bg-card p-5 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-border/70">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  THEN: Decision Outcomes
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Output aksi bisnis yang dieksekusi
                </p>
              </div>
            </div>
            <span className="text-[11px] font-mono text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60">
              {actionCounts.length} Actions
            </span>
          </div>

          <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[220px] pr-1">
            <button
              type="button"
              onClick={() => setSelectedAction("all")}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center justify-between ${
                selectedAction === "all"
                  ? "bg-purple-600 text-white font-semibold shadow-xs"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              }`}
            >
              <span>Semua Action Effects</span>
              <span className="font-mono text-[11px]">{total}</span>
            </button>

            {actionCounts.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-4 text-center">
                Belum ada action yang terdaftar
              </div>
            ) : (
              actionCounts.map(([actKey, count]) => {
                const isSelected = selectedAction === actKey;
                const ratio = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <button
                    key={actKey}
                    type="button"
                    onClick={() => setSelectedAction(isSelected ? "all" : actKey)}
                    className={`w-full text-left p-2.5 rounded-xl text-xs font-medium transition-all flex flex-col gap-1.5 ${
                      isSelected
                        ? "bg-purple-600 text-white font-semibold shadow-xs"
                        : "bg-muted/30 text-muted-foreground hover:bg-muted/70 hover:text-foreground border border-border/50"
                    }`}
                  >
                    <div className="w-full flex items-center justify-between">
                      <span className="font-mono font-bold truncate mr-2 flex items-center gap-1.5">
                        <Zap className={`w-3 h-3 ${isSelected ? "text-white" : "text-purple-600 dark:text-purple-400"}`} />
                        {actKey}
                      </span>
                      <span className={`font-mono text-[10px] ${isSelected ? "text-purple-100" : "text-muted-foreground"}`}>
                        {count} rules ({ratio}%)
                      </span>
                    </div>
                    <div className="w-full h-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isSelected ? "bg-white" : "bg-purple-600"}`}
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ─── Interactive Rules Stream Table ─── */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-xs flex flex-col gap-4">
        {/* Stream Header & Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/70">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Prosedur & Execution Pipeline
              </h2>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Menampilkan {filteredRules.length} dari {total} rule berdasarkan filter aktif
            </p>
          </div>

          {/* Search bar & reset */}
          <div className="flex items-center gap-2">
            <div className="relative w-52 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari ID, fact, condition, action..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-8.5 rounded-xl bg-muted/20 border-border"
              />
            </div>

            {isFilterActive && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="h-8.5 px-2.5 text-xs rounded-xl gap-1 text-muted-foreground hover:text-foreground"
                title="Reset semua filter"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">Reset</span>
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => router.push("/rules")}
              className="h-8.5 text-xs text-primary gap-1 font-semibold"
            >
              <span>Katalog Lengkap</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Active Filter Badges */}
        {isFilterActive && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-semibold text-muted-foreground">Filter:</span>
            {selectedStatus !== "all" && (
              <Badge variant="secondary" className="text-xs capitalize font-mono gap-1">
                Status: {selectedStatus}
                <button
                  type="button"
                  onClick={() => setSelectedStatus("all")}
                  className="ml-1 text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </Badge>
            )}
            {selectedAction !== "all" && (
              <Badge variant="secondary" className="text-xs font-mono gap-1 bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-purple-200">
                Action: {selectedAction}
                <button
                  type="button"
                  onClick={() => setSelectedAction("all")}
                  className="ml-1 text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </Badge>
            )}
            {searchQuery.trim() && (
              <Badge variant="secondary" className="text-xs font-mono gap-1">
                Query: &quot;{searchQuery}&quot;
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="ml-1 text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </Badge>
            )}
          </div>
        )}

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/80 bg-muted/40">
                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground w-16">
                  ID
                </th>
                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground">
                  WHEN (Condition & Fact Target)
                </th>
                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground">
                  THEN (Action Outputs)
                </th>
                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground">
                  Temporal Validity
                </th>
                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground">
                  Lifecycle Status
                </th>
                <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-muted-foreground">
                  Quick Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredRules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground">
                    <div className="font-semibold text-foreground text-sm">Tidak ada rule yang sesuai</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Coba ubah kriteria pencarian atau klik tombol Reset di atas.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRules.slice(0, 10).map((r) => {
                  const temporal = getRuleTemporalStatus(r, nowMs);
                  const isActionLoading = actionLoadingId === r.id;
                  const { objects } = extractFactsFromCondition(r.condition);

                  // Extract action entries for clean display
                  const actionEntries: [string, unknown][] =
                    r.action && typeof r.action === "object" && !Array.isArray(r.action)
                      ? Object.entries(r.action)
                      : [];

                  return (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      {/* ID */}
                      <td className="px-4 py-3 font-mono font-bold text-primary">
                        <span className="bg-primary/10 px-2 py-0.5 rounded-md">#{r.id}</span>
                      </td>

                      {/* WHEN: Condition & Fact Target */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="font-bold px-1.5 py-0.2 rounded bg-muted text-foreground text-[10px]">
                            {r.condition?.operator || "AND"}
                          </span>
                          <span className="text-foreground text-[11px] font-semibold truncate max-w-[200px]">
                            {objects.length > 0 ? objects.join(", ") : "Universal Fact"}
                          </span>
                          <span className="text-muted-foreground text-[10px]">
                            ({r.condition?.children?.length ?? 1} kriteria)
                          </span>
                        </div>
                      </td>

                      {/* THEN: Action Outputs */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1 max-w-[260px]">
                          {actionEntries.length > 0 ? (
                            actionEntries.map(([k, v]) => (
                              <span
                                key={k}
                                className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200/70 dark:border-purple-800/60"
                                title={`${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`}
                              >
                                <span className="font-semibold">{k}:</span>
                                <span className="truncate max-w-[70px]">
                                  {typeof v === "object" ? JSON.stringify(v) : String(v)}
                                </span>
                              </span>
                            ))
                          ) : (
                            <span className="text-muted-foreground italic text-[11px]">
                              {r.action ? JSON.stringify(r.action).slice(0, 30) : "No action"}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Temporal Validity */}
                      <td className="px-4 py-3 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                        {r.startDate || r.endDate ? (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span>
                              {formatTs(r.startDate)} s/d {formatTs(r.endDate)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/70 italic">Permanen (No Expiry)</span>
                        )}
                      </td>

                      {/* Lifecycle Status */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {temporal === "active" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Active Now
                            </span>
                          )}
                          {temporal === "scheduled" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                              <Calendar className="w-3 h-3" />
                              Scheduled
                            </span>
                          )}
                          {temporal === "draft" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">
                              Draft
                            </span>
                          )}
                          {temporal === "expired" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">
                              Expired
                            </span>
                          )}

                          {r.hasPendingChanges && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Pending
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Quick Actions */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs rounded-xl gap-1.5 border-border hover:bg-primary/10 hover:text-primary hover:border-primary/40 font-medium shadow-2xs"
                            onClick={() => router.push(`/rules/builder?id=${r.id}`)}
                            title="Buka di Visual Flow Builder"
                          >
                            <Workflow className="w-3.5 h-3.5" />
                            <span>Flow</span>
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isActionLoading}
                            className={`h-7 px-2.5 text-xs rounded-xl min-w-[88px] justify-center gap-1.5 font-medium shadow-2xs transition-all ${
                              r.published
                                ? "text-amber-600 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950"
                                : "text-emerald-600 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                            }`}
                            onClick={() => handleTogglePublish(r)}
                          >
                            {isActionLoading ? (
                              <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                            ) : r.published ? (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                <span>Unpublish</span>
                              </>
                            ) : (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span>Publish</span>
                              </>
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
