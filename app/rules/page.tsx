"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { getRules, deleteRule, publishRules, unpublishRules } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Search,
  Pencil,
  Trash2,
  Send,
  Ban,
  CircleCheck,
  RotateCcw,
  FileBox,
  ListPlus,
  CalendarRange,
  TimerOff,
  AppWindow,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Rule {
  id: number;
  condition: { operator: string; children?: unknown[] };
  action: Record<string, unknown> | unknown[];
  published: boolean;
  hasPendingChanges: boolean;
  appName: string;
  startDate?: string;
  endDate?: string;
}

// Ubah unix timestamp → Date; support ms atau detik
const tsToDate = (ts?: string): Date | null => {
  if (!ts) return null;
  const n = Number(ts);
  if (isNaN(n)) return null;
  let d = new Date(n);
  if (isNaN(d.getTime())) return null;
  // Kalau ~10 digit (detik), kalikan 1000
  if (Math.abs(n) < 1e12) d = new Date(n * 1000);
  return d;
};

// Rule expired: ada endDate dan sudah lewat sekarang
const isExpired = (end?: string): boolean => {
  const t = tsToDate(end);
  if (!t) return false;
  return t.getTime() < Date.now();
};

// Format unix timestamp → tanggal readable
const formatTs = (ts?: string) => {
  const date = tsToDate(ts);
  if (!date) return ts || "—";
  return date.toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
  });
};

