"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, GitBranch } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────
export interface LeafNode {
  id: string;
  type: "leaf";
  object: string;
  attribute: string;
  operator: string;
  value: string;
}

export interface GroupNode {
  id: string;
  type: "group";
  operator: "AND" | "OR";
  children: ConditionNode[];
}

export type ConditionNode = LeafNode | GroupNode;

// ─── Operators ──────────────────────────────────────────────
export const OPERATORS: Record<string, string[]> = {
  Equality:   ["EQUAL", "NOT_EQUAL", "EQUALS_IGNORE_CASE"],
  Comparison: ["MORE_THAN", "LESS_THAN", "MORE_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL"],
  Collection: ["IN", "NOT_IN"],
  String:     ["CONTAINS", "STARTS_WITH", "ENDS_WITH", "MATCHES"],
  "Null/Empty": ["NULL", "NOT_NULL", "EMPTY", "NOT_EMPTY"],
  Validation: ["VALID_EMAIL", "VALID_DATE", "NUMERIC", "TRUE"],
};

export const NO_VALUE_OPS = new Set([
  "NULL", "NOT_NULL", "EMPTY", "NOT_EMPTY",
  "VALID_EMAIL", "NUMERIC", "TRUE", "VALID_DATE",
]);

export const LIST_OPS = new Set(["IN", "NOT_IN"]);

export const NUMERIC_OPS = new Set([
  "MORE_THAN", "LESS_THAN",
  "MORE_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL",
]);

// ─── Helpers ────────────────────────────────────────────────
export const uid = () => `n_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
export const mkLeaf = (): LeafNode => ({ id: uid(), type: "leaf", object: "", attribute: "", operator: "EQUAL", value: "" });
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

// ─── Component ──────────────────────────────────────────────
interface Props {
  node: ConditionNode;
  depth?: number;
  onUpdate: (id: string, updater: (n: ConditionNode) => ConditionNode) => void;
  onRemove: (id: string) => void;
  onAddChild: (parentId: string, node: ConditionNode) => void;
  viewMode?: boolean;
}

const DEPTH_COLORS = [
  "border-blue-500/50 dark:border-blue-400/40",
  "border-emerald-500/50 dark:border-emerald-400/40",
  "border-amber-500/50 dark:border-amber-400/40",
  "border-purple-500/50 dark:border-purple-400/40",
];

const GROUP_COLORS = {
  AND: "bg-blue-600 text-white dark:bg-blue-500",
  OR: "bg-amber-600 text-white dark:bg-amber-500",
};

export function RuleConditionNode({ node, depth = 0, onUpdate, onRemove, onAddChild, viewMode = false }: Props) {
  const depthColor = DEPTH_COLORS[depth % DEPTH_COLORS.length];

  if (node.type === "group") {
    return (
      <div className={`relative pl-4 sm:pl-5 border-l-2 ${depthColor} my-2`}>
        {/* Group header */}
        <div className="flex flex-wrap items-center gap-2 mb-3 bg-card/60 p-2 rounded-xl border border-border/80 backdrop-blur-sm">
          {/* AND / OR toggle */}
          <div className="flex rounded-lg overflow-hidden border border-border bg-muted/40 p-0.5">
            {(["AND", "OR"] as const).map((op) => (
              <button
                type="button"
                key={op}
                onClick={() => onUpdate(node.id, (n) => n.type === "group" ? { ...n, operator: op } : n)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  node.operator === op
                    ? `${GROUP_COLORS[op]} shadow-xs`
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {op}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
            <GitBranch className="w-3.5 h-3.5" />
            <span>{depth === 0 ? "Root Condition Gate" : `Sub-Group Level ${depth}`}</span>
          </div>

          {!viewMode && (
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-border/80 hover:bg-primary/5 hover:text-primary hover:border-primary/40"
                onClick={() => onAddChild(node.id, mkLeaf())}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Kondisi</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-border/80 hover:bg-secondary"
                onClick={() => onAddChild(node.id, mkGroup())}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Group</span>
              </Button>
              {depth > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => onRemove(node.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Children */}
        <div className="flex flex-col gap-2.5">
          {node.children.length === 0 && (
            <div className="py-6 px-4 border-2 border-dashed rounded-xl text-center text-xs text-muted-foreground bg-muted/10">
              Belum ada kondisi di group ini. Klik <strong className="text-foreground">+ Kondisi</strong> untuk menambahkan kriteria evaluasi.
            </div>
          )}
          {node.children.map((child, i) => (
            <div key={child.id} className="relative">
              {i > 0 && (
                <div className="flex items-center gap-2 my-1.5">
                  <div className="flex-1 h-px bg-border/60" />
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${GROUP_COLORS[node.operator]}`}>
                    {node.operator}
                  </span>
                  <div className="flex-1 h-px bg-border/60" />
                </div>
              )}
              <RuleConditionNode
                node={child}
                depth={depth + 1}
                onUpdate={onUpdate}
                onRemove={onRemove}
                onAddChild={onAddChild}
                viewMode={viewMode}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Leaf Node ──────────────────────────────────────────────
  const needsValue = !NO_VALUE_OPS.has(node.operator);

  return (
    <div className="group relative flex flex-wrap items-center gap-2 p-3 rounded-xl border border-border bg-card hover:border-slate-300 dark:hover:border-slate-700 shadow-xs transition-all">
      <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
        <Input
          placeholder="Object (cth: Customer)"
          value={node.object}
          onChange={(e) => onUpdate(node.id, (n) => n.type === "leaf" ? { ...n, object: e.target.value } : n)}
          className="font-mono text-xs h-8 bg-background border-border/80 flex-1 min-w-[80px]"
        />
        <span className="text-muted-foreground font-mono text-xs">.</span>
        <Input
          placeholder="Attribute (cth: status)"
          value={node.attribute}
          onChange={(e) => onUpdate(node.id, (n) => n.type === "leaf" ? { ...n, attribute: e.target.value } : n)}
          className="font-mono text-xs h-8 bg-background border-border/80 flex-1 min-w-[90px]"
        />
      </div>

      <Select
        value={node.operator}
        onValueChange={(val) => onUpdate(node.id, (n) => n.type === "leaf" ? { ...n, operator: val } : n)}
      >
        <SelectTrigger className="w-36 sm:w-44 font-mono text-xs h-8 bg-background border-border/80 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(OPERATORS).map(([group, ops]) => (
            <SelectGroup key={group}>
              <SelectLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">{group}</SelectLabel>
              {ops.map((op) => (
                <SelectItem key={op} value={op} className="font-mono text-xs">
                  {op}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      {needsValue ? (
        <div className="flex-1 min-w-[120px]">
          <Input
            placeholder={
              LIST_OPS.has(node.operator)
                ? "val1, val2, val3"
                : NUMERIC_OPS.has(node.operator)
                ? "contoh: 25"
                : "value"
            }
            value={node.value}
            onChange={(e) => onUpdate(node.id, (n) => n.type === "leaf" ? { ...n, value: e.target.value } : n)}
            className="font-mono text-xs h-8 bg-background border-border/80 w-full"
          />
        </div>
      ) : (
        <div className="flex-1 min-w-[120px] px-3 py-1.5 text-xs text-muted-foreground italic bg-muted/20 rounded-md border border-dashed border-border/60">
          Tidak perlu value
        </div>
      )}

      {!viewMode && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 rounded-lg ml-auto sm:ml-0"
          onClick={() => onRemove(node.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}
