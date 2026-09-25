"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { checkRules, reloadRules } from "@/lib/api";
import { toast } from "sonner";
import {
  Zap,
  Play,
  ArrowLeft,
  Bookmark,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  Plus,
  Trash2,
  Code2,
  FolderOpen,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";

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

let _id = 1;
const uid = () => `f${_id++}`;

const mkFact = (): FactAttribute => ({
  id: uid(),
  object: "",
  attributes: {},
});

const formatDateForEval = (dateStr: string): string => {
  if (!dateStr) return "";
  if (/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [yyyy, mm, dd] = dateStr.split("-");
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    return `${dd}-${mm}-${yyyy} ${hh}:${mi}:${ss}`;
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${mi}:${ss}`;
};

function AttributeEditor({
  attributes,
  onChange,
}: {
  attributes: AttributeMap;
  onChange: (attrs: AttributeMap) => void;
}) {
  const [localEntries, setLocalEntries] = useState<[string, string][]>(() =>
    Object.entries(attributes).map(([k, v]) => [
      k,
      typeof v === "string" ? v : JSON.stringify(v),
    ])
  );

  // Sinkronkan localEntries saat attributes dari parent berubah (misal saat load preset)
  useEffect(() => {
    setLocalEntries(
      Object.entries(attributes).map(([k, v]) => [
        k,
        typeof v === "string" ? v : JSON.stringify(v),
      ])
    );
  }, [attributes]);

  const syncToParent = (entries: [string, string][]) => {
    const next: AttributeMap = {};
    entries.forEach(([k, v]) => {
      if (!k) return;
      try {
        next[k] = JSON.parse(v);
      } catch {
        next[k] = v;
      }
    });
    onChange(next);
  };

  const updateLocalKey = (idx: number, newKey: string) => {
    setLocalEntries((prev) => prev.map((e, i) => (i === idx ? [newKey, e[1]] : e)));
  };

  const updateLocalValue = (idx: number, newVal: string) => {
    setLocalEntries((prev) => prev.map((e, i) => (i === idx ? [e[0], newVal] : e)));
  };

  const addEntry = () => {
    const next: [string, string][] = [
      ...localEntries,
      [`field${localEntries.length + 1}`, ""],
    ];
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
            className="font-mono text-xs w-36 h-8 rounded-xl"
          />
          <span className="text-muted-foreground text-xs font-mono font-bold">:</span>
          <Input
            placeholder='value (string / number / ["a","b"] / {...})'
            value={val}
            onChange={(e) => updateLocalValue(idx, e.target.value)}
            onBlur={() => syncToParent(localEntries)}
            className="font-mono text-xs flex-1 h-8 rounded-xl"
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive rounded-lg"
            onClick={() => removeEntry(idx)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-fit text-xs h-7 rounded-xl mt-1 border-dashed"
        onClick={addEntry}
      >
        <Plus className="w-3.5 h-3.5 mr-1" />
        Tambah Attribute
      </Button>
    </div>
  );
}

export default function EvaluatePage() {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [facts, setFacts] = useState<FactAttribute[]>([{ ...mkFact(), object: "Customer" }]);
  const [loading, setLoading] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [result, setResult] = useState<EvalResult | null>(null);
  const [tab, setTab] = useState<"form" | "json">("form");
  const [jsonInput, setJsonInput] = useState(
    JSON.stringify(
      {
        date: new Date().toISOString().split("T")[0],
        factAttributes: [{ object: "Customer", attributes: { membershipTier: "GOLD" } }],
      },
      null,
      2
    )
  );
  const [presets, setPresets] = useState<{ name: string; data: string }[]>([]);
  const [presetName, setPresetName] = useState("");
  const [showPresets, setShowPresets] = useState(false);

  const addFact = () => setFacts((f) => [...f, mkFact()]);
  const removeFact = (id: string) => setFacts((f) => f.filter((x) => x.id !== id));
  const updateFact = useCallback((id: string, patch: Partial<FactAttribute>) => {
    setFacts((f) => f.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);

  const buildPayload = useCallback(() => ({
    date: formatDateForEval(date),
    factAttributes: facts.map(({ object, attributes }) => ({ object, attributes })),
  }), [date, facts]);

  // Sinkronkan data JSON ke Form Simulator (date & facts)
  const syncJsonToForm = useCallback((jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== "object") return;

      if (parsed.date) {
        const rawDate = String(parsed.date).trim();
        const dmyMatch = rawDate.match(/^(\d{2})-(\d{2})-(\d{4})/);
        const ymdMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (dmyMatch) {
          setDate(`${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`);
        } else if (ymdMatch) {
          setDate(`${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`);
        }
      }

      if (Array.isArray(parsed.factAttributes)) {
        setFacts(
          parsed.factAttributes.map((f: { object?: string; attributes?: Record<string, unknown> }) => ({
            id: uid(),
            object: f.object ?? "",
            attributes: f.attributes && typeof f.attributes === "object" ? f.attributes : {},
          }))
        );
      }
    } catch {
      // Abaikan jika JSON sedang diketik atau belum valid
    }
  }, []);

  const handleTabSwitch = (t: "form" | "json") => {
    if (t === "json") {
      setJsonInput(JSON.stringify(buildPayload(), null, 2));
    } else {
      syncJsonToForm(jsonInput);
    }
    setTab(t);
  };

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
        toast.success(`${count} rule match ditemukan!`);
      } else {
        toast.info("Evaluasi selesai — tidak ada rule yang match.");
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { errors?: { message: string }[]; message?: string } }; message?: string };
      const backendError =
        err.response?.data?.errors?.[0]?.message ||
        err.response?.data?.message ||
        (e instanceof Error ? e.message : "Gagal menghubungi evaluation-service");
      setResult({ error: backendError });
      toast.error("Evaluasi gagal — " + backendError);
    } finally {
      setLoading(false);
    }
  };

  const handleReload = async () => {
    setReloading(true);
    try {
      await reloadRules();
      toast.success("Rules engine berhasil di-reload dari database MongoDB!");
    } catch (e: unknown) {
      const err = e as { response?: { data?: { errors?: { message: string }[]; message?: string } }; message?: string };
      const backendError =
        err.response?.data?.errors?.[0]?.message ||
        err.response?.data?.message ||
        (e instanceof Error ? e.message : "Gagal reload rules engine");
      toast.error("Reload gagal — " + backendError);
    } finally {
      setReloading(false);
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

    let payload: string;
    if (tab === "json") {
      try {
        const parsed = JSON.parse(jsonInput);
        payload = JSON.stringify(parsed, null, 2);
        syncJsonToForm(payload);
      } catch (err: unknown) {
        toast.error(`Format JSON tidak valid: ${(err as Error).message}`);
        return;
      }
    } else {
      payload = JSON.stringify(buildPayload(), null, 2);
      setJsonInput(payload);
    }

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
      const formatted = JSON.stringify(parsed, null, 2);

      // 1. Selalu update raw JSON input
      setJsonInput(formatted);

      // 2. Sinkronkan ke form simulator
      syncJsonToForm(formatted);

      // 3. Tutup menu preset (tetap berada di tab yang aktif saat ini)
      setShowPresets(false);
      toast.success(`Preset "${preset.name}" berhasil dimuat`);
    } catch (err: unknown) {
      toast.error("Gagal memuat preset: " + (err as Error).message);
    }
  };

  const handleDeletePreset = (name: string) => {
    const next = presets.filter((p) => p.name !== name);
    setPresets(next);
    localStorage.setItem("evaluate_presets", JSON.stringify(next));
    toast.success(`Preset "${name}" dihapus`);
  };

  const isJsonValid = (() => {
    try {
      JSON.parse(jsonInput);
      return true;
    } catch {
      return false;
    }
  })();

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto flex flex-col gap-6">
      {/* ─── Header ─── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Test Evaluasi Rule
            </h1>
            <Badge variant="outline" className="text-xs font-mono text-amber-600 bg-amber-50 dark:bg-amber-950 border-amber-200">
              ⚡ Simulator
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Kirim payload fact attributes ke evaluation-service untuk memvalidasi rule matching
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            disabled={reloading}
            onClick={handleReload}
            className="h-9 text-xs rounded-xl gap-1.5 border-border hover:bg-muted"
            title="Reload engine DRL dari database MongoDB"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-500 ${reloading ? "animate-spin" : ""}`} />
            <span>{reloading ? "Reloading..." : "Reload Engine"}</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => router.push("/rules")}
            className="h-9 text-xs rounded-xl gap-1.5 border-border hover:bg-muted"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Katalog Rules</span>
          </Button>
        </div>
      </div>

      {/* ─── Preset Bar ─── */}
      <div className="p-3 rounded-2xl bg-card border border-border shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Simpan nama preset (cth: Customer Gold Promo)..."
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
            className="h-8.5 text-xs w-64 rounded-xl"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!presetName.trim()}
            onClick={handleSavePreset}
            className="h-8.5 text-xs rounded-xl gap-1.5"
          >
            <Bookmark className="w-3.5 h-3.5 text-primary" />
            <span>Simpan Preset</span>
          </Button>
        </div>

        {presets.length > 0 && (
          <div className="relative" data-preset-dropdown>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowPresets((v) => !v)}
              className="h-8.5 text-xs rounded-xl gap-1.5"
            >
              <FolderOpen className="w-3.5 h-3.5 text-blue-500" />
              <span>Saved Presets ({presets.length})</span>
            </Button>

            {showPresets && (
              <div className="absolute right-0 top-10 z-50 w-72 bg-popover border border-border rounded-2xl shadow-xl overflow-hidden animate-in fade-in duration-150">
                <div className="px-3 py-2 border-b text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/30">
                  Daftar Preset Tersimpan
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-border/60">
                  {presets.map((preset) => (
                    <div
                      key={preset.name}
                      className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/50 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => handleLoadPreset(preset)}
                        className="flex-1 text-left text-xs truncate font-medium text-foreground hover:text-primary"
                      >
                        {preset.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePreset(preset.name)}
                        className="text-muted-foreground hover:text-destructive p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Two-Column: Input Form + Result Card ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 items-start">
        {/* Left: Input Payload */}
        <div className="flex flex-col gap-4">
          {/* Tab Selector */}
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-2xl border border-border w-fit">
            <button
              type="button"
              onClick={() => handleTabSwitch("form")}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                tab === "form"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>Form Simulator</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabSwitch("json")}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                tab === "json"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Code2 className="w-3.5 h-3.5 text-blue-500" />
              <span>Raw JSON</span>
            </button>
          </div>

          <div className="p-5 rounded-3xl border border-border bg-card shadow-xs flex flex-col gap-5">
            {tab === "form" ? (
              <div className="flex flex-col gap-5">
                {/* Tanggal */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Tanggal Evaluasi
                  </Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-44 h-9 text-xs rounded-xl"
                    />
                    <span className="text-[11px] font-mono text-muted-foreground">
                      Format: <code className="bg-muted px-1.5 py-0.5 rounded">{formatDateForEval(date)}</code>
                    </span>
                  </div>
                </div>

                {/* Facts List */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Fact Attributes ({facts.length})
                    </Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={addFact}
                      className="h-7 text-xs rounded-xl gap-1 border-dashed"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Tambah Fact</span>
                    </Button>
                  </div>

                  <div className="flex flex-col gap-3">
                    {facts.map((fact, i) => (
                      <div
                        key={fact.id}
                        className="rounded-2xl border border-blue-200/70 dark:border-blue-900/60 bg-blue-50/20 dark:bg-blue-950/10 p-4 flex flex-col gap-3"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] font-mono">
                            Fact #{i + 1}
                          </Badge>
                          <Input
                            placeholder="Object name (cth: Customer, Cart, Branch)"
                            value={fact.object}
                            onChange={(e) => updateFact(fact.id, { object: e.target.value })}
                            className="h-8 text-xs font-mono rounded-xl flex-1 bg-background"
                          />
                          {facts.length > 1 && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive rounded-lg"
                              onClick={() => removeFact(fact.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>

                        <AttributeEditor
                          attributes={fact.attributes}
                          onChange={(attrs) => updateFact(fact.id, { attributes: attrs })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Payload Body JSON
                    </Label>
                    {isJsonValid ? (
                      <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                        ✓ Valid JSON
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px] py-0 px-1.5">
                        Invalid JSON
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] gap-1 rounded-xl"
                      onClick={() => {
                        const sample = {
                          date: formatDateForEval(new Date().toISOString().split("T")[0]),
                          factAttributes: [
                            {
                              object: "Customer",
                              attributes: {
                                membershipTier: "GOLD",
                              },
                            },
                            {
                              object: "Transaction",
                              attributes: {
                                totalAmount: 250000,
                              },
                            },
                          ],
                        };
                        const str = JSON.stringify(sample, null, 2);
                        setJsonInput(str);
                        syncJsonToForm(str);
                      }}
                    >
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      Contoh
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] rounded-xl"
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(jsonInput);
                          setJsonInput(JSON.stringify(parsed, null, 2));
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
                      className="h-7 text-[11px] gap-1 rounded-xl"
                      onClick={() => {
                        navigator.clipboard.writeText(jsonInput);
                        toast.success("JSON disalin ke clipboard!");
                      }}
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </Button>
                  </div>
                </div>

                <textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  rows={16}
                  className="w-full font-mono text-xs bg-slate-950 text-slate-100 rounded-2xl p-4 outline-none focus:ring-2 focus:ring-blue-500 resize-none border border-border leading-relaxed"
                />
              </div>
            )}

            <Button
              type="button"
              onClick={handleEvaluate}
              disabled={loading}
              className="w-full h-11 text-xs font-semibold rounded-2xl gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  <span>Mengevaluasi ke Service...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Evaluasi Sekarang</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Right: Output Result */}
        <div className="flex flex-col gap-3">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Hasil Evaluasi
          </Label>

          {/* Idle State */}
          {!result && !loading && (
            <div className="min-h-[400px] rounded-3xl border-2 border-dashed border-border bg-muted/20 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                <Zap className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="font-semibold text-foreground text-sm">Belum Ada Hasil</div>
              <div className="text-xs mt-1 max-w-xs">
                Masukkan fact attributes di form sebelah kiri dan tekan &quot;Evaluasi Sekarang&quot;
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="min-h-[400px] rounded-3xl border border-border bg-card flex flex-col items-center justify-center p-8 text-center text-muted-foreground shadow-xs">
              <span className="w-8 h-8 rounded-full border-3 border-primary/30 border-t-primary animate-spin mb-3" />
              <div className="font-semibold text-foreground text-sm">Mengevaluasi Rule...</div>
              <div className="text-xs mt-1">Mengirim facts ke Drools evaluation engine</div>
            </div>
          )}

          {/* Error State */}
          {result?.error && (
            <div className="p-4 rounded-2xl border border-destructive/30 bg-destructive/10 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-destructive">Evaluasi Gagal</div>
                <div className="text-xs font-mono text-destructive/90 mt-1">{result.error}</div>
              </div>
            </div>
          )}

          {/* Success State */}
          {result && !result.error && (
            <div className="flex flex-col gap-4">
              {/* Match Banner */}
              <div
                className={`p-4 rounded-2xl border flex items-center gap-3.5 shadow-xs ${
                  hasMatch
                    ? "bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900"
                    : "bg-slate-50/70 border-slate-200 dark:bg-slate-900/30 dark:border-slate-800"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                    hasMatch
                      ? "bg-emerald-600 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {hasMatch ? <CheckCircle2 className="w-5 h-5" /> : "—"}
                </div>
                <div>
                  <div
                    className={`text-sm font-bold ${
                      hasMatch ? "text-emerald-700 dark:text-emerald-300" : "text-foreground"
                    }`}
                  >
                    {hasMatch ? `${actions.length} Rule Match Berhasil!` : "Tidak Ada Rule yang Cocok"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {hasMatch
                      ? `${actions.length} action prosedur dieksekusi`
                      : "Kriteria rule tidak terpenuhi oleh fact yang diberikan"}
                  </div>
                </div>
              </div>

              {/* Action Outputs List */}
              {hasMatch && (
                <div className="flex flex-col gap-2.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Daftar Action ({actions.length})
                  </div>
                  {actions.map((action, i) => (
                    <div
                      key={i}
                      className="p-3.5 rounded-2xl border border-purple-200/80 dark:border-purple-900/60 bg-purple-50/30 dark:bg-purple-950/20 shadow-xs flex flex-col gap-1.5"
                    >
                      <div className="text-[10px] font-bold font-mono text-purple-600 dark:text-purple-400 uppercase">
                        Action #{i + 1}
                      </div>
                      <div className="flex flex-col gap-1 font-mono text-xs">
                        {Object.entries(action).map(([k, v]) => (
                          <div key={k} className="flex items-start gap-2">
                            <span className="font-semibold text-foreground min-w-24">{k}</span>
                            <span className="text-muted-foreground">:</span>
                            <span className="text-purple-600 dark:text-purple-300 font-bold">
                              {typeof v === "boolean"
                                ? v ? "TRUE" : "FALSE"
                                : typeof v === "object"
                                ? JSON.stringify(v)
                                : String(v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Raw JSON Accordion */}
              <div className="rounded-2xl border border-border bg-card p-3 shadow-xs">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Raw Response JSON
                </div>
                <pre className="p-3 rounded-xl bg-muted/40 text-[11px] font-mono overflow-auto max-h-48 border border-border/60">
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
