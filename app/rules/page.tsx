"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { getRules, deleteRule, publishRules, unpublishRules, createRules, GetRulesParams } from "@/lib/api";
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
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Layers,
  Workflow,
  Plus,
  Search,
  Filter,
  RotateCcw,
  CheckCircle2,
  Clock,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Sparkles,
  Calendar,
  AlertTriangle,
  Zap,
  Code2,
  Check,
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
  condition: RuleCondition;
  action: Record<string, unknown> | unknown[];
  published: boolean;
  hasPendingChanges: boolean;
  appName?: string;
  startDate?: string;
  endDate?: string;
}

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

export default function RulesPage() {
  const router = useRouter();
  const { isLoggedIn, isInitialized } = useAuthStore();
  const [rules, setRules] = useState<Rule[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set());
  const [filterObject, setFilterObject] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "all" | "true" | "false">("all");
  const [filterPending, setFilterPending] = useState<"" | "all" | "true" | "false">("all");
  const [appliedFilters, setAppliedFilters] = useState<{
    object: string;
    published: "" | "all" | "true" | "false";
    hasPendingChanges: "" | "all" | "true" | "false";
  }>({
    object: "",
    published: "all",
    hasPendingChanges: "all",
  });
  const [stats, setStats] = useState({
    total: 0,
    published: 0,
    pending: 0,
  });
  const [jumpPageInput, setJumpPageInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  // Modal Create / Import via JSON state
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [autoPublishAfterCreate, setAutoPublishAfterCreate] = useState(false);
  const [creatingFromJson, setCreatingFromJson] = useState(false);

  useEffect(() => {
    if (isInitialized && !isLoggedIn) router.push("/login");
  }, [isInitialized, isLoggedIn, router]);

  const fetchGlobalStats = useCallback(async () => {
    try {
      const res = await getRules({ summary: true, size: 100 });
      let allSummary: Rule[] = res.data.data ?? res.data ?? [];
      const headerPages = res.headers?.["x-total-pages"];
      const pages = headerPages ? parseInt(headerPages, 10) : 1;
      if (!isNaN(pages) && pages > 1) {
        const remainingPromises = [];
        for (let p = 1; p < pages; p++) {
          remainingPromises.push(getRules({ summary: true, page: p, size: 100 }));
        }
        const remainingRes = await Promise.all(remainingPromises);
        for (const r of remainingRes) {
          allSummary = allSummary.concat(r.data.data ?? r.data ?? []);
        }
      }
      const headerCount = res.headers?.["x-total-count"];
      const parsedCount = headerCount ? parseInt(headerCount, 10) : allSummary.length;
      setStats({
        total: !isNaN(parsedCount) && parsedCount > 0 ? parsedCount : allSummary.length,
        published: allSummary.filter((r) => r.published).length,
        pending: allSummary.filter((r) => r.hasPendingChanges).length,
      });
    } catch (e) {
      console.error("Gagal fetch global stats:", e);
    }
  }, []);

  const fetchRules = useCallback(
    async (
      page = currentPage,
      size = pageSize,
      filters = appliedFilters
    ) => {
      setLoading(true);
      try {
        const params: GetRulesParams = {
          page: page - 1, // backend is 0-indexed
          size,
        };
        if (filters.object.trim()) params.object = filters.object.trim();
        if (filters.published && filters.published !== "all") {
          params.published = filters.published === "true";
        }
        if (filters.hasPendingChanges && filters.hasPendingChanges !== "all") {
          params.hasPendingChanges = filters.hasPendingChanges === "true";
        }

        const res = await getRules(params);
        const data: Rule[] = res.data.data ?? res.data ?? [];
        setRules(data);

        const headerCount = res.headers?.["x-total-count"];
        const headerPages = res.headers?.["x-total-pages"];

        let count = data.length;
        if (headerCount !== undefined) {
          const parsed = parseInt(headerCount, 10);
          if (!isNaN(parsed)) count = parsed;
        }
        setTotalCount(count);

        if (headerPages !== undefined) {
          const parsedPages = parseInt(headerPages, 10);
          setTotalPages(isNaN(parsedPages) || parsedPages < 1 ? 1 : parsedPages);
        } else {
          setTotalPages(Math.max(1, Math.ceil(count / size)));
        }
      } catch (e) {
        console.error("Gagal fetch rules:", e);
        toast.error("Gagal memuat data rules dari server");
      } finally {
        setLoading(false);
      }
    },
    [currentPage, pageSize, appliedFilters]
  );

  useEffect(() => {
    if (isInitialized && isLoggedIn) {
      fetchRules(currentPage, pageSize, appliedFilters);
    }
  }, [isInitialized, isLoggedIn, currentPage, pageSize, appliedFilters, fetchRules]);

  useEffect(() => {
    if (isInitialized && isLoggedIn) {
      fetchGlobalStats();
    }
  }, [isInitialized, isLoggedIn, fetchGlobalStats]);

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
      fetchGlobalStats();
    } catch {
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
      toast.success(`Rule #${deleteTarget.id} berhasil dihapus`);
      setDeleteTarget(null);
      fetchGlobalStats();
      if (rules.length === 1 && currentPage > 1) {
        setCurrentPage((p) => p - 1);
      } else {
        fetchRules(currentPage, pageSize, appliedFilters);
      }
    } catch {
      toast.error(`Gagal menghapus Rule #${deleteTarget.id}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleFilter = () => {
    setCurrentPage(1);
    setAppliedFilters({
      object: filterObject.trim(),
      published: filterStatus,
      hasPendingChanges: filterPending,
    });
  };

  const handleReset = () => {
    setFilterObject("");
    setFilterStatus("all");
    setFilterPending("all");
    setCurrentPage(1);
    setAppliedFilters({
      object: "",
      published: "all",
      hasPendingChanges: "all",
    });
  };

  const isFiltered = !!(
    appliedFilters.object ||
    appliedFilters.published !== "all" ||
    appliedFilters.hasPendingChanges !== "all"
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return rules;
    const q = search.toLowerCase();
    return rules.filter(
      (r) =>
        r.id.toString().includes(q) ||
        JSON.stringify(r).toLowerCase().includes(q)
    );
  }, [rules, search]);

  const paginated = filtered;

  const handlePageSizeChange = (val: number) => {
    setPageSize(val);
    setCurrentPage(1);
  };

  const getPaginationRange = (current: number, total: number) => {
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [];
    const left = Math.max(2, current - 1);
    const right = Math.min(total - 1, current + 1);

    pages.push(1);
    if (left > 2) pages.push("...");
    for (let i = left; i <= right; i++) {
      pages.push(i);
    }
    if (right < total - 1) pages.push("...");
    pages.push(total);
    return pages;
  };

  const handleJumpPage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const pageNum = parseInt(jumpPageInput.trim(), 10);
    if (isNaN(pageNum)) {
      toast.error("Masukkan angka nomor halaman yang valid");
      return;
    }
    if (pageNum < 1 || pageNum > totalPages) {
      toast.error(`Nomor halaman harus antara 1 dan ${totalPages}`);
      return;
    }
    setCurrentPage(pageNum);
    setJumpPageInput("");
  };

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
      setRules((rs) =>
        rs.map((r) =>
          selectedIds.has(r.id) ? { ...r, published: true, hasPendingChanges: false } : r
        )
      );
      toast.success(`${ids.length} rule berhasil di-publish`);
      setSelectedIds(new Set());
      fetchGlobalStats();
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
      setRules((rs) =>
        rs.map((r) =>
          selectedIds.has(r.id) ? { ...r, published: false, hasPendingChanges: false } : r
        )
      );
      toast.success(`${ids.length} rule berhasil di-unpublish`);
      setSelectedIds(new Set());
      fetchGlobalStats();
    } catch {
      toast.error("Gagal bulk unpublish");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await Promise.all([...selectedIds].map((id) => deleteRule(id)));
      toast.success(`${selectedIds.size} rule berhasil dihapus`);
      setSelectedIds(new Set());
      setShowBulkDeleteDialog(false);
      fetchGlobalStats();
      if (rules.length <= selectedIds.size && currentPage > 1) {
        setCurrentPage((p) => p - 1);
      } else {
        fetchRules(currentPage, pageSize, appliedFilters);
      }
    } catch {
      toast.error("Gagal bulk delete");
    } finally {
      setBulkDeleting(false);
    }
  };

  // Validasi format JSON di modal Paste JSON
  const jsonModalStatus = (() => {
    if (!jsonInput.trim()) {
      return { valid: false, count: 0, error: null };
    }
    try {
      const parsed = JSON.parse(jsonInput);
      if (typeof parsed !== "object" || parsed === null) {
        return { valid: false, count: 0, error: "JSON harus berupa object rule atau array" };
      }
      const items = Array.isArray(parsed) ? parsed : [parsed];
      if (items.length === 0) {
        return { valid: false, count: 0, error: "Array tidak boleh kosong" };
      }
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || typeof item !== "object") {
          return { valid: false, count: 0, error: `Item ke-${i + 1} bukan object rule valid` };
        }
        if (!item.condition || typeof item.condition !== "object") {
          return { valid: false, count: 0, error: `Item ke-${i + 1} wajib memiliki field 'condition'` };
        }
        if (!item.action || typeof item.action !== "object") {
          return { valid: false, count: 0, error: `Item ke-${i + 1} wajib memiliki field 'action'` };
        }
      }
      return { valid: true, count: items.length, error: null };
    } catch (e: unknown) {
      return { valid: false, count: 0, error: (e as Error).message };
    }
  })();

  // Simpan rule langsung dari input JSON modal
  const handleCreateFromJson = async () => {
    setCreatingFromJson(true);
    try {
      const parsed = JSON.parse(jsonInput);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      const cleaned = items.map((r) => {
        const item: Record<string, unknown> = {
          condition: r.condition,
          action: r.action,
        };
        if (r.startDate) item.startDate = r.startDate;
        if (r.endDate) item.endDate = r.endDate;
        return item;
      });

      const res = await createRules(cleaned);
      const createdIds: number[] = [];
      if (Array.isArray(res.data?.data)) {
        createdIds.push(...res.data.data.map(Number).filter((n: number) => !isNaN(n) && n > 0));
      } else if (res.data?.data) {
        const singleId = Number(res.data.data);
        if (!isNaN(singleId) && singleId > 0) createdIds.push(singleId);
      }

      if (autoPublishAfterCreate && createdIds.length > 0) {
        try {
          await publishRules(createdIds);
          toast.success(`${createdIds.length} rule berhasil dibuat dan dipublish ke engine!`);
        } catch {
          toast.warning(`${createdIds.length} rule dibuat sebagai draft (namun gagal dipublish).`);
        }
      } else {
        toast.success(`${cleaned.length} rule baru berhasil dibuat!`);
      }

      setShowJsonModal(false);
      setJsonInput("");
      fetchGlobalStats();
      setCurrentPage(1);
      await fetchRules(1, pageSize, appliedFilters);
    } catch (err: unknown) {
      console.error("Gagal simpan rule dari JSON:", err);
      const errObj = err as {
        response?: { data?: { errors?: { message?: string }[]; message?: string } };
        message?: string;
      };
      const msg =
        errObj.response?.data?.errors?.[0]?.message ||
        errObj.response?.data?.message ||
        errObj.message ||
        "Gagal membuat rule dari JSON. Periksa kembali strukturnya.";
      toast.error(msg);
    } finally {
      setCreatingFromJson(false);
    }
  };

  // Navigasi ke visual flow builder dengan mengoper rule yang dipaste
  const handleOpenInBuilder = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      const singleRule = Array.isArray(parsed) ? parsed[0] : parsed;
      if (!singleRule || typeof singleRule !== "object") {
        toast.error("Format JSON tidak valid");
        return;
      }
      sessionStorage.setItem("imported_rule_json", JSON.stringify(singleRule));
      setShowJsonModal(false);
      router.push("/rules/builder");
    } catch (err: unknown) {
      toast.error(`JSON Syntax Error: ${(err as Error).message}`);
    }
  };

  if (loading && rules.length === 0 && totalCount === 0) {
    return (
      <div className="flex items-center justify-center min-h-[500px] gap-3 text-muted-foreground">
        <span className="w-5 h-5 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
        <span className="text-xs font-medium">Memuat katalog rules...</span>
      </div>
    );
  }

  const totalRules = stats.total > 0 ? stats.total : (totalCount > 0 ? totalCount : rules.length);
  const publishedCount = stats.published > 0 ? stats.published : rules.filter((r) => r.published).length;
  const pendingCount = stats.pending > 0 ? stats.pending : rules.filter((r) => r.hasPendingChanges).length;

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto flex flex-col gap-6">
      {/* ─── Header ─── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Procedures & Rules
            </h1>
            <Badge variant="outline" className="text-xs font-mono">
              {totalRules} Rules
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Kelola, visualisasikan, dan publish business rule ke Drools Publishing Service
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            onClick={() => router.push("/evaluate")}
            className="h-9 text-xs rounded-xl gap-1.5 border-border hover:bg-muted"
          >
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Test Runner</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => setShowJsonModal(true)}
            className="h-9 px-3.5 text-xs font-semibold rounded-xl gap-2 border-border hover:bg-muted"
          >
            <Code2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Paste JSON</span>
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

      {/* ─── Stats Cards (Maciej Kuropatwa Style) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-blue-200/70 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 p-4 flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{totalRules}</div>
            <div className="text-[11px] font-medium text-muted-foreground">Total Rules Terdaftar</div>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200/70 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {publishedCount}
            </div>
            <div className="text-[11px] font-medium text-muted-foreground">Active / Published</div>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200/70 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 p-4 flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-amber-600/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {pendingCount}
            </div>
            <div className="text-[11px] font-medium text-muted-foreground">Pending Changes</div>
          </div>
        </div>
      </div>

      {/* ─── Search & Filter Toolbar ─── */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-xs flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari ID, fact, condition, atau action..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-border bg-muted/20 outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={filterObject}
              onChange={(e) => setFilterObject(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFilter()}
              placeholder="Filter Object..."
              className="px-3 py-2 text-xs rounded-xl border border-border bg-muted/20 outline-none focus:ring-2 focus:ring-primary w-32"
            />

            <Select
              value={filterStatus}
              onValueChange={(v) => setFilterStatus(v as "" | "all" | "true" | "false")}
            >
              <SelectTrigger className="h-8.5 w-32 text-xs rounded-xl bg-muted/20 border-border">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="true">Published</SelectItem>
                <SelectItem value="false">Draft</SelectItem>
              </SelectContent>
            </Select>

            <Button
              type="button"
              size="sm"
              onClick={handleFilter}
              className="h-8.5 px-3 text-xs gap-1.5 rounded-xl"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filter</span>
            </Button>

            {isFiltered && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleReset}
                className="h-8.5 px-2.5 text-xs rounded-xl text-muted-foreground"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-primary/5 border border-primary/20 animate-in fade-in duration-150">
            <span className="text-xs font-semibold text-primary">
              {selectedIds.size} rule terseleksi
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={bulkLoading}
                className="h-7 text-xs text-emerald-600 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 rounded-lg"
                onClick={handleBulkPublish}
              >
                Publish ({selectedIds.size})
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkLoading}
                className="h-7 text-xs text-amber-600 border-amber-300 dark:border-amber-800 hover:bg-amber-50 rounded-lg"
                onClick={handleBulkUnpublish}
              >
                Unpublish ({selectedIds.size})
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkLoading}
                className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 rounded-lg"
                onClick={() => setShowBulkDeleteDialog(true)}
              >
                Hapus ({selectedIds.size})
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground rounded-lg"
                onClick={() => setSelectedIds(new Set())}
              >
                Batal
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Procedure Rules Table ─── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/80 bg-muted/40">
                <th className="w-10 px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isPartialSelected;
                    }}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded cursor-pointer accent-primary"
                  />
                </th>
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
            <tbody className="divide-y divide-border/60">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <div className="w-12 h-12 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-2 text-muted-foreground">
                      <Layers className="w-6 h-6" />
                    </div>
                    <div className="font-semibold text-foreground text-sm">Tidak ada rule yang cocok</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Ubah filter pencarian atau klik &quot;New Flow Procedure&quot; untuk membuat rule baru.
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map((rule) => {
                  const isSelected = selectedIds.has(rule.id);
                  const isRuleLoading = loadingIds.has(rule.id);
                  const temporal = getRuleTemporalStatus(rule);
                  const { objects } = extractFactsFromCondition(rule.condition);
                  const actionEntries: [string, unknown][] =
                    rule.action && typeof rule.action === "object" && !Array.isArray(rule.action)
                      ? Object.entries(rule.action)
                      : [];

                  return (
                    <tr
                      key={rule.id}
                      className={`hover:bg-muted/40 transition-colors ${
                        isSelected ? "bg-primary/5" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(rule.id)}
                          className="w-3.5 h-3.5 rounded cursor-pointer accent-primary"
                        />
                      </td>

                      {/* ID */}
                      <td className="px-4 py-3 font-mono font-bold text-primary">
                        <span className="bg-primary/10 px-2 py-0.5 rounded-md">#{rule.id}</span>
                      </td>

                      {/* WHEN: Condition & Fact Target */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="font-bold px-1.5 py-0.2 rounded bg-muted text-foreground text-[10px]">
                            {rule.condition?.operator || "AND"}
                          </span>
                          <span className="text-foreground text-[11px] font-semibold truncate max-w-[200px]">
                            {objects.length > 0 ? objects.join(", ") : "Universal Fact"}
                          </span>
                          <span className="text-muted-foreground text-[10px]">
                            ({rule.condition?.children?.length ?? 1} kriteria)
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
                              {rule.action ? JSON.stringify(rule.action).slice(0, 30) : "No action"}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Temporal Validity */}
                      <td className="px-4 py-3 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                        {rule.startDate || rule.endDate ? (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span>
                              {formatTs(rule.startDate)} s/d {formatTs(rule.endDate)}
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
                              <Calendar className="w-3.5 h-3.5" />
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

                          {rule.hasPendingChanges && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Pending
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Quick Actions */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {/* Open in Flow Builder */}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs rounded-xl gap-1.5 border-border hover:bg-primary/10 hover:text-primary hover:border-primary/40 font-medium shadow-2xs"
                            onClick={() => router.push(`/rules/builder?id=${rule.id}`)}
                            title="Buka di Visual Flow Builder"
                          >
                            <Workflow className="w-3.5 h-3.5" />
                            <span>Flow</span>
                          </Button>

                          {/* Toggle Publish */}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isRuleLoading}
                            className={`h-7 px-2.5 text-xs rounded-xl min-w-[88px] justify-center gap-1.5 font-medium shadow-2xs transition-all ${
                              rule.published
                                ? "text-amber-600 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950"
                                : "text-emerald-600 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                            }`}
                            onClick={() => handleTogglePublish(rule)}
                          >
                            {isRuleLoading ? (
                              <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                            ) : rule.published ? (
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

                          {/* Delete */}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors shrink-0"
                            onClick={() => setDeleteTarget(rule)}
                            title="Hapus Rule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

        {/* ─── Advanced Interactive Pagination ─── */}
        {(totalCount > 0 || filtered.length > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 border-t border-border/80 bg-muted/20">
            {/* Left: Summary & Page Size Selector */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                Menampilkan{" "}
                <strong className="text-foreground font-semibold">
                  {totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
                  {Math.min(currentPage * pageSize, totalCount)}
                </strong>{" "}
                dari{" "}
                <strong className="text-foreground font-semibold">{totalCount}</strong> rules
                {search.trim() && ` (${filtered.length} cocok di hal ini)`}
              </span>

              <div className="hidden sm:flex items-center gap-1.5 pl-3 border-l border-border/60">
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">Baris per hal:</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(val) => handlePageSizeChange(Number(val))}
                >
                  <SelectTrigger className="h-7 w-[68px] text-xs rounded-lg bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="10" className="text-xs">10</SelectItem>
                    <SelectItem value="20" className="text-xs">20</SelectItem>
                    <SelectItem value="50" className="text-xs">50</SelectItem>
                    <SelectItem value="100" className="text-xs">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Right: Page Navigation & Jump to Page */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Quick navigation: First, Prev, Page Numbers, Next, Last */}
              <div className="flex items-center gap-1">
                {/* First Page */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={currentPage <= 1}
                  className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                  onClick={() => setCurrentPage(1)}
                  title="Halaman Pertama"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </Button>

                {/* Prev Page */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={currentPage <= 1}
                  className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  title="Halaman Sebelumnya"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>

                {/* Numbered Page Buttons */}
                <div className="hidden sm:flex items-center gap-1">
                  {getPaginationRange(currentPage, totalPages).map((p, idx) => {
                    if (p === "...") {
                      return (
                        <span
                          key={`ellipsis-${idx}`}
                          className="w-7 h-7 flex items-center justify-center text-xs text-muted-foreground select-none"
                        >
                          …
                        </span>
                      );
                    }
                    const pageNum = Number(p);
                    const isActive = pageNum === currentPage;
                    return (
                      <Button
                        key={`page-${pageNum}`}
                        type="button"
                        size="sm"
                        variant={isActive ? "default" : "outline"}
                        className={`h-7 w-7 p-0 text-xs rounded-lg transition-all ${
                          isActive
                            ? "bg-primary text-primary-foreground font-bold shadow-xs"
                            : "text-muted-foreground hover:text-foreground hover:border-border"
                        }`}
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                {/* Mobile Current / Total */}
                <span className="sm:hidden text-xs text-muted-foreground px-1 font-mono">
                  {currentPage}/{totalPages}
                </span>

                {/* Next Page */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={currentPage >= totalPages}
                  className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  title="Halaman Berikutnya"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>

                {/* Last Page */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={currentPage >= totalPages}
                  className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                  onClick={() => setCurrentPage(totalPages)}
                  title="Halaman Terakhir"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Jump To Page Box */}
              {totalPages > 1 && (
                <form
                  onSubmit={handleJumpPage}
                  className="flex items-center gap-1.5 pl-2 border-l border-border/60"
                >
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Loncat ke:</span>
                  <Input
                    type="number"
                    min={1}
                    max={totalPages}
                    placeholder={String(currentPage)}
                    value={jumpPageInput}
                    onChange={(e) => setJumpPageInput(e.target.value)}
                    className="h-7 w-14 text-xs text-center px-1 font-mono rounded-lg bg-background border-border"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs rounded-lg font-semibold hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                    disabled={!jumpPageInput.trim()}
                  >
                    Go
                  </Button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Delete Single Modal ─── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold">
              Hapus Rule #{deleteTarget?.id}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Tindakan ini tidak dapat dibatalkan. Rule akan dihapus secara permanen dari database
              Publishing Service.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl text-xs h-8">Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90 text-white rounded-xl text-xs h-8"
            >
              {deleting ? "Menghapus..." : "Ya, Hapus Rule"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Bulk Modal ─── */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold">
              Hapus {selectedIds.size} Rule Sekaligus?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Semua rule yang dipilih akan dihapus secara permanen dari Publishing Service.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl text-xs h-8">Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-destructive hover:bg-destructive/90 text-white rounded-xl text-xs h-8"
            >
              {bulkDeleting ? "Menghapus..." : "Hapus Semua Terpilih"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Create from JSON Modal ─── */}
      <Dialog open={showJsonModal} onOpenChange={setShowJsonModal}>
        <DialogContent className="max-w-2xl rounded-3xl p-6">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
                <Code2 className="w-4 h-4" />
              </div>
              <DialogTitle className="text-base font-bold">
                Create Rule via JSON
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Tempel (copy-paste) payload JSON rule secara langsung. Mendukung single rule object ataupun array multiple rules.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Rule Payload (JSON)</span>
                {jsonModalStatus.valid ? (
                  <Badge variant="secondary" className="text-[10px] py-0 px-2 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                    ✓ Valid ({jsonModalStatus.count} rule terdeteksi)
                  </Badge>
                ) : jsonInput.trim() ? (
                  <Badge variant="destructive" className="text-[10px] py-0 px-2">
                    Invalid JSON
                  </Badge>
                ) : null}
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const sample = {
                      condition: {
                        operator: "AND",
                        children: [
                          {
                            operator: "EQUAL",
                            object: "Customer",
                            attribute: "membershipTier",
                            value: "GOLD",
                          },
                          {
                            operator: "MORE_THAN_OR_EQUAL",
                            object: "Transaction",
                            attribute: "totalAmount",
                            value: 250000,
                          },
                        ],
                      },
                      action: {
                        discount: 15,
                        eligiblePromo: true,
                        message: "Diskon 15% untuk Member Gold",
                      },
                      startDate: "2026-01-01T00:00:00.000Z",
                      endDate: "2026-12-31T23:59:59.000Z",
                    };
                    setJsonInput(JSON.stringify(sample, null, 2));
                  }}
                  className="h-7 text-[11px] gap-1 rounded-xl"
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  Contoh Single
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const sampleArray = [
                      {
                        condition: {
                          operator: "AND",
                          children: [
                            {
                              operator: "EQUAL",
                              object: "Customer",
                              attribute: "membershipTier",
                              value: "GOLD",
                            },
                          ],
                        },
                        action: {
                          discount: 10,
                          message: "Promo Gold",
                        },
                      },
                      {
                        condition: {
                          operator: "AND",
                          children: [
                            {
                              operator: "EQUAL",
                              object: "Customer",
                              attribute: "membershipTier",
                              value: "PLATINUM",
                            },
                          ],
                        },
                        action: {
                          discount: 20,
                          message: "Promo Platinum",
                        },
                      },
                    ];
                    setJsonInput(JSON.stringify(sampleArray, null, 2));
                  }}
                  className="h-7 text-[11px] gap-1 rounded-xl"
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  Contoh Batch
                </Button>
              </div>
            </div>

            {jsonModalStatus.error && (
              <div className="p-2.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{jsonModalStatus.error}</span>
              </div>
            )}

            <div className="relative">
              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder={'Paste JSON rule di sini...\nContoh:\n{\n  "condition": { ... },\n  "action": { ... }\n}'}
                rows={12}
                className="w-full p-3.5 rounded-2xl font-mono text-xs bg-slate-950 text-slate-100 border border-border focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
              />
            </div>

            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/40 border border-border/60">
              <input
                type="checkbox"
                id="auto-publish-chk"
                checked={autoPublishAfterCreate}
                onChange={(e) => setAutoPublishAfterCreate(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary h-4 w-4"
              />
              <label htmlFor="auto-publish-chk" className="text-xs cursor-pointer select-none text-foreground">
                <span className="font-medium">Langsung publish ke Drools Engine</span>
                <span className="text-muted-foreground block text-[11px]">
                  Rule akan langsung dikompilasi ke DRL dan siap dievaluasi tanpa perlu aksi publish manual
                </span>
              </label>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              disabled={!jsonModalStatus.valid}
              onClick={handleOpenInBuilder}
              className="text-xs h-9 rounded-xl gap-1.5"
            >
              <Workflow className="w-3.5 h-3.5 text-blue-600" />
              <span>Buka di Flow Builder</span>
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowJsonModal(false)}
                className="text-xs h-9 rounded-xl"
              >
                Batal
              </Button>
              <Button
                type="button"
                disabled={!jsonModalStatus.valid || creatingFromJson}
                onClick={handleCreateFromJson}
                className="text-xs h-9 rounded-xl font-semibold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
              >
                {creatingFromJson ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Simpan {jsonModalStatus.count > 1 ? `${jsonModalStatus.count} Rules` : "Rule"}</span>
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
