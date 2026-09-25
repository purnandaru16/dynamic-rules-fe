"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  RuleConditionNode,
  mkGroup,
  updateNode,
  removeNode,
  addChild,
  uid,
  type ConditionNode,
  NO_VALUE_OPS,
} from "@/components/RuleConditionNode";
import { OBJECT_DEFINITIONS } from "@/lib/objects";
import { createRule, getRuleById, updateRules, publishRules } from "@/lib/api";
import { toast } from "sonner";
import { VisualRuleBuilder, type ActionEntry } from "@/components/VisualRuleBuilder";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  ArrowLeft,
  Save,
  Calendar as CalendarIcon,
  Clock,
  Workflow,
  GitBranch,
  Code2,
  CheckCircle2,
  Plus,
  ChevronDown,
  Send,
  Sparkles,
  Copy,
  ArrowUpRight,
  AlertTriangle,
} from "lucide-react";

// ─── Convert tree → backend payload ────────────────────────────────
const treeToPayload = (node: ConditionNode): Record<string, unknown> | null => {
  if (node.type === "group") {
    const children = node.children
      .map(treeToPayload)
      .filter(Boolean);
    return {
      operator: node.operator,
      children,
    };
  }

  // Skip leaf yang belum lengkap
  if (!node.object || !node.attribute || !node.operator) return null;

  const leaf: Record<string, unknown> = {
    operator: node.operator,
    object: node.object,
    attribute: node.attribute,
  };

  if (NO_VALUE_OPS.has(node.operator)) {
    return leaf;
  }

  if (node.value !== undefined && node.value !== "") {
    if (["IN", "NOT_IN"].includes(node.operator)) {
      leaf.value = node.value.split(",").map((v) => v.trim()).filter(Boolean);
    } else if (
      ["MORE_THAN", "LESS_THAN", "MORE_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL"].includes(
        node.operator
      )
    ) {
      const num = Number(node.value);
      leaf.value = isNaN(num) ? node.value : num;
    } else if (node.operator === "EQUAL" || node.operator === "NOT_EQUAL") {
      const trimmed = node.value.trim();
      if (trimmed.toLowerCase() === "true") {
        leaf.value = true;
      } else if (trimmed.toLowerCase() === "false") {
        leaf.value = false;
      } else if (!isNaN(Number(trimmed)) && trimmed !== "") {
        leaf.value = Number(trimmed);
      } else {
        leaf.value = trimmed;
      }
    } else {
      leaf.value = node.value;
    }
  }

  return leaf;
};

// Konversi data kondisi dari backend → tree untuk builder
const payloadToTree = (node: Record<string, unknown>): ConditionNode => {
  if (!node || typeof node !== "object") {
    return {
      id: uid(),
      type: "leaf",
      object: "",
      attribute: "",
      operator: "EQUAL",
      value: "",
    };
  }

  const op = typeof node.operator === "string" ? node.operator.toUpperCase() : "AND";
  if (op === "AND" || op === "OR" || Array.isArray(node.children)) {
    const rawChildren = Array.isArray(node.children) ? (node.children as Record<string, unknown>[]) : [];
    return {
      id: uid(),
      type: "group",
      operator: (op === "OR" ? "OR" : "AND"),
      children: rawChildren.map(payloadToTree),
    };
  }
  return {
    id: uid(),
    type: "leaf",
    object: (node.object as string) ?? "",
    attribute: (node.attribute as string) ?? "",
    operator: (node.operator as string) ?? "EQUAL",
    value: Array.isArray(node.value)
      ? (node.value as unknown[]).join(", ")
      : String(node.value ?? ""),
  };
};

const formatDateForBackend = (dateStr: string): string | undefined => {
  if (!dateStr) return undefined;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return undefined;
  return date.toISOString();
};

