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

// Format unix timestamp → tanggal readable
const formatTs = (ts?: string) => {
  if (!ts) return "—";
  const date = new Date(Number(ts));
  if (isNaN(date.getTime())) return ts;
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
  const [filterAppName, setFilterAppName] = useState("");
  const [filterObject, setFilterObject]   = useState("");
  const [filterSalesOps, setFilterSalesOps]           = useState("");
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
      console.error("Gagal fetch rules:", e);
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
        toast.success(`Rule #${rule.id} berhasil di-unpublish`);
      } else {
        await publishRules([rule.id]);
        toast.success(`Rule #${rule.id} berhasil di-publish`);
      }
      setRules((rs) =>
        rs.map((r) =>
          r.id === rule.id
            ? { ...r, published: !r.published, hasPendingChanges: false }
            : r
        )
      );
    } catch (e) {
      toast.error(`Gagal mengubah status Rule #${rule.id}`);
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
      toast.success(`Rule #${deleteTarget.id} berhasil dihapus`);
    } catch (e) {
      toast.error(`Gagal menghapus Rule #${deleteTarget.id}`);
    } finally {
      setDeleting(false);
    }
  };

  // Handle apply filter
  const handleFilter = () => {
    const params: Record<string, string> = {};
    if (filterAppName.trim())             params.appName           = filterAppName.trim();
    if (filterObject.trim())              params.object            = filterObject.trim();
    if (filterSalesOps.trim())            params.salesOps          = filterSalesOps.trim();
    if (filterStatus && filterStatus !== "all")   params.published        = filterStatus;
    if (filterPending && filterPending !== "all") params.hasPendingChanges = filterPending;
    fetchRules(Object.keys(params).length > 0 ? params : undefined);
  };

  // Handle reset filter
  const handleReset = () => {
    setFilterAppName("");
    setFilterObject("");
    setFilterSalesOps("");
    setFilterStatus("all");
    setFilterPending("all");
    fetchRules();
  };

  const isFiltered = !!(
    filterAppName.trim() ||
    filterObject.trim() ||
    filterSalesOps.trim() ||
    (filterStatus && filterStatus !== "all") ||
    (filterPending && filterPending !== "all")
  );

  const filtered = rules.filter((r) =>
    search === "" ||
    r.id.toString().includes(search) ||
    JSON.stringify(r).toLowerCase().includes(search.toLowerCase())
  );

  // Reset ke halaman 1 saat filter/search berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterAppName, filterObject, filterSalesOps, filterStatus, filterPending]);

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
      toast.success(`${ids.length} rule berhasil di-publish`);
      setSelectedIds(new Set());
    } catch {
      toast.error("Gagal bulk publish");
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
      toast.success(`${ids.length} rule berhasil di-unpublish`);
      setSelectedIds(new Set());
    } catch {
      toast.error("Gagal bulk unpublish");
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
      toast.success(`${selectedIds.size} rule berhasil dihapus`);
      setSelectedIds(new Set());
      setShowBulkDeleteDialog(false);
    } catch {
      toast.error("Gagal bulk delete");
    } finally {
      setBulkDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-muted-foreground">
        <span className="animate-spin text-xl">⏳</span>
        <span className="text-sm font-medium">Memuat rules...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rules Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Kelola dan publish business rules · Publishing Service
          </p>
        </div>
        <Button onClick={() => router.push("/rules/builder")} className="gap-2">
          + Rule Baru
        </Button>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Rules",     value: rules.length,                                    color: "text-blue-500",   bg: "bg-blue-50 dark:bg-blue-950",   icon: "📋" },
          { label: "Published",       value: rules.filter((r) => r.published).length,         color: "text-green-600",  bg: "bg-green-50 dark:bg-green-950", icon: "✅" },
          { label: "Pending Changes", value: rules.filter((r) => r.hasPendingChanges).length, color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950", icon: "⏳" },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border p-4 flex items-center gap-4 ${s.bg}`}>
            <span className="text-3xl">{s.icon}</span>
            <div>
              <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground font-medium mt-0.5">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter Bar ── */}
      <div className="flex flex-wrap items-end gap-3 mb-4 p-4 rounded-xl border bg-muted/30">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">App Name</label>
          <input
            value={filterAppName}
            onChange={(e) => setFilterAppName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFilter()}
            placeholder="contoh: drools-promotion"
            className="px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-ring w-44"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Object</label>
          <input
            value={filterObject}
            onChange={(e) => setFilterObject(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFilter()}
            placeholder="contoh: customer"
            className="px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-ring w-40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sales Org</label>
          <input
            value={filterSalesOps}
            onChange={(e) => setFilterSalesOps(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFilter()}
            placeholder="contoh: DSO"
            className="px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-ring w-36"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</label>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as "" | "true" | "false")}>
            <SelectTrigger className="w-36 bg-background">
              <SelectValue placeholder="Semua" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua</SelectItem>
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
              <SelectValue placeholder="Semua" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua</SelectItem>
              <SelectItem value="true">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                  Ada Pending
                </span>
              </SelectItem>
              <SelectItem value="false">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                  Tidak Ada
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 mb-0.5">
          <Button onClick={handleFilter} className="h-9 px-4">
            🔍 Filter
          </Button>
          {isFiltered && (
            <Button onClick={handleReset} variant="outline" className="h-9 px-4">
              ✕ Reset
            </Button>
          )}
        </div>

        {/* Active filter badges */}
        {isFiltered && (
          <div className="w-full flex items-center gap-2 flex-wrap pt-1">
            <span className="text-xs text-muted-foreground">Filter aktif:</span>
            {filterAppName.trim() && <Badge variant="secondary" className="text-xs">App Name: {filterAppName}</Badge>}
            {filterObject.trim() && <Badge variant="secondary" className="text-xs">Object: {filterObject}</Badge>}
            {filterSalesOps.trim() && <Badge variant="secondary" className="text-xs">Sales Org: {filterSalesOps}</Badge>}
            {filterStatus && filterStatus !== "all" && <Badge variant="secondary" className="text-xs">Status: {filterStatus === "true" ? "Published" : "Draft"}</Badge>}
            {filterPending && filterPending !== "all" && <Badge variant="secondary" className="text-xs">Pending: {filterPending === "true" ? "Ada" : "Tidak Ada"}</Badge>}
          </div>
        )}
      </div>

      {/* ── Search ── */}
      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">🔍</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari berdasarkan ID, kondisi, atau action..."
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-ring transition"
        />
      </div>

      {/* Bulk Action Bar — muncul hanya saat ada yang dipilih */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 mb-2 rounded-lg border bg-primary/5 border-primary/20">
          <span className="text-sm font-medium text-primary">
            {selectedIds.size} rule dipilih
          </span>
          <div className="flex gap-2 ml-auto">
            <Button
              size="sm" variant="outline"
              disabled={bulkLoading}
              className="h-8 text-xs text-green-600 border-green-300 hover:bg-green-50"
              onClick={handleBulkPublish}>
              {bulkLoading ? "..." : `✅ Publish (${selectedIds.size})`}
            </Button>
            <Button
              size="sm" variant="outline"
              disabled={bulkLoading}
              className="h-8 text-xs text-orange-500 border-orange-300 hover:bg-orange-50"
              onClick={handleBulkUnpublish}>
              {bulkLoading ? "..." : `⏸ Unpublish (${selectedIds.size})`}
            </Button>
            <Button
              size="sm" variant="outline"
              disabled={bulkLoading}
              className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setShowBulkDeleteDialog(true)}>
              🗑️ Hapus ({selectedIds.size})
            </Button>
            <Button
              size="sm" variant="ghost"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => setSelectedIds(new Set())}>
              ✕ Batal
            </Button>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="rounded-xl border overflow-hidden shadow-sm">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "40px" }} />
          <col style={{ width: "55px" }} />
          <col style={{ width: "110px" }} />
          <col style={{ width: "240px" }} />
          <col style={{ width: "120px" }} />
          <col style={{ width: "130px" }} />
          <col style={{ width: "100px" }} />
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
            <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Kondisi</th>
            <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Action</th>
            <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">App</th>
            <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Periode</th>
            <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Status</th>
            <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Aksi</th>
          </tr>
        </thead>

        <tbody className="divide-y">
          {filtered.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                <div className="text-3xl mb-2">📭</div>
                <div className="font-medium">Belum ada rules</div>
                <div className="text-xs mt-1">Klik &quot;+ Rule Baru&quot; untuk membuat rule pertama</div>
              </td>
            </tr>
          )}
          {paginated.map((rule, i) => (
            <tr key={rule.id}
              className={`transition-colors hover:bg-muted/40 ${
                selectedIds.has(rule.id)
                  ? "bg-primary/5"
                  : i % 2 === 0 ? "bg-background" : "bg-muted/20"
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

              {/* Kondisi */}
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

              {/* App */}
              <td className="px-4 py-3 text-center overflow-hidden">
                <span className="text-xs bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-md font-medium">
                  {rule.appName}
                </span>
              </td>

              {/* Periode */}
              <td className="px-4 py-3 text-center overflow-hidden">
                {rule.startDate ? (
                  <div className="text-xs space-y-0.5">
                    <div className="flex items-center justify-center gap-1 text-green-600">
                      <span>▶</span>
                      <span>{formatTs(rule.startDate)}</span>
                    </div>
                    {rule.endDate && (
                      <div className="flex items-center justify-center gap-1 text-red-500">
                        <span>⏹</span>
                        <span>{formatTs(rule.endDate)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground italic">Tidak ada</span>
                )}
              </td>

              {/* Status */}
              <td className="px-4 py-3 text-center overflow-hidden">
                <div className="flex flex-col items-center gap-1">
                  <Badge
                    variant="outline"
                    className={`w-fit text-xs font-medium ${
                      rule.published
                        ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-900 dark:text-green-300"
                        : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                    }`}>
                    {rule.published ? "● Published" : "○ Draft"}
                  </Badge>
                  {rule.hasPendingChanges && (
                    <Badge variant="outline" className="w-fit text-xs text-orange-500 border-orange-300">
                      ⏳ Pending
                    </Badge>
                  )}
                </div>
              </td>

              {/* Aksi */}
              <td className="px-4 py-3 overflow-hidden">
                <div className="flex items-center justify-start gap-1.5">
                  {/* {rule.published ? (
                    // Published → tombol View (read-only)
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-15 px-2 text-xs text-blue-500 border-blue-300 hover:bg-blue-50"
                      onClick={() => router.push(`/rules/builder?id=${rule.id}&mode=view`)}>
                      👁️ View
                    </Button>
                  ) : (
                    // Draft → tombol Edit
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-15 px-2 text-xs"
                      onClick={() => router.push(`/rules/builder?id=${rule.id}`)}>
                      ✏️ Edit
                    </Button>
                  )} */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-15 px-2 text-xs"
                    onClick={() => router.push(`/rules/builder?id=${rule.id}`)}>
                    ✏️ Edit
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loadingIds.has(rule.id)}
                    className={`h-7 w-24 text-xs ${
                      rule.published
                        ? "text-orange-500 border-orange-300 hover:bg-orange-50"
                        : "text-green-600 border-green-300 hover:bg-green-50"
                    }`}
                    onClick={() => handleTogglePublish(rule)}>
                    {loadingIds.has(rule.id) ? "..." : rule.published ? "Unpublish" : "Publish"}
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteTarget(rule)}>
                    🗑️
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
            Menampilkan {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} dari {filtered.length} rules
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

      {/* ── Dialog Hapus ── */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Rule #{deleteTarget?.id}?</DialogTitle>
            <DialogDescription>
              Tindakan ini tidak bisa dibatalkan. Rule yang sudah dihapus tidak bisa dikembalikan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Menghapus..." : "Ya, Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {selectedIds.size} Rule?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak bisa dibatalkan. Sebanyak <strong>{selectedIds.size} rule</strong> akan dihapus permanen termasuk yang sudah published.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setShowBulkDeleteDialog(false)}
              className="bg-muted text-foreground hover:bg-muted/80">
              Batal
            </AlertDialogAction>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-destructive text-white hover:bg-destructive/90">
              {bulkDeleting ? "Menghapus..." : `Hapus ${selectedIds.size} Rule`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}