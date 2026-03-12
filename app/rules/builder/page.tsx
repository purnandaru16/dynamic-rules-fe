"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RuleConditionNode,
  mkGroup,
  updateNode,
  removeNode,
  addChild,
  uid,
  type ConditionNode,
} from "@/components/RuleConditionNode";
import { createRules } from "@/lib/api";
import { useSearchParams } from "next/navigation";
import { getRuleById, updateRules } from "@/lib/api";
import { toast } from "sonner";
import { VisualRuleBuilder, type ActionEntry } from "@/components/VisualRuleBuilder";


// ─── Convert tree → backend payload ──────────────────────────
const treeToPayload = (node: ConditionNode): object | null => {
  if (node.type === "group") {
    const children = node.children
      .map(treeToPayload)
      .filter(Boolean); // ← hapus node null
    return {
      operator: node.operator,
      children,
    };
  }

  // Skip leaf yang belum lengkap
  if (!node.object || !node.attribute || !node.operator) return null;

  const leaf: Record<string, unknown> = { operator: node.operator };
  if (node.object)    leaf.object    = node.object;
  if (node.attribute) leaf.attribute = node.attribute;

  if (node.value) {
    if (["IN", "NOT_IN"].includes(node.operator)) {
      leaf.value = node.value.split(",").map((v) => v.trim());
    } else if (["MORE_THAN", "LESS_THAN", "MORE_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL"].includes(node.operator)) {
      leaf.value = Number(node.value);
    } else {
      leaf.value = node.value;
    }
  }

  return leaf;
};

// Konversi data kondisi dari backend → tree untuk ditampilkan di builder
const payloadToTree = (node: Record<string, unknown>): ConditionNode => {
  // Jika punya children → ini adalah group node
  if (node.operator === "AND" || node.operator === "OR") {
    return {
      id: uid(),
      type: "group",
      operator: node.operator as "AND" | "OR",
      children: ((node.children as Record<string, unknown>[]) ?? []).map(payloadToTree),
    };
  }
  // Selain itu → leaf node
  return {
    id: uid(),
    type: "leaf",
    object:    (node.object    as string) ?? "",
    attribute: (node.attribute as string) ?? "",
    operator:  (node.operator  as string) ?? "EQUAL",
    // Kalau value berupa array (IN/NOT_IN), join jadi string "a, b, c"
    value: Array.isArray(node.value)
      ? (node.value as unknown[]).join(", ")
      : String(node.value ?? ""),
  };
};

