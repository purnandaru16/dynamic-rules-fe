"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Plus, Trash2, GripVertical, Search, Check, FolderTree, ChevronRight,
} from "lucide-react";
import { OBJECT_DEFINITIONS } from "@/lib/objects";

// ─── Types ────────────────────────────────────────────────────
export interface LeafNode {
  id: string;
  type: "leaf";
  object: string;
  attribute: string;
  operator: string;
  value: string;
  enabled: boolean;
}

export interface GroupNode {
  id: string;
  type: "group";
  operator: "AND" | "OR";
  children: ConditionNode[];
}

export type ConditionNode = LeafNode | GroupNode;

// ─── Operators ───────────────────────────────────────────────
const OPERATORS: Record<string, string[]> = {
  Equality:   ["EQUAL", "NOT_EQUAL", "EQUALS_IGNORE_CASE"],
  Comparison: ["MORE_THAN", "LESS_THAN", "MORE_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL"],
  Collection: ["IN", "NOT_IN"],
  String:     ["CONTAINS", "STARTS_WITH", "ENDS_WITH", "MATCHES"],
  "Null/Empty": ["NULL", "NOT_NULL", "EMPTY", "NOT_EMPTY"],
  Validation: ["VALID_EMAIL", "VALID_DATE", "NUMERIC", "TRUE"],
};

const NO_VALUE_OPS = new Set([
  "NULL", "NOT_NULL", "EMPTY", "NOT_EMPTY",
  "VALID_EMAIL", "NUMERIC", "TRUE", "VALID_DATE",
]);

const LIST_OPS = new Set(["IN", "NOT_IN"]);

const NUMERIC_OPS = new Set([
  "MORE_THAN", "LESS_THAN",
  "MORE_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL",
]);

// Gaya operator — warna badge berdasar tipe (mirip caseflow)
const OP_STYLE: Record<string, { text: string; chip: string; symbol: string }> = {
  EQUAL:                { text: "text-violet-700", chip: "bg-violet-100 text-violet-700",                 symbol: "=" },
  NOT_EQUAL:            { text: "text-violet-700", chip: "bg-violet-100 text-violet-700",                 symbol: "≠" },
  EQUALS_IGNORE_CASE:   { text: "text-violet-700", chip: "bg-violet-100 text-violet-700",                 symbol: "≈" },
  MORE_THAN:            { text: "text-teal-600",   chip: "bg-teal-100 text-teal-700",                     symbol: ">" },
  LESS_THAN:            { text: "text-teal-600",   chip: "bg-teal-100 text-teal-700",                     symbol: "<" },
  MORE_THAN_OR_EQUAL:   { text: "text-teal-600",   chip: "bg-teal-100 text-teal-700",                     symbol: "≥" },
  LESS_THAN_OR_EQUAL:   { text: "text-teal-600",   chip: "bg-teal-100 text-teal-700",                     symbol: "≤" },
  IN:                   { text: "text-sky-600",    chip: "bg-sky-100 text-sky-700",                       symbol: "∈" },
  NOT_IN:               { text: "text-sky-600",    chip: "bg-sky-100 text-sky-700",                       symbol: "∉" },
  CONTAINS:             { text: "text-amber-600",  chip: "bg-amber-100 text-amber-700",                   symbol: "∋" },
  STARTS_WITH:          { text: "text-amber-600",  chip: "bg-amber-100 text-amber-700",                   symbol: "⊒" },
  ENDS_WITH:            { text: "text-amber-600",  chip: "bg-amber-100 text-amber-700",                   symbol: "⊑" },
  MATCHES:              { text: "text-amber-600",  chip: "bg-amber-100 text-amber-700",                   symbol: "≋" },
  NULL:                 { text: "text-slate-500",  chip: "bg-slate-100 text-slate-600",                   symbol: "∅" },
  NOT_NULL:             { text: "text-slate-500",  chip: "bg-slate-100 text-slate-600",                   symbol: "∅̸" },
  EMPTY:                { text: "text-slate-500",  chip: "bg-slate-100 text-slate-600",                   symbol: "□" },
  NOT_EMPTY:            { text: "text-slate-500",  chip: "bg-slate-100 text-slate-600",                   symbol: "▣" },
  VALID_EMAIL:          { text: "text-emerald-600",chip: "bg-emerald-100 text-emerald-700",               symbol: "@" },
  VALID_DATE:           { text: "text-emerald-600",chip: "bg-emerald-100 text-emerald-700",               symbol: "🗓" },
  NUMERIC:              { text: "text-emerald-600",chip: "bg-emerald-100 text-emerald-700",               symbol: "123" },
  TRUE:                 { text: "text-emerald-600",chip: "bg-emerald-100 text-emerald-700",               symbol: "✓" },
};