const parseRuleDate = (val: unknown): string => {
  if (!val) return "";
  const d = !isNaN(Number(val)) ? new Date(Number(val)) : new Date(String(val));
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

const datetimeToDate = (val: string): Date | undefined => {
  if (!val) return undefined;
  try {
    return new Date(val);
  } catch {
    return undefined;
  }
};

const dateToDatetime = (date: Date, existingVal: string): string => {
  const time = existingVal?.split("T")[1] ?? "00:00";
  return `${format(date, "yyyy-MM-dd")}T${time}`};

function RuleBuilderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const isEditMode = !!editId;

  const [ruleName, setRuleName] = useState("Prosedur Aturan Baru");
  const [isPublished, setIsPublished] = useState(false);
  const [action, setAction] = useState('{\n  "discount": 10,\n  "message": "Eligible for promo"\n}');
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tab, setTab] = useState<"visual" | "builder" | "preview">("visual");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveAndPublish, setSaveAndPublish] = useState(false);
  const [savingText, setSavingText] = useState("");
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  // Raw JSON state for interactive editing / direct copy-paste
  const [rawJson, setRawJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const [actionMode, setActionMode] = useState<"form" | "json">("form");
  const [actionEntries, setActionEntries] = useState<ActionEntry[]>([
    { id: uid(), key: "discount", value: "10", type: "number" },
    { id: uid(), key: "message", value: "Eligible for promo", type: "string" },
  ]);

  // Condition tree state: sediakan 1 condition leaf default agar tidak kosong
  const [tree, setTree] = useState<ConditionNode>(() => {
    const defaultObj = OBJECT_DEFINITIONS[0];
    const defaultAttr = defaultObj?.attributes[0];
    return {
      ...mkGroup("AND"),
      children: defaultObj && defaultAttr ? [
        {
          id: uid(),
          type: "leaf",
          object: defaultObj.name,
          attribute: defaultAttr.name,
          operator: defaultAttr.suggestedOperators?.[0] ?? "EQUAL",
          value: defaultAttr.exampleValue ?? "GOLD",
        }
      ] : [],
    };
  });

  // Sync entries → JSON string
  const entriesToJson = (entries: ActionEntry[]) => {
    const obj: Record<string, unknown> = {};
    entries.forEach(({ key, value, type }) => {
      if (!key) return;
      if (type === "boolean") obj[key] = value === "true";
      else if (type === "number") obj[key] = Number(value);
      else {
        try {
          obj[key] = JSON.parse(value);
        } catch {
          obj[key] = value;
        }
      }
    });
    return JSON.stringify(obj, null, 2);
  };

  // Sync JSON string → entries
  const jsonToEntries = (json: string): ActionEntry[] => {
    try {
      const obj = typeof json === "string" ? JSON.parse(json) : json;
      if (typeof obj === "object" && !Array.isArray(obj) && obj !== null) {
        return Object.entries(obj).map(([k, v]) => ({
          id: uid(),
          key: k,
          value: typeof v === "string" ? v : JSON.stringify(v),
          type:
            typeof v === "boolean"
              ? "boolean"
              : typeof v === "number"
              ? "number"
              : "string",
        }));
      }
    } catch {}
    return [];
  };

  // Terapkan data JSON rule ke state builder (visual tree, actions, dates)
  const applyRuleJsonToState = useCallback((parsed: Record<string, unknown>) => {
    if (parsed.name && typeof parsed.name === "string") {
      setRuleName(parsed.name);
    } else if (parsed.ruleName && typeof parsed.ruleName === "string") {
      setRuleName(parsed.ruleName);
    }

    if (parsed.action && typeof parsed.action === "object" && !Array.isArray(parsed.action)) {
      const actionStr = JSON.stringify(parsed.action, null, 2);
      setAction(actionStr);
      setActionEntries(jsonToEntries(actionStr));
    }

    if (parsed.startDate) {
      setStartDate(parseRuleDate(parsed.startDate));
    }
    if (parsed.endDate) {
      setEndDate(parseRuleDate(parsed.endDate));
    }

    if (parsed.condition && typeof parsed.condition === "object") {
      const parsedTree = payloadToTree(parsed.condition as Record<string, unknown>);
      if (parsedTree.type === "leaf") {
        setTree({
          ...mkGroup("AND"),
          children: [parsedTree],
        });
      } else {
        setTree(parsedTree);
      }
    }
  }, []);

  // Cek imported_rule_json dari sessionStorage jika user memilih "Buka di Flow Builder"
  useEffect(() => {
    if (isEditMode) return;
    try {
      const raw = sessionStorage.getItem("imported_rule_json");
      if (raw) {
        sessionStorage.removeItem("imported_rule_json");
        const parsed = JSON.parse(raw);
        applyRuleJsonToState(parsed);
        toast.success("JSON rule berhasil dimuat ke Flow Builder!");
      }
    } catch (err) {
      console.error("Gagal load imported_rule_json:", err);
    }
  }, [isEditMode, applyRuleJsonToState]);

  // Load rule saat mode edit
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;

    const loadRule = async () => {
      try {
        const res = await getRuleById(Number(editId));
        const rule = res.data.data;

        if (cancelled) return;

        setRuleName(`Edit Rule #${editId}`);
        setIsPublished(!!rule.published);
        if (rule.published) {
          setSaveAndPublish(true);
        }

        if (rule.action) {
          const actionStr = JSON.stringify(rule.action, null, 2);
          setAction(actionStr);
          setActionEntries(jsonToEntries(actionStr));
        }

        if (rule.startDate) {
          setStartDate(parseRuleDate(rule.startDate));
        }
        if (rule.endDate) {
          setEndDate(parseRuleDate(rule.endDate));
        }

        if (rule.condition) {
          const parsed = payloadToTree(rule.condition as Record<string, unknown>);
          if (parsed.type === "leaf") {
            setTree({
              ...mkGroup("AND"),
              children: [parsed],
            });
          } else {
            setTree(parsed);
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Error load rule:", e);
          toast.error("Gagal memuat rule dari server.");
        }
      }
    };
    loadRule();

    return () => {
      cancelled = true;
    };
  }, [editId]);

  const handleUpdate = useCallback((id: string, updater: (n: ConditionNode) => ConditionNode) => {
    setTree((t) => updateNode(t, id, updater));
  }, []);

  const handleRemove = useCallback((id: string) => {
    setTree((t) => removeNode(t, id));
  }, []);

  const handleAddChild = useCallback((parentId: string, node: ConditionNode) => {
    setTree((t) => addChild(t, parentId, node));
  }, []);

  const handleActionModeSwitch = (mode: "form" | "json") => {
    if (mode === "json") {
      setAction(entriesToJson(actionEntries));
    } else {
      setActionEntries(jsonToEntries(action));
    }
    setActionMode(mode);
  };

  // Preview payload object
  const previewPayload = {
    condition: treeToPayload(tree),
    action: (() => {
      if (actionMode === "form") {
        const obj: Record<string, unknown> = {};
        actionEntries.forEach(({ key, value, type }) => {
          if (!key || !key.trim()) return;
          const k = key.trim();
          if (type === "boolean") obj[k] = value === "true";
          else if (type === "number") {
            const n = Number(value);
            obj[k] = isNaN(n) ? value : n;
          } else {
            try {
              obj[k] = JSON.parse(value);
            } catch {
              obj[k] = value;
            }
          }
        });
        return obj;
      }
      try {
        return JSON.parse(action);
      } catch {
        return action;
      }
    })(),
    startDate: startDate ? formatDateForBackend(startDate) : undefined,
    endDate: endDate ? formatDateForBackend(endDate) : undefined,
  };

  const handleTabSwitch = (newTab: "visual" | "builder" | "preview") => {
    if (newTab === "preview") {
      setRawJson(JSON.stringify(previewPayload, null, 2));
      setJsonError(null);
    }
    setTab(newTab);
  };

  // Terapkan JSON dari tab JSON Editor ke Visual Builder
  const handleApplyJsonToBuilder = () => {
    try {
      const parsed = JSON.parse(rawJson);
      if (typeof parsed !== "object" || parsed === null) {
        toast.error("JSON harus berupa object rule");
        return;
      }
      applyRuleJsonToState(parsed);
      toast.success("JSON rule berhasil diterapkan ke Visual & Tree Builder!");
      setTab("visual");
    } catch (err: unknown) {
      toast.error(`Format JSON tidak valid: ${(err as Error).message}`);
    }
  };

  // ─── Save Rule ─────────────────────────────────────────────
  const handleSave = async (shouldPublish: boolean = saveAndPublish) => {
    setSaving(true);
    setSavingText(shouldPublish ? "Menyimpan & Mempublish..." : "Menyimpan...");
    try {
      let payload: Record<string, unknown>;

      if (tab === "preview") {
        // Mode JSON: Gunakan langsung JSON yang diedit atau dipaste
        let parsedJson: Record<string, unknown>;
        try {
          parsedJson = JSON.parse(rawJson);
        } catch (err: unknown) {
          toast.error(`JSON Syntax Error: ${(err as Error).message}`);
          setSaving(false);
          return;
        }

        if (!parsedJson || typeof parsedJson !== "object") {
          toast.error("JSON harus berupa object rule yang valid.");
          setSaving(false);
          return;
        }

        if (!parsedJson.condition || typeof parsedJson.condition !== "object") {
          toast.error("JSON wajib menyertakan properti 'condition' berupa object.");
          setSaving(false);
          return;
        }

        if (!parsedJson.action || typeof parsedJson.action !== "object") {
          toast.error("JSON wajib menyertakan properti 'action' berupa object.");
          setSaving(false);
          return;
        }

        payload = {
          condition: parsedJson.condition,
          action: parsedJson.action,
        };

        if (parsedJson.startDate) {
          payload.startDate = formatDateForBackend(String(parsedJson.startDate)) || parsedJson.startDate;
        }
        if (parsedJson.endDate) {
          payload.endDate = formatDateForBackend(String(parsedJson.endDate)) || parsedJson.endDate;
        }

        // Sinkronkan kembali ke state form
        applyRuleJsonToState(parsedJson);
      } else {
        // Mode Visual / Tree Builder
        let parsedAction: Record<string, unknown> = {};
        if (actionMode === "form") {
          const obj: Record<string, unknown> = {};
          actionEntries.forEach(({ key, value, type }) => {
            if (!key || !key.trim()) return;
            const k = key.trim();
            if (type === "boolean") obj[k] = value === "true";
            else if (type === "number") {
              const n = Number(value);
              obj[k] = isNaN(n) ? value : n;
            } else {
              try {
                obj[k] = JSON.parse(value);
              } catch {
                obj[k] = value;
              }
            }
          });
          parsedAction = obj;
        } else {
          try {
            parsedAction = JSON.parse(action);
          } catch {
            toast.error("Format JSON pada aksi (THEN) tidak valid!");
            setSaving(false);
            return;
          }
        }

        if (!parsedAction || Object.keys(parsedAction).length === 0) {
          toast.error("Minimal harus ada 1 parameter action (misal: discount, message, dll).");
          setSaving(false);
          return;
        }

        // Validasi Kelengkapan Leaf Tree
        const checkIncompleteLeaves = (node: ConditionNode): string | null => {
          if (node.type === "group") {
            for (const child of node.children) {
              const err = checkIncompleteLeaves(child);
              if (err) return err;
            }
            return null;
          }
          if (!node.object || !node.attribute) {
            return "Terdapat kondisi yang belum memilih Object atau Attribute.";
          }
          if (!NO_VALUE_OPS.has(node.operator) && (node.value === undefined || node.value.trim() === "")) {
            return `Nilai untuk kondisi ${node.object}.${node.attribute} (${node.operator}) belum diisi.`;
          }
          return null;
        };

        const incompleteErr = checkIncompleteLeaves(tree);
        if (incompleteErr) {
          toast.error(incompleteErr);
          setSaving(false);
          return;
        }

        // Konversi Condition Tree ke Payload
        const conditionPayload = treeToPayload(tree) as { operator?: string; children?: unknown[] } | null;
        if (!conditionPayload) {
          toast.error("Format kondisi tidak valid.");
          setSaving(false);
          return;
        }

        if ("children" in conditionPayload && (!conditionPayload.children || conditionPayload.children.length === 0)) {
          toast.error("Minimal harus ada 1 kondisi IF yang lengkap (Object, Attribute, & Nilai).");
          setSaving(false);
          return;
        }

        payload = {
          condition: conditionPayload,
          action: parsedAction,
        };

        if (startDate) {
          const formattedStart = formatDateForBackend(startDate);
          if (formattedStart) payload.startDate = formattedStart;
        }
        if (endDate) {
          const formattedEnd = formatDateForBackend(endDate);
          if (formattedEnd) payload.endDate = formattedEnd;
        }
      }

      let savedRuleId: number;

      if (isEditMode) {
        savedRuleId = Number(editId);
        await updateRules([{ id: savedRuleId, ...payload }]);
      } else {
        const res = await createRule(payload);
        savedRuleId = Number(res.data?.data);
      }

      if (shouldPublish && !isNaN(savedRuleId) && savedRuleId > 0) {
        setSavingText("Mempublish ke engine...");
        try {
          await publishRules([savedRuleId]);
          toast.success(
            isEditMode
              ? `Rule #${savedRuleId} berhasil diperbarui dan dipublish!`
              : `Rule #${savedRuleId} berhasil disimpan dan langsung dipublish ke engine!`
          );
        } catch (pubErr: unknown) {
          const errObj = pubErr as { response?: { data?: { message?: string } } };
          const pubMsg = errObj.response?.data?.message || "Gagal mempublish rule ke engine";
          toast.warning(`Rule tersimpan (draft), namun gagal dipublish: ${pubMsg}`);
        }
      } else {
        toast.success(
          isEditMode
            ? `Rule #${savedRuleId} berhasil diperbarui`
            : "Rule prosedur baru berhasil disimpan"
        );
      }

      setSaved(true);
      setTimeout(() => router.push("/rules"), 900);
    } catch (e: unknown) {
      console.error("=== SAVE ERROR ===", e);
      const errObj = e as {
        response?: { data?: { errors?: { message?: string }[]; message?: string } };
        message?: string;
      };
      const backendError =
        errObj.response?.data?.errors?.[0]?.message ||
        errObj.response?.data?.message ||
        errObj.message ||
        "Gagal menyimpan rule. Periksa kelengkapan form.";
      toast.error(backendError);
    } finally {
      setSaving(false);
      setSavingText("");
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-canvas-dots">
      {/* ─── Top Navbar (Sticky) ─── */}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => router.push("/rules")}
              className="h-9 w-9 p-0 rounded-xl hover:bg-muted text-muted-foreground shrink-0"
              title="Kembali ke Daftar Rule"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <Input
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="Beri nama rule..."
                  className="text-base sm:text-lg font-bold bg-transparent text-foreground border-none p-0 focus:outline-none focus:ring-0 truncate max-w-sm sm:max-w-md placeholder:text-muted-foreground/60"
                />
                <Badge
                  variant="outline"
                  className={`text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 ${
                    isPublished
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  {isPublished ? "● Published" : "○ Draft"}
                </Badge>
              </div>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-2xl border border-border">
            {[
              { id: "visual", label: "Visual Flow", icon: Workflow },
              { id: "builder", label: "Tree View", icon: GitBranch },
              { id: "preview", label: "JSON Editor", icon: Code2 },
            ].map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.id;
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => handleTabSwitch(t.id as "visual" | "builder" | "preview")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-primary" : ""}`} />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl shadow-xs">
              <Button
                type="button"
                onClick={() => handleSave(saveAndPublish)}
                disabled={saving}
                className={`h-9 px-4 text-xs font-semibold rounded-l-xl rounded-r-none transition-all gap-1.5 ${
                  saved
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : saveAndPublish
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20"
                    : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/20"
                }`}
              >
                {saving ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span>{savingText || "Menyimpan..."}</span>
                  </>
                ) : saved ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Tersimpan!</span>
                  </>
                ) : saveAndPublish ? (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>{isEditMode ? "Update & Publish" : "Simpan & Publish"}</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>{isEditMode ? "Update Rule" : "Simpan Rule"}</span>
                  </>
                )}
              </Button>

              <Popover open={saveMenuOpen} onOpenChange={setSaveMenuOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    disabled={saving}
                    className={`h-9 px-2 text-xs rounded-l-none rounded-r-xl border-l border-white/20 transition-all ${
                      saved
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : saveAndPublish
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : "bg-primary hover:bg-primary/90 text-primary-foreground"
                    }`}
                    title="Opsi Simpan & Publish"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${saveMenuOpen ? "rotate-180" : ""}`} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-1.5 rounded-2xl shadow-xl border border-border bg-popover">
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSaveAndPublish(false);
                        setSaveMenuOpen(false);
                        handleSave(false);
                      }}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl text-left transition-colors ${
                        !saveAndPublish
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-muted text-foreground"
                      }`}
                    >
                      <Save className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                      <div>
                        <div className="text-xs font-semibold">
                          {isEditMode ? "Update Saja (Draft)" : "Simpan Saja (Draft)"}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                          Menyimpan konfigurasi rule ke database tanpa mengaktifkan di Drools engine
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSaveAndPublish(true);
                        setSaveMenuOpen(false);
                        handleSave(true);
                      }}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl text-left transition-colors ${
                        saveAndPublish
                          ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 font-medium"
                          : "hover:bg-muted text-foreground"
                      }`}
                    >
                      <Send className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                      <div>
                        <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          {isEditMode ? "Update & Langsung Publish" : "Simpan & Langsung Publish"}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                          Generate file DRL, simpan ke MongoDB, dan sebarkan via Kafka ke Evaluation Service
                        </div>
                      </div>
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Main Content Canvas ─── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
          {/* ─── LEFT: Primary Canvas / Editor ─── */}
          <div className="flex flex-col gap-6">
            {/* ─── 1. VISUAL FLOW BUILDER (Kuropatwa Canvas) ─── */}
            {tab === "visual" && (
              <VisualRuleBuilder
                tree={tree}
                onTreeChange={setTree}
                actionEntries={actionEntries}
                onActionEntriesChange={(entries) => {
                  setActionEntries(entries);
                  setAction(entriesToJson(entries));
                }}
              />
            )}

            {/* ─── 2. TREE VIEW BUILDER ─── */}
            {tab === "builder" && (
              <div className="flex flex-col gap-6">
                {/* Condition Logic Card */}
                <Card className="rounded-3xl border-border shadow-xs">
                  <CardHeader className="pb-3 border-b border-border/70 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <GitBranch className="w-4 h-4 text-emerald-600" />
                        Logika Kondisi (IF Criteria)
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Susun aturan berjenjang menggunakan operator logika AND / OR
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <RuleConditionNode
                      node={tree}
                      onUpdate={handleUpdate}
                      onRemove={handleRemove}
                      onAddChild={handleAddChild}
                    />
                  </CardContent>
                </Card>

                {/* Action Output Card */}
                <Card className="rounded-3xl border-border shadow-xs">
                  <CardHeader className="pb-3 border-b border-border/70 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Workflow className="w-4 h-4 text-amber-500" />
                        Aksi & Output (THEN Results)
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Payload atau modifikasi fact yang dieksekusi saat kondisi terpenuhi
                      </p>
                    </div>

                    <div className="flex bg-muted/60 p-1 rounded-xl border border-border text-xs">
                      <button
                        type="button"
                        onClick={() => handleActionModeSwitch("form")}
                        className={`px-3 py-1 rounded-lg font-medium transition-all ${
                          actionMode === "form"
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Visual Table
                      </button>
                      <button
                        type="button"
                        onClick={() => handleActionModeSwitch("json")}
                        className={`px-3 py-1 rounded-lg font-medium transition-all ${
                          actionMode === "json"
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Raw JSON
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    {actionMode === "form" ? (
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2">
                          {actionEntries.map((entry, idx) => (
                            <div
                              key={entry.id}
                              className="flex items-center gap-2 p-2 rounded-xl bg-muted/30 border border-border"
                            >
                              <Input
                                placeholder="Parameter Key (misal: discount)"
                                value={entry.key}
                                onChange={(e) => {
                                  const next = [...actionEntries];
                                  next[idx] = { ...next[idx], key: e.target.value };
                                  setActionEntries(next);
                                }}
                                onBlur={() => setAction(entriesToJson(actionEntries))}
                                className="h-8 text-xs font-mono w-44 rounded-lg bg-background"
                              />
                              <span className="text-muted-foreground font-mono text-xs">:</span>
                              <Input
                                placeholder="Nilai (misal: 10, true, teks)"
                                value={entry.value}
                                onChange={(e) => {
                                  const next = [...actionEntries];
                                  next[idx] = { ...next[idx], value: e.target.value };
                                  setActionEntries(next);
                                }}
                                onBlur={() => setAction(entriesToJson(actionEntries))}
                                className="h-8 text-xs font-mono flex-1 rounded-lg bg-background"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const next = actionEntries.filter((_, i) => i !== idx);
                                  const finalEntries =
                                    next.length > 0
                                      ? next
                                      : [{ id: uid(), key: "", value: "", type: "string" as const }];
                                  setActionEntries(finalEntries);
                                  setAction(entriesToJson(finalEntries));
                                }}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive rounded-lg"
                              >
                                ✕
                              </Button>
                            </div>
                          ))}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setActionEntries((prev) => [
                              ...prev,
                              { id: uid(), key: "", value: "", type: "string" },
                            ])
                          }
                          className="h-8 text-xs self-start gap-1 rounded-xl"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Tambah Parameter Action
                        </Button>
                      </div>
                    ) : (
                      <Textarea
                        value={action}
                        onChange={(e) => setAction(e.target.value)}
                        rows={7}
                        className="font-mono text-xs rounded-xl resize-none bg-muted/20"
                      />
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ─── 3. JSON SCHEMA & RAW JSON EDITOR ─── */}
            {tab === "preview" && (
              <Card className="rounded-3xl border-border shadow-xs overflow-hidden">
                <CardHeader className="pb-3 border-b border-border/70 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-blue-600" />
                      <CardTitle className="text-sm font-bold">
                        JSON Rule Editor & Direct Paste
                      </CardTitle>
                      {jsonError ? (
                        <Badge variant="destructive" className="text-[10px] py-0 px-2">
                          Syntax Error
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] py-0 px-2 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                          ✓ Valid JSON
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Tempel JSON rule lengkap secara langsung, terapkan ke Visual Builder, atau klik tombol Simpan.
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1 rounded-xl"
                      onClick={() => {
                        const template = {
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
                            discount: 10,
                            eligiblePromo: true,
                            message: "Diskon 10% untuk Member Gold",
                          },
                          startDate: "2026-01-01T00:00:00.000Z",
                          endDate: "2026-12-31T23:59:59.000Z",
                        };
                        const str = JSON.stringify(template, null, 2);
                        setRawJson(str);
                        setJsonError(null);
                        toast.info("Template JSON berhasil dimuat");
                      }}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      Template
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1 rounded-xl"
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(rawJson);
                          setRawJson(JSON.stringify(parsed, null, 2));
                          setJsonError(null);
                          toast.success("JSON dirapikan");
                        } catch (err: unknown) {
                          toast.error(`Format error: ${(err as Error).message}`);
                        }
                      }}
                    >
                      Format
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1 rounded-xl"
                      onClick={() => {
                        navigator.clipboard.writeText(rawJson);
                        toast.success("JSON disalin ke clipboard!");
                      }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      className="h-8 text-xs gap-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                      onClick={handleApplyJsonToBuilder}
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      Terapkan ke Visual
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 flex flex-col gap-3">
                  {jsonError && (
                    <div className="p-2.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{jsonError}</span>
                    </div>
                  )}

                  <Textarea
                    value={rawJson}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRawJson(val);
                      try {
                        const parsed = JSON.parse(val);
                        if (typeof parsed !== "object" || parsed === null) {
                          setJsonError("JSON harus berupa object rule");
                        } else {
                          setJsonError(null);
                        }
                      } catch (err: unknown) {
                        setJsonError((err as Error).message);
                      }
                    }}
                    placeholder='Paste JSON rule di sini, contoh: { "condition": { ... }, "action": { ... } }'
                    rows={18}
                    className="p-4 rounded-2xl font-mono text-xs overflow-auto bg-slate-950 text-slate-100 border-border focus-visible:ring-blue-500 leading-relaxed resize-y"
                  />

                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                    <span>
                      Mendukung format backend: <code className="bg-muted px-1 py-0.5 rounded text-[11px]">condition</code>, <code className="bg-muted px-1 py-0.5 rounded text-[11px]">action</code>, <code className="bg-muted px-1 py-0.5 rounded text-[11px]">startDate</code>, <code className="bg-muted px-1 py-0.5 rounded text-[11px]">endDate</code>
                    </span>
                    <span className="font-mono text-[11px]">
                      {rawJson.length} karakter
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ─── RIGHT: Inspector & Configuration Drawer (Maciej Kuropatwa Style) ─── */}
          <div className="flex flex-col gap-4">
            {/* Validity Schedule Card */}
            <Card className="rounded-3xl border-border shadow-xs overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/70 bg-muted/20">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-emerald-600" />
                  <CardTitle className="text-xs font-bold uppercase tracking-wider">
                    Periode Berlaku
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-4 flex flex-col gap-4">
                {/* Start Date */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold">Start Date</Label>
                  <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={`w-full justify-start text-left text-xs font-normal h-9 rounded-xl border-border ${
                          !startDate ? "text-muted-foreground" : ""
                        }`}
                      >
                        <CalendarIcon className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                        {startDate
                          ? format(new Date(startDate), "dd MMM yyyy, HH:mm", { locale: idLocale })
                          : "Pilih tanggal mulai..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-2xl shadow-xl" align="start">
                      <Calendar
                        mode="single"
                        selected={datetimeToDate(startDate)}
                        onSelect={(date) => {
                          if (date) {
                            setStartDate(dateToDatetime(date, startDate));
                            setStartDateOpen(false);
                          }
                        }}
                        initialFocus
                        locale={idLocale}
                      />
                      <div className="px-3 pb-3 flex items-center gap-2 border-t pt-3">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Waktu:</span>
                        <Input
                          type="time"
                          value={startDate?.split("T")[1]?.slice(0, 5) ?? "00:00"}
                          onChange={(e) => {
                            const d = startDate?.split("T")[0] ?? format(new Date(), "yyyy-MM-dd");
                            setStartDate(`${d}T${e.target.value}`);
                          }}
                          className="h-7 text-xs w-28 rounded-lg"
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                  {startDate && (
                    <button
                      type="button"
                      onClick={() => setStartDate("")}
                      className="text-[10px] text-muted-foreground hover:text-destructive text-left"
                    >
                      ✕ Reset tanggal mulai
                    </button>
                  )}
                </div>

                {/* End Date */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold">End Date</Label>
                  <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={`w-full justify-start text-left text-xs font-normal h-9 rounded-xl border-border ${
                          !endDate ? "text-muted-foreground" : ""
                        }`}
                      >
                        <CalendarIcon className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                        {endDate
                          ? format(new Date(endDate), "dd MMM yyyy, HH:mm", { locale: idLocale })
                          : "Pilih tanggal selesai..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-2xl shadow-xl" align="start">
                      <Calendar
                        mode="single"
                        selected={datetimeToDate(endDate)}
                        onSelect={(date) => {
                          if (date) {
                            setEndDate(dateToDatetime(date, endDate));
                            setEndDateOpen(false);
                          }
                        }}
                        initialFocus
                        locale={idLocale}
                        disabled={(date) => (startDate ? date < new Date(startDate) : false)}
                      />
                      <div className="px-3 pb-3 flex items-center gap-2 border-t pt-3">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Waktu:</span>
                        <Input
                          type="time"
                          value={endDate?.split("T")[1]?.slice(0, 5) ?? "23:59"}
                          onChange={(e) => {
                            const d = endDate?.split("T")[0] ?? format(new Date(), "yyyy-MM-dd");
                            setEndDate(`${d}T${e.target.value}`);
                          }}
                          className="h-7 text-xs w-28 rounded-lg"
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                  {endDate && (
                    <button
                      type="button"
                      onClick={() => setEndDate("")}
                      className="text-[10px] text-muted-foreground hover:text-destructive text-left"
                    >
                      ✕ Reset tanggal selesai
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Health & Diagnostic Summary */}
            <Card className="rounded-3xl border-border bg-muted/20 shadow-xs p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Flow Integrity Check
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">
                Kondisi dan action akan divalidasi dan dikompilasi ke Drools DRL di Publishing Service.
              </p>
              <div className="flex flex-col gap-1.5 text-xs font-mono">
                <div className="flex items-center justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Conditions:</span>
                  <span className="font-semibold text-foreground">
                    {tree.type === "group" ? tree.children.length : 1}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Actions:</span>
                  <span className="font-semibold text-foreground">{actionEntries.length}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-muted-foreground">Endpoint:</span>
                  <span className="font-semibold text-emerald-600">/rules</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function RuleBuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen text-muted-foreground gap-3">
          <span className="w-5 h-5 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
          <span className="text-xs font-medium">Memuat Flow Builder...</span>
        </div>
      }
    >
      <RuleBuilderContent />
    </Suspense>
  );
}