const formatDateForBackend = (dateStr: string): string => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const dd   = String(date.getDate()).padStart(2, "0");
  const mm   = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const hh   = String(date.getHours()).padStart(2, "0");
  const min  = String(date.getMinutes()).padStart(2, "0");
  const ss   = String(date.getSeconds()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${min}:${ss}`;
};

export default function RuleBuilderPage() {
  const router = useRouter();
  const [ruleName, setRuleName]   = useState("Rule Baru");
  const [action, setAction]       = useState('{\n  "type": "DISCOUNT",\n  "value": 10\n}');
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate]     = useState("");
  const [tab, setTab]             = useState<"builder" | "visual" | "preview">("builder");
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const handleTabSwitch = (t: "builder" | "visual" | "preview") => {
    setTab(t);
  };

  // Di dalam komponen, tambahkan:
    const searchParams = useSearchParams();
    // const mode     = searchParams.get("mode"); 
    const editId = searchParams.get("id"); // ada id = mode edit
    const isEditMode = !!editId;
    // const isViewMode = mode === "view";

    // Load rule saat mode edit
    useEffect(() => {
      if (!editId) return;
      let cancelled = false;

      const loadRule = async () => {
        try {
          const res = await getRuleById(Number(editId));
          const rule = res.data.data; // ← langsung pakai .data.data

          if (cancelled) return;

          // // Guard — rule yang sudah published tidak bisa diedit
          // if (rule.published && !isViewMode) {
          //   router.push("/rules");
          //   return;
          // }

          setRuleName(`Edit Rule #${editId}`);
          if (rule.action) {
            const actionStr = JSON.stringify(rule.action, null, 2);
            setAction(actionStr);
            setActionEntries(jsonToEntries(actionStr));
          }

          // startDate & endDate berupa unix timestamp milliseconds
          if (rule.startDate) {
            const date = new Date(Number(rule.startDate));
            const yyyy = date.getFullYear();
            const mm   = String(date.getMonth() + 1).padStart(2, "0");
            const dd   = String(date.getDate()).padStart(2, "0");
            const hh   = String(date.getHours()).padStart(2, "0");
            const min  = String(date.getMinutes()).padStart(2, "0");
            setStartDate(`${yyyy}-${mm}-${dd}T${hh}:${min}`);
          }
          if (rule.endDate) {
            const date = new Date(Number(rule.endDate));
            const yyyy = date.getFullYear();
            const mm   = String(date.getMonth() + 1).padStart(2, "0");
            const dd   = String(date.getDate()).padStart(2, "0");
            const hh   = String(date.getHours()).padStart(2, "0");
            const min  = String(date.getMinutes()).padStart(2, "0");
            setEndDate(`${yyyy}-${mm}-${dd}T${hh}:${min}`);
          }

          // Rebuild condition tree
          if (rule.condition) {
            setTree(payloadToTree(rule.condition as Record<string, unknown>));
          }

        } catch (e) {
          if (!cancelled) {
            console.error("Error load rule:", e);
            alert("Gagal memuat rule.");
          }
        }
      };
      loadRule();
      
      return () => {
        cancelled = true; // ← cleanup saat component unmount
      };
    }, [editId]);
  
  // Condition tree state
  const [tree, setTree] = useState<ConditionNode>({
    ...mkGroup("AND"),
    children: [],
  });

  const handleUpdate = useCallback((id: string, updater: (n: ConditionNode) => ConditionNode) => {
    setTree((t) => updateNode(t, id, updater));
  }, []);

  const handleRemove = useCallback((id: string) => {
    setTree((t) => removeNode(t, id));
  }, []);

  const handleAddChild = useCallback((parentId: string, node: ConditionNode) => {
    setTree((t) => addChild(t, parentId, node));
  }, []);

  // ─── Save Rule ─────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      let parsedAction;
      if (actionMode === "form") {
        const obj: Record<string, unknown> = {};
        actionEntries.forEach(({ key, value, type }) => {
          if (!key) return;
          if (type === "boolean") obj[key] = value === "true";
          else if (type === "number") obj[key] = Number(value);
          else {
            try { obj[key] = JSON.parse(value); } catch { obj[key] = value; }
          }
        });
        parsedAction = obj;
      } else {
        try { parsedAction = JSON.parse(action); }
        catch { parsedAction = action; }
      }

      const condition = treeToPayload(tree);

      const payload = {
        condition,
        action: parsedAction,
        startDate: startDate ? formatDateForBackend(startDate) : undefined,
        endDate:   endDate   ? formatDateForBackend(endDate)   : undefined,
      };

      console.log("payload:", JSON.stringify(payload, null, 2));

      if (isEditMode) {
        await updateRules([{ id: Number(editId), ...payload }]);
        toast.success(`Rule #${editId} berhasil diupdate`);
      } else {
        await createRules([payload]);
        toast.success("Rule baru berhasil disimpan");
      }

      setSaved(true);
      setTimeout(() => router.push("/rules"), 1000);

    } catch (e) {
      console.error("=== SAVE ERROR ===", e);
      toast.error("Gagal menyimpan rule. Periksa kembali form.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Preview payload ────────────────────────────────────────
  const previewPayload = {
    condition: treeToPayload(tree),
    action: (() => { try { return JSON.parse(action); } catch { return action; } })(),
    startDate: startDate || undefined,
    endDate:   endDate   || undefined,
  };

  const [actionMode, setActionMode] = useState<"form" | "json">("form");
  const [actionEntries, setActionEntries] = useState<ActionEntry[]>([]);

  // Sync entries → JSON string
  const entriesToJson = (entries: ActionEntry[]) => {
    const obj: Record<string, unknown> = {};
    entries.forEach(({ key, value, type }) => {
      if (!key) return;
      if (type === "boolean") obj[key] = value === "true";
      else if (type === "number") obj[key] = Number(value);
      else {
        try { obj[key] = JSON.parse(value); } catch { obj[key] = value; }
      }
    });
    return JSON.stringify(obj, null, 2);
  };

  // Sync JSON string → entries
  const jsonToEntries = (json: string): ActionEntry[] => {
    try {
      const obj = JSON.parse(json);
      if (typeof obj === "object" && !Array.isArray(obj)) {
        return Object.entries(obj).map(([k, v]) => ({
          id: uid(),
          key: k,
          value: typeof v === "string" ? v : JSON.stringify(v),
          type: typeof v === "boolean" ? "boolean"
              : typeof v === "number"  ? "number"
              : "string",
        }));
      }
    } catch {}
    return []; // ← kembalikan kosong
  };

  // Switch mode handler
  const handleActionModeSwitch = (mode: "form" | "json") => {
    if (mode === "json") {
      setAction(entriesToJson(actionEntries));
    } else {
      setActionEntries(jsonToEntries(action));
    }
    setActionMode(mode);
  };


  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1">
          <Input
            value={ruleName}
            onChange={(e) => setRuleName(e.target.value)}
            className="text-xl font-bold border-none shadow-none px-0 focus-visible:ring-0 disabled:opacity-70 disabled:cursor-default"
          />
          <p className="text-sm text-muted-foreground">Rule Builder · Publishing Service :8080</p>
        </div>
        {/* <Button variant="outline" onClick={() => router.push("/rules")}>
          ← Kembali
        </Button> */}
        <Button onClick={handleSave} disabled={saving}
          className={saved ? "bg-green-500 hover:bg-green-600" : ""}>
          {saving ? "Menyimpan..." : saved ? "✓ Tersimpan!" : isEditMode ? "Update Rule" : "Simpan Rule"}
        </Button>
      </div>

      {/* View mode banner */}
      {/* <div className="mb-4 px-4 py-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800 flex items-center gap-3">
        <span className="text-blue-500 text-lg">👁️</span>
        <div>
          <div className="text-sm font-semibold text-blue-700 dark:text-blue-300">Mode View — Read Only</div>
          <div className="text-xs text-blue-500">Rule ini sudah published. Unpublish terlebih dahulu untuk mengedit.</div>
        </div>
        <Button
          size="sm" variant="outline"
          className="ml-auto text-xs border-blue-300 text-blue-600 hover:bg-blue-100"
          onClick={() => router.push("/rules")}>
          ← Kembali
        </Button>
      </div> */}

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-0">
        {([
          ["builder", "🔧 Builder"],
          ["visual",  "🎨 Visual"],
          ["preview", "📋 Preview JSON"],
        ] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => handleTabSwitch(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t-md border border-b-0 transition-colors
              ${tab === t
                ? "bg-background border-border text-foreground -mb-px"
                : "bg-muted text-muted-foreground border-transparent hover:text-foreground"
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="border border-t-0 rounded-b-lg rounded-tr-lg p-6 bg-background">

        {/* ── BUILDER TAB ── */}
        {tab === "builder" && (
          <div className="grid grid-cols-[1fr_300px] gap-6">

            {/* Left: kondisi + action */}
            <div className="flex flex-col gap-6">

              {/* Kondisi */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Kondisi (IF)</h3>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <code className="bg-muted px-1.5 py-0.5 rounded">attr[]</code> semua match
                    <code className="bg-muted px-1.5 py-0.5 rounded">attr[?]</code> salah satu match
                  </div>
                </div>
                <RuleConditionNode
                  node={tree}
                  onUpdate={handleUpdate}
                  onRemove={handleRemove}
                  onAddChild={handleAddChild}
                />
              </div>

              {/* Action */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Action (THEN)</CardTitle>
                    <div className="flex rounded-md overflow-hidden border border-border text-xs">
                      {(["form", "json"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => handleActionModeSwitch(m)}
                          className={`px-2.5 py-1 transition-colors font-medium
                            ${actionMode === m
                              ? "bg-primary text-primary-foreground"
                              : "bg-transparent text-muted-foreground hover:bg-muted"}`}>
                          {m === "form" ? "🧩 Form" : "{ } JSON"}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {actionMode === "form" ? (
                    <div className="flex flex-col gap-2">
                      {actionEntries.map((entry, idx) => (
                        <div key={entry.id} className="flex gap-2 items-center">
                          <Input
                            placeholder="key"
                            value={entry.key}
                            onChange={(e) => {
                              const next = [...actionEntries];
                              next[idx] = { ...next[idx], key: e.target.value };
                              setActionEntries(next);
                            }}
                            onBlur={() => setAction(entriesToJson(actionEntries))}
                            className="font-mono text-xs w-32"
                          />
                          <span className="text-muted-foreground text-sm">:</span>
                          <Input
                            placeholder="value"
                            value={entry.value}
                            onChange={(e) => {
                              const next = [...actionEntries];
                              next[idx] = { ...next[idx], value: e.target.value };
                              setActionEntries(next);
                            }}
                            onBlur={() => setAction(entriesToJson(actionEntries))}
                            className="font-mono text-xs flex-1"
                          />
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              const next = actionEntries.filter((_, i) => i !== idx);
                              setActionEntries(next.length > 0 ? next : [{ id: uid(), key: "", value: "", type: "string" }]);
                              setAction(entriesToJson(next));
                            }}>
                            ✕
                          </Button>
                        </div>
                      ))}
                      <Button
                        size="sm" variant="outline"
                        className="w-fit text-xs mt-1"
                        onClick={() => setActionEntries([...actionEntries, { id: uid(), key: "", value: "", type: "string" }])}>
                        + Tambah Field
                      </Button>
                    </div>
                  ) : (
                    <Textarea
                      value={action}
                      onChange={(e) => setAction(e.target.value)}
                      rows={6}
                      className="font-mono text-sm resize-none disabled:opacity-70 disabled:cursor-default"
                    />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right: periode */}
            <div>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Periode Berlaku</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div>
                    <Label className="text-xs">Start Date</Label>
                    <Input
                      type="datetime-local"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-1 disabled:opacity-70 disabled:cursor-default"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">End Date</Label>
                    <Input
                      type="datetime-local"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1 disabled:opacity-70 disabled:cursor-default"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

          </div>
        )}

        {/* ── VISUAL TAB ── */}
        {tab === "visual" && (
          <div className="grid grid-cols-[1fr_300px] gap-6">
            <VisualRuleBuilder
              tree={tree}
              onTreeChange={setTree}
              actionEntries={actionEntries}
              onActionEntriesChange={(entries) => {
                setActionEntries(entries);
                setAction(entriesToJson(entries));
              }}
            />
            {/* Right: periode tetap sama */}
            <div>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Periode Berlaku</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div>
                    <Label className="text-xs">Start Date</Label>
                    <Input type="datetime-local" value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">End Date</Label>
                    <Input type="datetime-local" value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ── PREVIEW TAB ── */}
        {tab === "preview" && (
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              Payload yang akan dikirim ke{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs">POST /rules</code>
            </p>
            <pre className="bg-muted rounded-lg p-4 text-sm font-mono overflow-auto">
              {JSON.stringify(previewPayload, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}