// Ikon type badge di dropdown field (caseflow: txt/123/calendar)
const TYPE_ICON: Record<string, string> = { string: "Abc", number: "123", boolean: "T/F" };

// ─── Helpers ─────────────────────────────────────────────────
let _id = 1;
export const uid = () => `n${_id++}`;
export const mkLeaf = (): LeafNode => ({ id: uid(), type: "leaf", object: "", attribute: "", operator: "EQUAL", value: "", enabled: true });
export const mkGroup = (op: "AND" | "OR" = "AND"): GroupNode => ({ id: uid(), type: "group", operator: op, children: [] });

export const updateNode = (tree: ConditionNode, id: string, updater: (n: ConditionNode) => ConditionNode): ConditionNode => {
  if (tree.id === id) return updater(tree);
  if (tree.type === "group") return { ...tree, children: tree.children.map((c) => updateNode(c, id, updater)) };
  return tree;
};

export const removeNode = (tree: ConditionNode, id: string): ConditionNode => {
  if (tree.type !== "group") return tree;
  return { ...tree, children: tree.children.filter((c) => c.id !== id).map((c) => removeNode(c, id)) };
};

export const addChild = (tree: ConditionNode, parentId: string, node: ConditionNode): ConditionNode => {
  if (tree.id === parentId && tree.type === "group") return { ...tree, children: [...tree.children, node] };
  if (tree.type === "group") return { ...tree, children: tree.children.map((c) => addChild(c, parentId, node)) };
  return tree;
};

// Pindah node naik/turun satu posisi dalam daftar anak group
export const moveNode = (tree: ConditionNode, id: string, dir: -1 | 1): ConditionNode => {
  if (tree.type !== "group") return tree;
  const idx = tree.children.findIndex((c) => c.id === id);
  if (idx === -1) {
    return { ...tree, children: tree.children.map((c) => moveNode(c, id, dir)) };
  }
  const target = idx + dir;
  if (target < 0 || target >= tree.children.length) return tree;
  const children = [...tree.children];
  const [node] = children.splice(idx, 1);
  children.splice(target, 0, node);
  return { ...tree, children };
};

// ─── Toggle switch (caseflow style) ─────────────────────────
function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors
        ${checked ? "bg-violet-600" : "bg-slate-300 dark:bg-slate-600"}`}
    >
      <span className={`inline-block size-3.5 transform rounded-full bg-white shadow transition-transform
        ${checked ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
    </button>
  );
}

