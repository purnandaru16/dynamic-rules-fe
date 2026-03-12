"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { checkRules } from "@/lib/api";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────
interface AttributeMap {
  [key: string]: unknown;
}

interface FactAttribute {
  id: string;
  object: string;
  attributes: AttributeMap;
}

interface EvalResult {
  actions?: Record<string, unknown>[];
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────
let _id = 1;
const uid = () => `f${_id++}`;

const mkFact = (): FactAttribute => ({
  id: uid(),
  object: "",
  attributes: {},
});

const formatDateForEval = (dateStr: string): string => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const dd   = String(date.getDate()).padStart(2, "0");
  const mm   = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy} 00:00:00`;
};

// ─── AttributeEditor ─────────────────────────────────────────
function AttributeEditor({
  attributes,
  onChange,
}: {
  attributes: AttributeMap;
  onChange: (attrs: AttributeMap) => void;
}) {
  const [localEntries, setLocalEntries] = useState<[string, string][]>(
    () => Object.entries(attributes).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])
  );

  const syncToParent = (entries: [string, string][]) => {
    const next: AttributeMap = {};
    entries.forEach(([k, v]) => {
      if (!k) return;
      try { next[k] = JSON.parse(v); } catch { next[k] = v; }
    });
    onChange(next);
  };

  const updateLocalKey = (idx: number, newKey: string) => {
    setLocalEntries((prev) => prev.map((e, i) => i === idx ? [newKey, e[1]] : e));
  };

  const updateLocalValue = (idx: number, newVal: string) => {
    setLocalEntries((prev) => prev.map((e, i) => i === idx ? [e[0], newVal] : e));
  };

  const addEntry = () => {
    const next: [string, string][] = [...localEntries, [`field${localEntries.length + 1}`, ""]];
    setLocalEntries(next);
    syncToParent(next);
  };

  const removeEntry = (idx: number) => {
    const next = localEntries.filter((_, i) => i !== idx);
    setLocalEntries(next);
    syncToParent(next);
  };

  return (
    <div className="flex flex-col gap-2">
      {localEntries.map(([key, val], idx) => (
        <div key={idx} className="flex gap-2 items-center">
          <Input
            placeholder="key"
            value={key}
            onChange={(e) => updateLocalKey(idx, e.target.value)}
            onBlur={() => syncToParent(localEntries)}
            className="font-mono text-xs w-36"
          />
          <span className="text-muted-foreground text-sm">:</span>
          <Input
            placeholder='value (string / number / ["a","b"] / {...})'
            value={val}
            onChange={(e) => updateLocalValue(idx, e.target.value)}
            onBlur={() => syncToParent(localEntries)}
            className="font-mono text-xs flex-1"
          />
          <Button
            size="sm" variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => removeEntry(idx)}>
            ✕
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" className="w-fit text-xs mt-1"
        onClick={addEntry}>
        + Tambah Attribute
      </Button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export default function EvaluatePage() {
  const router = useRouter();
  const [date, setDate]       = useState(new Date().toISOString().split("T")[0]);
  const [facts, setFacts]     = useState<FactAttribute[]>([{ ...mkFact(), object: "Customer" }]);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<EvalResult | null>(null);
  const [tab, setTab]         = useState<"form" | "json">("form");
  const [jsonInput, setJsonInput] = useState(
    JSON.stringify({
      date: new Date().toISOString().split("T")[0],
      factAttributes: [
        { object: "Customer", attributes: { membershipLevel: "GOLD" } }
      ]
    }, null, 2)
  );
  const [presets, setPresets]         = useState<{ name: string; data: string }[]>([]);
  const [presetName, setPresetName]   = useState("");
  const [showPresets, setShowPresets] = useState(false);

  // ── Fact CRUD ──
  const addFact = () => setFacts((f) => [...f, mkFact()]);
  const removeFact = (id: string) => setFacts((f) => f.filter((x) => x.id !== id));
  const updateFact = useCallback((id: string, patch: Partial<FactAttribute>) => {
    setFacts((f) => f.map((x) => x.id === id ? { ...x, ...patch } : x));
  }, []);

  // ── Build payload ──
  const buildPayload = () => ({
    date: formatDateForEval(date),
    factAttributes: facts.map(({ object, attributes }) => ({ object, attributes })),
  });

  // ── Sync form → JSON tab ──
  const handleTabSwitch = (t: "form" | "json") => {
    if (t === "json") setJsonInput(JSON.stringify(buildPayload(), null, 2));
    setTab(t);
  };

  // ── Submit ──
  const handleEvaluate = async () => {
    setLoading(true);
    setResult(null);
    try {
        let payload;
        if (tab === "form") {
        payload = buildPayload();
        } else {
        const parsed = JSON.parse(jsonInput);
        if (parsed.date && parsed.date.length === 10) {
            parsed.date = formatDateForEval(parsed.date);
        }
        payload = parsed;
        }
        const res = await checkRules(payload);
        const data = res.data.data ?? res.data;
        setResult(data);

        const count = data?.actions?.length ?? 0;
        if (count > 0) {
        toast.success(`${count} rule match ditemukan`);
        } else {
        toast.info("Tidak ada rule yang match");
        }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Gagal menghubungi evaluation-service";
        setResult({ error: msg });
        toast.error("Evaluasi gagal — " + msg);
    } finally {
        setLoading(false);
    }
    };

  const actions = result?.actions ?? [];
  const hasMatch = actions.length > 0;

  useEffect(() => {
    try {
      const saved = localStorage.getItem("evaluate_presets");
      if (saved) setPresets(JSON.parse(saved));
    } catch {}
  }, []);

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    const payload = JSON.stringify(buildPayload(), null, 2);
    const newPreset = { name: presetName.trim(), data: payload };
    const next = [...presets.filter((p) => p.name !== presetName.trim()), newPreset];
    setPresets(next);
    localStorage.setItem("evaluate_presets", JSON.stringify(next));
    setPresetName("");
    toast.success(`Preset "${newPreset.name}" berhasil disimpan`);
  };

  const handleLoadPreset = (preset: { name: string; data: string }) => {
    try {
      const parsed = JSON.parse(preset.data);
      // Load ke JSON tab
      setJsonInput(preset.data);
      setTab("json");
      // Load ke form tab
      if (parsed.date) {
        // Konversi dari dd-MM-yyyy HH:mm:ss → yyyy-MM-dd
        const parts = parsed.date.split(" ")[0].split("-");
        if (parts.length === 3 && parts[0].length === 2) {
          setDate(`${parts[2]}-${parts[1]}-${parts[0]}`);
        } else {
          setDate(parsed.date.split("T")[0]);
        }
      }
      if (parsed.factAttributes) {
        setFacts(parsed.factAttributes.map((f: { object: string; attributes: Record<string, unknown> }) => ({
          id: uid(),
          object: f.object ?? "",
          attributes: f.attributes ?? {},
        })));
      }
      setTab("form");
      setShowPresets(false);
      toast.success(`Preset "${preset.name}" berhasil dimuat`);
    } catch {
      toast.error("Gagal memuat preset");
    }
  };

  const handleDeletePreset = (name: string) => {
    const next = presets.filter((p) => p.name !== name);
    setPresets(next);
    localStorage.setItem("evaluate_presets", JSON.stringify(next));
    toast.success(`Preset "${name}" dihapus`);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-preset-dropdown]")) {
        setShowPresets(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Test Evaluasi Rule</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Kirim fakta ke evaluation-service
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/rules")}>
          ← Rules
        </Button>
      </div>

      <div className="grid grid-cols-[1fr_400px] gap-6">

        {/* ── LEFT: Input ── */}
        <div className="flex flex-col gap-4">

          {/* Tab switcher */}
          <div className="flex gap-1 border-b">
            {([["form", "🧩 Form Builder"], ["json", "{ } JSON Manual"]] as const).map(([t, label]) => (
              <button key={t} onClick={() => handleTabSwitch(t)}
                className={`px-4 py-2 text-sm font-medium rounded-t-md border border-b-0 transition-colors
                  ${tab === t
                    ? "bg-background border-border text-foreground -mb-px"
                    : "bg-muted text-muted-foreground border-transparent hover:text-foreground"}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 py-3">
            <Input
              placeholder="Nama preset..."
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
              className="h-8 text-xs w-44"
            />
            <Button
              size="sm" variant="outline"
              className="h-8 text-xs"
              disabled={!presetName.trim()}
              onClick={handleSavePreset}>
              💾 Simpan
            </Button>

            {presets.length > 0 && (
              <div className="relative ml-auto" data-preset-dropdown>
                <Button
                  size="sm" variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setShowPresets((v) => !v)}>
                  📂 Preset ({presets.length})
                </Button>

                {showPresets && (
                  <div className="absolute right-0 top-9 z-50 w-64 bg-background border rounded-lg shadow-lg overflow-hidden">
                    <div className="px-3 py-2 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Saved Presets
                    </div>
                    {presets.map((preset) => (
                      <div key={preset.name}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors">
                        <button
                          className="flex-1 text-left text-sm truncate"
                          onClick={() => handleLoadPreset(preset)}>
                          📋 {preset.name}
                        </button>
                        <button
                          className="text-muted-foreground hover:text-destructive transition-colors text-xs"
                          onClick={() => handleDeletePreset(preset.name)}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border rounded-lg p-5 bg-background">
            {/* ── FORM TAB ── */}
            {tab === "form" && (
              <div className="flex flex-col gap-5">

                {/* Date */}
                <div>
                  <Label className="text-sm font-semibold mb-1.5 block">Tanggal Evaluasi</Label>
                  <Input type="date" value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-48" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Akan dikirim sebagai: <code className="bg-muted px-1 rounded">{formatDateForEval(date)}</code>
                  </p>
                </div>

                {/* Facts */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-semibold">Fact Attributes</Label>
                    <Button size="sm" variant="outline" onClick={addFact}>
                      + Tambah Fact
                    </Button>
                  </div>

                  <div className="flex flex-col gap-4">
                    {facts.map((fact, i) => (
                      <Card key={fact.id} className="border-l-4 border-l-blue-400">
                        <CardHeader className="pb-2 pt-4 px-4">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="font-mono text-xs">
                              Fact {i + 1}
                            </Badge>
                            <Input
                              placeholder="Object (contoh: Customer, Cart, Branch)"
                              value={fact.object}
                              onChange={(e) => updateFact(fact.id, { object: e.target.value })}
                              className="font-mono text-sm h-8 flex-1"
                            />
                            {facts.length > 1 && (
                              <Button size="sm" variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => removeFact(fact.id)}>
                                ✕
                              </Button>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                          <Label className="text-xs text-muted-foreground mb-2 block">
                            Attributes — value bisa string, number, atau JSON array/object
                          </Label>
                          <AttributeEditor
                            attributes={fact.attributes}
                            onChange={(attrs) => updateFact(fact.id, { attributes: attrs })}
                          />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── JSON TAB ── */}
            {tab === "json" && (
              <div>
                <Label className="text-sm font-semibold mb-2 block">
                  Request Body (JSON)
                </Label>
                <textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  rows={18}
                  className="w-full font-mono text-sm bg-muted rounded-lg p-3 outline-none focus:ring-2 focus:ring-ring resize-none border"
                />
              </div>
            )}
          </div>

          <Button
            onClick={handleEvaluate}
            disabled={loading}
            className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-5 text-base">
            {loading ? "⏳ Mengevaluasi..." : "⚡ Evaluasi Sekarang"}
          </Button>
        </div>

        {/* ── RIGHT: Result ── */}
        <div className="flex flex-col gap-4">
          <h3 className="font-semibold text-sm">Hasil Evaluasi</h3>

          {/* Idle state */}
          {!result && !loading && (
            <div className="flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-8 text-center text-muted-foreground min-h-75">
              <div className="text-4xl mb-3">⚡</div>
              <div className="font-medium">Belum ada hasil</div>
              <div className="text-xs mt-1">Isi form dan klik &quot;Evaluasi Sekarang&quot;</div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-8 text-center text-muted-foreground min-h-75">
              <div className="text-4xl mb-3 animate-spin">⏳</div>
              <div className="font-medium">Menghubungi evaluation-service...</div>
            </div>
          )}

          {/* Error */}
          {result?.error && (
            <div className="p-4 rounded-xl border border-destructive bg-destructive/10">
              <div className="font-semibold text-destructive mb-1">⚠ Error</div>
              <div className="font-mono text-xs text-destructive">{result.error}</div>
            </div>
          )}

          {/* Result */}
          {result && !result.error && (
            <div className="flex flex-col gap-3">

              {/* Match / No match banner */}
              <div className={`rounded-xl border p-4 text-center
                ${hasMatch
                  ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800"
                  : "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800"}`}>
                <div className="text-3xl mb-1">{hasMatch ? "✅" : "❌"}</div>
                <div className={`font-bold text-lg ${hasMatch ? "text-green-700 dark:text-green-300" : "text-red-600 dark:text-red-400"}`}>
                  {hasMatch ? `${actions.length} Rule Match` : "Tidak Ada Rule yang Match"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {hasMatch ? `${actions.length} action dihasilkan` : "Tidak ada action yang dieksekusi"}
                </div>
              </div>

              {/* Actions list */}
              {hasMatch && (
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Actions ({actions.length})
                  </Label>
                  {actions.map((action, i) => (
                    <Card key={i} className="border-l-4 border-l-green-400">
                      <CardHeader className="pb-1 pt-3 px-4">
                        <CardTitle className="text-xs text-muted-foreground font-mono">
                          Action #{i + 1}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        {Object.entries(action).map(([k, v]) => (
                          <div key={k} className="flex items-start gap-2 text-sm mb-1">
                            <span className="font-mono text-xs text-blue-500 font-semibold min-w-25">{k}</span>
                            <span className="text-xs text-muted-foreground">:</span>
                            <span className="font-mono text-xs">
                              {typeof v === "boolean"
                                ? <Badge variant="outline" className={v ? "text-green-600 border-green-300" : "text-red-500 border-red-300"}>{String(v)}</Badge>
                                : typeof v === "number"
                                ? <span className="text-orange-500 font-semibold">{v}</span>
                                : <span>{String(v)}</span>
                              }
                            </span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Raw JSON */}
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                  Raw Response
                </Label>
                <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-auto max-h-48">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}