export default function RulesPage() {
  const router = useRouter();
  const { isLoggedIn } = useAuthStore();
  const [rules, setRules]           = useState<Rule[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null);
  const [deleting, setDeleting]     = useState(false);
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set());
  const [filterObject, setFilterObject]   = useState("");
  const [filterStatus, setFilterStatus]   = useState<"" | "all" | "true" | "false">("all");
  const [filterPending, setFilterPending] = useState<"" | "all" | "true" | "false">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) router.push("/login");
  }, [isLoggedIn, router]);

  const fetchRules = async (params?: Record<string, string>) => {
    setLoading(true);
    try {
      const res = await getRules(params);
      setRules(res.data.data ?? res.data ?? []);
    } catch (e) {
      console.error("Failed to fetch rules:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) fetchRules();
  }, [isLoggedIn]);

  const handleTogglePublish = async (rule: Rule) => {
    setLoadingIds((prev) => new Set(prev).add(rule.id));
    try {
      if (rule.published) {
        await unpublishRules([rule.id]);
        toast.success(`Rule #${rule.id} unpublished`);
      } else {
        await publishRules([rule.id]);
        toast.success(`Rule #${rule.id} published`);
      }
      setRules((rs) =>
        rs.map((r) =>
          r.id === rule.id
            ? { ...r, published: !r.published, hasPendingChanges: false }
            : r
        )
      );
    } catch (e) {
      toast.error(`Failed to change status of Rule #${rule.id}`);
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(rule.id);
        return next;
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteRule(deleteTarget.id);
      setRules((rs) => rs.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success(`Rule #${deleteTarget.id} deleted`);
    } catch (e) {
      toast.error(`Failed to delete Rule #${deleteTarget.id}`);
    } finally {
      setDeleting(false);
    }
  };

  // Handle apply filter
  const handleFilter = () => {
    const params: Record<string, string> = {};
    if (filterObject.trim())              params.object            = filterObject.trim();
    if (filterStatus && filterStatus !== "all")   params.published        = filterStatus;
    if (filterPending && filterPending !== "all") params.hasPendingChanges = filterPending;
    fetchRules(Object.keys(params).length > 0 ? params : undefined);
  };

  // Handle reset filter
  const handleReset = () => {
    setFilterObject("");
    setFilterStatus("all");
    setFilterPending("all");
    fetchRules();
  };

  const isFiltered = !!(
    filterObject.trim() ||
    (filterStatus && filterStatus !== "all") ||
    (filterPending && filterPending !== "all")
  );

  const filtered = rules.filter((r) =>
    search === "" ||
    r.id.toString().includes(search) ||
    JSON.stringify(r).toLowerCase().includes(search.toLowerCase())
  );

  // Nama app dari response rules (satu user = satu app)
  const currentAppName = rules.find((r) => r.appName)?.appName ?? "";

  // Reset ke halaman 1 saat filter/search berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterObject, filterStatus, filterPending]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated  = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const isAllSelected = paginated.length > 0 && paginated.every((r) => selectedIds.has(r.id));
  const isPartialSelected = paginated.some((r) => selectedIds.has(r.id)) && !isAllSelected;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginated.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginated.forEach((r) => next.add(r.id));
        return next;
      });
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkPublish = async () => {
    setBulkLoading(true);
    try {
      const ids = [...selectedIds];
      await publishRules(ids);
      setRules((rs) => rs.map((r) => selectedIds.has(r.id) ? { ...r, published: true, hasPendingChanges: false } : r));
      toast.success(`${ids.length} rules published`);
      setSelectedIds(new Set());
    } catch {
      toast.error("Bulk publish failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkUnpublish = async () => {
    setBulkLoading(true);
    try {
      const ids = [...selectedIds];
      await unpublishRules(ids);
      setRules((rs) => rs.map((r) => selectedIds.has(r.id) ? { ...r, published: false, hasPendingChanges: false } : r));
      toast.success(`${ids.length} rules unpublished`);
      setSelectedIds(new Set());
    } catch {
      toast.error("Bulk unpublish failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await Promise.all([...selectedIds].map((id) => deleteRule(id)));
      setRules((rs) => rs.filter((r) => !selectedIds.has(r.id)));
      toast.success(`${selectedIds.size} rules deleted`);
      setSelectedIds(new Set());
      setShowBulkDeleteDialog(false);
    } catch {
      toast.error("Bulk delete failed");
    } finally {
      setBulkDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-muted-foreground">
        <span className="animate-spin text-xl">⏳</span>
        <span className="text-sm font-medium">Loading rules...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rules Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and publish business rules · Publishing Service :8080
          </p>
        </div>
        <Button onClick={() => router.push("/rules/builder")} className="gap-2">
          <ListPlus className="size-4" /> Rule Baru
        </Button>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Rules",     value: rules.length,                                    Icon: FileBox },
          { label: "Published",       value: rules.filter((r) => r.published).length,         Icon: CircleCheck },
          { label: "Pending Changes", value: rules.filter((r) => r.hasPendingChanges).length, Icon: RotateCcw },
          { label: "Expired",         value: rules.filter((r) => isExpired(r.endDate)).length, Icon: TimerOff, tint: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm shadow-black/[0.02] flex items-center gap-4">
            <span className={`inline-flex items-center justify-center size-12 rounded-2xl ${s.tint ?? "bg-primary/10 text-primary"}`}>
              <s.Icon className="size-6" />
            </span>
            <div>
              <div className="text-3xl font-bold text-foreground tabular-nums">{s.value}</div>
              <div className="text-xs text-muted-foreground font-medium mt-1">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── App Name (dari response rules) ── */}
      <div className="flex items-center gap-2 mb-4">
        <AppWindow className="size-4 text-primary" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">App:</span>
        <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium">
          {currentAppName || "—"}
        </span>
      </div>

      {/* ── Filter Bar ── */}
      <div className="flex flex-wrap items-end gap-3 mb-4 p-4 rounded-2xl border border-border/60 bg-card">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Object</label>
          <input
            value={filterObject}
            onChange={(e) => setFilterObject(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFilter()}
            placeholder="e.g. customer"
            className="px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-ring w-40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</label>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as "" | "true" | "false")}>
            <SelectTrigger className="w-36 bg-background">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="true">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  Published
                </span>
              </SelectItem>
              <SelectItem value="false">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                  Draft
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pending</label>
          <Select value={filterPending} onValueChange={(v) => setFilterPending(v as "" | "true" | "false")}>
            <SelectTrigger className="w-36 bg-background">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="true">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                  Has Pending
                </span>
              </SelectItem>
              <SelectItem value="false">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                  No Pending
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 mb-0.5">
          <Button onClick={handleFilter} className="h-9 px-4 gap-2">
            <Search className="size-4" /> Filter
          </Button>
          {isFiltered && (
            <Button onClick={handleReset} variant="outline" className="h-9 px-4 gap-2">
              <RotateCcw className="size-3.5" /> Reset
            </Button>
          )}
        </div>

        {/* Active filter badges */}
        {isFiltered && (
          <div className="w-full flex items-center gap-2 flex-wrap pt-1">
            <span className="text-xs text-muted-foreground">Active filters:</span>
            {filterObject.trim() && <Badge variant="secondary" className="text-xs">Object: {filterObject}</Badge>}
            {filterStatus && filterStatus !== "all" && <Badge variant="secondary" className="text-xs">Status: {filterStatus === "true" ? "Published" : "Draft"}</Badge>}
            {filterPending && filterPending !== "all" && <Badge variant="secondary" className="text-xs">Pending: {filterPending === "true" ? "Has" : "None"}</Badge>}
          </div>
        )}
      </div>

      {/* ── Search ── */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari berdasarkan ID, kondisi, atau action..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border/60 bg-card text-sm outline-none focus:ring-2 focus:ring-ring transition"
        />
      </div>

      {/* Bulk Action Bar — muncul hanya saat ada yang dipilih */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 mb-2 rounded-lg border bg-primary/5 border-primary/20">
          <span className="text-sm font-medium text-primary">
            {selectedIds.size} rule(s) selected
          </span>
          <div className="flex gap-2 ml-auto">
            <Button
              size="sm" variant="outline"
              disabled={bulkLoading}
              className="h-8 text-xs text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-500/30"
              onClick={handleBulkPublish}>
              {bulkLoading ? "..." : <>
                <Send className="size-3.5" /> Publish ({selectedIds.size})
              </>}
            </Button>
            <Button
              size="sm" variant="outline"
              disabled={bulkLoading}
              className="h-8 text-xs text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-500/30"
              onClick={handleBulkUnpublish}>
              {bulkLoading ? "..." : <>
                <Ban className="size-3.5" /> Unpublish ({selectedIds.size})
              </>}
            </Button>
            <Button
              size="sm" variant="outline"
              disabled={bulkLoading}
              className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setShowBulkDeleteDialog(true)}>
              <Trash2 className="size-3.5" /> Delete ({selectedIds.size})
            </Button>
            <Button
              size="sm" variant="ghost"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => setSelectedIds(new Set())}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm shadow-black/[0.02]">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "40px" }} />
          <col style={{ width: "55px" }} />
          <col style={{ width: "110px" }} />
          <col style={{ width: "240px" }} />
          <col style={{ width: "160px" }} />
          <col style={{ width: "130px" }} />
          <col style={{ width: "185px" }} />
        </colgroup>

        <thead>
          <tr className="bg-muted/60 border-b">
            <th className="px-3 py-3 text-center">
              <input
                type="checkbox"
                checked={isAllSelected}
                ref={(el) => { if (el) el.indeterminate = isPartialSelected; }}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded cursor-pointer accent-primary"
              />
            </th>
            <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">ID</th>
            <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Condition</th>
            <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Action</th>
            <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Period</th>
            <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Status</th>
            <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Actions</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-border/60">
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                <div className="flex justify-center mb-3"><FileBox className="size-10 text-muted-foreground/40" /></div>
                <div className="font-medium">No rules yet</div>
                <div className="text-xs mt-1">Click &quot;+ New Rule&quot; to create your first rule</div>
              </td>
            </tr>
          )}
          {paginated.map((rule) => (
            <tr key={rule.id}
              className={`transition-colors ${
                isExpired(rule.endDate)
                  ? "bg-rose-50/40 hover:bg-rose-50 dark:bg-rose-500/5 dark:hover:bg-rose-500/10"
                  : selectedIds.has(rule.id) ? "bg-primary/5 hover:bg-primary/5" : "bg-card hover:bg-muted/40"
              }`}>

              {/* Checkbox */}
              <td className="px-3 py-3 text-center">
                <input
                  type="checkbox"
                  checked={selectedIds.has(rule.id)}
                  onChange={() => toggleSelect(rule.id)}
                  className="w-4 h-4 rounded cursor-pointer accent-primary"
                />
              </td>

              {/* ID */}
              <td className="px-4 py-3 text-center overflow-hidden">
                <span className="font-mono font-semibold text-primary">#{rule.id}</span>
              </td>

              {/* Condition */}
              <td className="px-4 py-3 text-center overflow-hidden">
                <div className="flex flex-col items-center gap-1">
                  <Badge variant="outline" className="font-mono w-fit text-xs">
                    {rule.condition.operator}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {rule.condition.children?.length ?? 0} kondisi
                  </span>
                </div>
              </td>

              {/* Action */}
              <td className="px-4 py-3 overflow-hidden">
                <div
                  title={JSON.stringify(rule.action)}
                  className="font-mono text-xs bg-muted rounded-md px-2 py-1.5 overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground">
                  {JSON.stringify(rule.action)}
                </div>
              </td>

              {/* Period */}
              <td className="px-4 py-3 text-center overflow-hidden">
                {rule.startDate ? (
                  <div className={`text-xs space-y-0.5 ${isExpired(rule.endDate) ? "text-muted-foreground" : "text-foreground"}`}>
                    <div className="flex items-center justify-center gap-1.5">
                      <CalendarRange className="size-3 text-primary shrink-0" />
                      <span>{formatTs(rule.startDate)}</span>
                    </div>
                    {rule.endDate && (
                      <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
                        <span>→</span>
                        <span>{formatTs(rule.endDate)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground italic">Tanpa periode</span>
                )}
              </td>

              {/* Status */}
              <td className="px-4 py-3 text-center overflow-hidden">
                <div className="flex flex-col items-center gap-1">
                  {isExpired(rule.endDate) ? (
                    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full font-medium border bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20">
                      <TimerOff className="size-3" /> Expired
                    </span>
                  ) : (
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full font-medium border
                      ${rule.published
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20"
                        : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20"} `}>
                      <span className={`size-1.5 rounded-full ${rule.published ? "bg-emerald-500" : "bg-slate-400"}`} />
                      {rule.published ? "Published" : "Draft"}
                    </span>
                  )}
                  {!isExpired(rule.endDate) && rule.hasPendingChanges && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-500 font-medium">
                      <RotateCcw className="size-3" /> Pending
                    </span>
                  )}
                </div>
              </td>

              {/* Actions */}
              <td className="px-4 py-3 overflow-hidden">
                <div className="flex items-center justify-center gap-1.5">
                  <Button
                    size="icon-sm"
                    variant="outline"
                    className="text-muted-foreground hover:text-foreground"
                    title="Edit"
                    onClick={() => router.push(`/rules/builder?id=${rule.id}`)}>
                    <Pencil className="size-3.5" />
                  </Button>

                  <Button
                    size="icon-sm"
                    variant="outline"
                    disabled={loadingIds.has(rule.id)}
                    title={rule.published ? "Unpublish" : "Publish"}
                    className={rule.published
                      ? "text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-500/30"
                      : "text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-500/30"}
                    onClick={() => handleTogglePublish(rule)}>
                    {loadingIds.has(rule.id) ? <span className="size-3.5 animate-spin border-2 border-current border-t-transparent rounded-full" /> : rule.published ? <Ban className="size-3.5" /> : <Send className="size-3.5" />}
                  </Button>

                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title="Delete"
                    onClick={() => setDeleteTarget(rule)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
</div>

      {/* Footer + Pagination */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-muted-foreground">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} rules
          </p>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              {/* First */}
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="h-8 w-8 rounded-md border text-xs flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted transition-colors">
                «
              </button>

              {/* Prev */}
              <button
                onClick={() => setCurrentPage((p) => p - 1)}
                disabled={currentPage === 1}
                className="h-8 w-8 rounded-md border text-xs flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted transition-colors">
                ‹
              </button>

              {/* Page numbers */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "..." ? (
                    <span key={`ellipsis-${i}`} className="h-8 w-8 flex items-center justify-center text-xs text-muted-foreground">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p as number)}
                      className={`h-8 w-8 rounded-md border text-xs flex items-center justify-center transition-colors
                        ${currentPage === p
                          ? "bg-primary text-primary-foreground border-primary font-semibold"
                          : "hover:bg-muted"}`}>
                      {p}
                    </button>
                  )
                )}

              {/* Next */}
              <button
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={currentPage === totalPages}
                className="h-8 w-8 rounded-md border text-xs flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted transition-colors">
                ›
              </button>

              {/* Last */}
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="h-8 w-8 rounded-md border text-xs flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted transition-colors">
                »
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Delete Dialog ── */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Rule #{deleteTarget?.id}?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. Deleted rules cannot be restored.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Yes, Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Rules?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. <strong>{selectedIds.size} rules</strong> will be permanently deleted, including any that are already published.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setShowBulkDeleteDialog(false)}
              className="bg-muted text-foreground hover:bg-muted/80">
              Cancel
            </AlertDialogAction>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-destructive text-white hover:bg-destructive/90">
              {bulkDeleting ? "Deleting..." : `Delete ${selectedIds.size} Rules`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}