// ─── Field Picker (object → attribute, searchable, caseflow) ─
function FieldPicker({ value, onChange, placeholder, disabled }: {
  value: string;
  onChange: (obj: string, attr: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [manual, setManual] = useState(false);
  const [mObj, setMObj] = useState("");
  const [mAttr, setMAttr] = useState("");

  // Parse "object.attribute"
  const parsed = (() => {
    const dot = value.lastIndexOf(".");
    if (dot === -1) return ["", value] as const;
    return [value.slice(0, dot), value.slice(dot + 1)] as const;
  })();
  const curObj = parsed[0];
  const curAttr = parsed[1];

  const display = curObj ? `${curObj}.${curAttr}` : value;

  // Masuk mode manual: ambil value saat ini sebagai draft
  const enterManual = () => {
    setMObj(curObj);
    setMAttr(curAttr);
    setManual(true);
    setQ("");
  };

  const confirmManual = () => {
    const o = mObj.trim();
    const a = mAttr.trim();
    if (o || a) onChange(o, a);
    setOpen(false);
    setManual(false);
  };

  // Filter object/attr berdasar query
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return OBJECT_DEFINITIONS;
    return OBJECT_DEFINITIONS
      .map((obj) => ({
        ...obj,
        attributes: obj.attributes.filter((a) =>
          a.name.toLowerCase().includes(query) ||
          (obj.name + a.name).toLowerCase().includes(query)
        ),
      }))
      .filter((obj) => obj.attributes.length > 0);
  }, [q]);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setManual(false); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={`h-8 min-w-0 flex items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-mono text-left transition-colors
            ${disabled ? "opacity-50 cursor-not-allowed" : "border-input hover:border-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-950/30 cursor-pointer"}
            ${value ? "text-slate-800 dark:text-slate-200" : "text-muted-foreground"}`}
        >
          <FolderTree className="size-3.5 shrink-0 text-violet-500" />
          <span className="truncate">{display || placeholder}</span>
          <ChevronRight className="size-3 shrink-0 rotate-90 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {/* Search */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="size-3.5 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search field"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {/* Switch predefined ⇄ manual */}
        <div className="flex gap-3 border-b border-border px-3 py-1.5 text-[11px] font-medium">
          <button type="button"
            onClick={() => setManual(false)}
            className={`transition-colors ${!manual ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground hover:text-foreground"}`}>
            Predefined
          </button>
          <button type="button"
            onClick={enterManual}
            className={`transition-colors ${manual ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground hover:text-foreground"}`}>
            Manual
          </button>
        </div>
        {manual ? (
          <div className="flex flex-col gap-2 p-3">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Object</label>
              <input
                value={mObj}
                onChange={(e) => setMObj(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmManual()}
                placeholder="e.g. Customer"
                className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs font-mono outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Attribute</label>
              <input
                value={mAttr}
                onChange={(e) => setMAttr(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmManual()}
                placeholder="e.g. loyaltyScore"
                className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs font-mono outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => { setManual(false); setMObj(""); setMAttr(""); }}
                className="rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted">
                Cancel
              </button>
              <button type="button" onClick={confirmManual}
                className="rounded-md bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-violet-700">
                Apply
              </button>
            </div>
          </div>
        ) : (
        /* Tree list */
        <div className="max-h-72 overflow-y-auto py-1.5">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">No matching field</div>
          )}
          {filtered.map((obj) => (
            <div key={obj.name}>
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <ChevronRight className="size-3" /> {obj.name}
              </div>
              {obj.attributes.map((attr) => {
                const selected = curObj === obj.name && curAttr === attr.name;
                return (
                  <button
                    key={attr.name}
                    type="button"
                    onClick={() => { onChange(obj.name, attr.name); setOpen(false); }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors
                      ${selected ? "text-violet-700 bg-violet-50" : "text-foreground hover:bg-muted/50"}`}
                  >
                    <span className={`shrink-0 ${selected ? "text-violet-700" : "text-muted-foreground"}`}>
                      {selected ? <Check className="size-3.5" /> : <FolderTree className="size-3.5" />}
                    </span>
                    <span className="flex-1 truncate font-mono">{attr.name}</span>
                    <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] font-semibold text-muted-foreground">
                      {TYPE_ICON[attr.type] ?? attr.type}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Operator badge (caseflow: pill berwarna, togglable) ─────
function OperatorPill({ operator, onChange, disabled }: {
  operator: string;
  onChange: (op: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const style = OP_STYLE[operator] ?? OP_STYLE.EQUAL;
  const sym = style.symbol;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={`h-8 shrink-0 w-9 rounded-full text-sm font-bold transition-colors ${style.chip}
            ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:brightness-95 ring-0 hover:ring-2 ring-offset-1 ring-offset-transparent"}`}
          title={operator}
        >
          {sym}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-2" align="start">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(OPERATORS).map(([group, ops]) => (
            <div key={group} className="w-full">
              <div className="mb-1 mt-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{group}</div>
              <div className="flex flex-wrap gap-1">
                {ops.map((op) => (
                  <button
                    key={op}
                    type="button"
                    onClick={() => { onChange(op); setOpen(false); }}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors
                      ${operator === op ? OP_STYLE[op]?.chip + " ring-1 ring-offset-1" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                  >
                    {OP_STYLE[op]?.symbol} {op}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Component ───────────────────────────────────────────────
interface Props {
  node: ConditionNode;
  depth?: number;
  onUpdate: (id: string, updater: (n: ConditionNode) => ConditionNode) => void;
  onRemove: (id: string) => void;
  onAddChild: (parentId: string, node: ConditionNode) => void;
  viewMode?: boolean;
}

export function RuleConditionNode({ node, depth = 0, onUpdate, onRemove, onAddChild, viewMode = false }: Props) {
  const indentation = depth * 8;

  if (node.type === "group") {
    return (
      <div className="flex flex-col gap-2" style={{ marginLeft: depth === 0 ? 0 : indentation }}>
        {/* Group header */}
        <div className="flex items-center gap-2">
          {/* AND/OR toggle — filled purple (caseflow) */}
          {!viewMode ? (
            <div className="flex rounded-full overflow-hidden border border-violet-200 bg-violet-50 dark:bg-violet-950/40 dark:border-violet-800">
              {(["AND", "OR"] as const).map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => onUpdate(node.id, (n) => ({ ...n, operator: op }))}
                  className={`px-3 py-1 text-xs font-bold transition-colors
                    ${node.operator === op
                      ? "bg-violet-600 text-white"
                      : "text-violet-600 dark:text-violet-300 hover:bg-violet-100/50"}`}
                >
                  {op}
                </button>
              ))}
            </div>
          ) : (
            <span className="px-3 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-bold">{node.operator}</span>
          )}

          <span className="text-xs text-muted-foreground">
            {depth === 0 ? "All conditions must be satisfied" : "Condition group"}
          </span>

          {!viewMode && depth > 0 && (
            <Button size="sm" variant="ghost" className="ml-auto h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => onRemove(node.id)}>
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>

        {/* Children */}
        <div className="flex flex-col gap-2">
          {node.children.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-muted/30 px-4 py-5 text-center text-sm text-muted-foreground">
              No conditions yet — click &quot;Add condition&quot; below
            </div>
          )}

          {node.children.map((child, i) => (
            <div key={child.id} className="relative flex flex-col gap-2">
              {/* separator + connector */}
              {i > 0 && (
                <div className="flex items-center gap-2 pl-8">
                  <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${node.operator === "AND" ? "bg-violet-600 text-white" : "bg-rose-500 text-white"}`}>
                    {node.operator}
                  </span>
                </div>
              )}

              <RuleConditionNode
                node={child}
                depth={depth + 1}
                onUpdate={onUpdate}
                onRemove={onRemove}
                onAddChild={onAddChild}
              />

              {/* reorder buttons (kiri, absolute) */}
              {!viewMode && depth > 0 && (
                <div className="absolute left-0 top-1/2 flex -translate-y-1/2 flex-col">
                  <button type="button" className="p-0.5 text-slate-300 hover:text-slate-500"
                    onClick={() => onUpdate(node.id, (n) => moveNode(n, child.id, -1))}>
                    <ChevronRight className="size-3 rotate-90 text-current" />
                  </button>
                  <button type="button" className="p-0.5 text-slate-300 hover:text-slate-500"
                    onClick={() => onUpdate(node.id, (n) => moveNode(n, child.id, 1))}>
                    <ChevronRight className="size-3 -rotate-90 text-current" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Bounding */}
          {!viewMode && (
            <div className="flex items-center gap-3 pl-8">
              <button
                type="button"
                onClick={() => onAddChild(node.id, mkLeaf())}
                className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-700 hover:underline dark:text-violet-400"
              >
                <Plus className="size-3.5" /> Add condition
              </button>
              {depth < 2 && (
                <button
                  type="button"
                  onClick={() => onAddChild(node.id, mkGroup())}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:underline dark:text-slate-400"
                >
                  <FolderTree className="size-3.5" /> Add group
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Leaf Node (caseflow row) ──────────────────────────────
  const needsValue = !NO_VALUE_OPS.has(node.operator);
  const fieldValue = node.object ? `${node.object}.${node.attribute}` : "";
  const disabled = viewMode || !node.enabled;
  const dimmed = !node.enabled;

  return (
    <div className={`group flex items-center gap-2 rounded-xl border bg-muted/40 px-2 py-2 transition-colors
      ${dimmed ? "opacity-60 border-slate-200" : "border-slate-200 hover:border-violet-300 dark:border-slate-700 dark:hover:border-violet-800 dark:hover:bg-muted/60"}`}>

      {/* drag handle */}
      <span className="shrink-0 cursor-grab text-slate-300 group-hover:text-slate-400">
        <GripVertical className="size-4" />
      </span>

      {/* Field picker */}
      <FieldPicker
        value={fieldValue}
        disabled={disabled}
        placeholder="Select field..."
        onChange={(obj, attr) => onUpdate(node.id, (n) => ({ ...n, object: obj, attribute: attr }))}
      />

      {/* Operator */}
      <OperatorPill
        operator={node.operator}
        disabled={disabled}
        onChange={(op) => onUpdate(node.id, (n) => (n.type === "leaf" ? { ...n, operator: op } : n))}
      />

      {/* Value */}
      {needsValue ? (
        <Input
          value={node.value}
          disabled={disabled}
          onChange={(e) => onUpdate(node.id, (n) => ({ ...n, value: e.target.value }))}
          placeholder={LIST_OPS.has(node.operator) ? "val1, val2" : NUMERIC_OPS.has(node.operator) ? "number" : "value"}
          className="h-8 flex-1 min-w-0 text-xs font-mono"
        />
      ) : (
        <div className="flex-1 px-2 text-xs text-slate-400 italic">—</div>
      )}

      {/* Toggle enable */}
      {!viewMode && (
        <Switch checked={node.enabled} onChange={(v) => onUpdate(node.id, (n) => ({ ...n, enabled: v }))} />
      )}

      {/* Trash */}
      {!viewMode && (
        <Button size="sm" variant="ghost"
          className="h-7 w-7 p-0 shrink-0 text-slate-400 hover:text-destructive hover:bg-destructive/10"
          onClick={() => onRemove(node.id)}>
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}