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

// ─── Types ────────────────────────────────────────────────────
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

// ─── Helpers ─────────────────────────────────────────────────
let _id = 1;
export const uid = () => `n${_id++}`;
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

// ─── Component ───────────────────────────────────────────────
interface Props {
  node: ConditionNode;
  depth?: number;
  onUpdate: (id: string, updater: (n: ConditionNode) => ConditionNode) => void;
  onRemove: (id: string) => void;
  onAddChild: (parentId: string, node: ConditionNode) => void;
  viewMode?: boolean;
}

const DEPTH_COLORS = ["border-blue-500", "border-green-500", "border-orange-500", "border-pink-500", "border-purple-500"];
const GROUP_COLORS = { AND: "bg-blue-500", OR: "bg-orange-500" };

export function RuleConditionNode({ node, depth = 0, onUpdate, onRemove, onAddChild, viewMode = false }: Props) {
  const depthColor = DEPTH_COLORS[depth % DEPTH_COLORS.length];

  if (node.type === "group") {
    return (
      <div className={`pl-4 border-l-2 ${depthColor}`}>
        {/* Group header */}
        <div className="flex items-center gap-2 mb-3">
          {/* AND / OR toggle */}
          <div className="flex rounded-md overflow-hidden border border-border">
            {(["AND", "OR"] as const).map((op) => (
              <button
                key={op}
                onClick={() => onUpdate(node.id, (n) => ({ ...n, operator: op }))}
                className={`px-3 py-1 text-xs font-bold transition-colors
                  ${node.operator === op
                    ? `${GROUP_COLORS[op]} text-white`
                    : "bg-transparent text-muted-foreground hover:bg-muted"
                  }`}
              >
                {op}
              </button>
            ))}
          </div>

          <span className="text-xs text-muted-foreground">Group</span>

          {!viewMode && (
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onAddChild(node.id, mkLeaf())}>+ Kondisi</Button>
              <Button size="sm" variant="outline" onClick={() => onAddChild(node.id, mkGroup())}>+ Group</Button>
              {depth > 0 && <Button size="sm" variant="destructive" onClick={() => onRemove(node.id)}>Hapus</Button>}
            </div>
          )}
                  </div>

        {/* Children */}
        <div className="flex flex-col gap-3">
          {node.children.length === 0 && (
            <div className="py-4 border-2 border-dashed rounded-lg text-center text-sm text-muted-foreground">
              Belum ada kondisi — klik "+ Kondisi" atau "+ Group"
            </div>
          )}
          {node.children.map((child, i) => (
            <div key={child.id}>
              {i > 0 && (
                <div className="flex items-center gap-2 my-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className={`text-xs font-bold px-2 py-0.5 rounded text-white ${GROUP_COLORS[node.operator]}`}>
                    {node.operator}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              <RuleConditionNode
                node={child}
                depth={depth + 1}
                onUpdate={onUpdate}
                onRemove={onRemove}
                onAddChild={onAddChild}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Leaf Node ───────────────────────────────────────────────
  const needsValue = !NO_VALUE_OPS.has(node.operator);

  return (
    <div className={`flex items-center gap-2 p-3 rounded-lg border bg-card border-l-4 ${depthColor}`}>
      <Input
        placeholder="object"
        value={node.object}
        onChange={(e) => onUpdate(node.id, (n) => ({ ...n, object: e.target.value }))}
        className="font-mono text-sm"
      />
      <Input
        placeholder="attribute"
        value={node.attribute}
        onChange={(e) => onUpdate(node.id, (n) => ({ ...n, attribute: e.target.value }))}
        className="font-mono text-sm"
      />
      <Select
        value={node.operator}
        onValueChange={(val) => onUpdate(node.id, (n) => ({ ...n, operator: val }))}
      >
        <SelectTrigger className="w-48 font-mono text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(OPERATORS).map(([group, ops]) => (
            <SelectGroup key={group}>
              <SelectLabel>{group}</SelectLabel>
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
        <Input
            placeholder={
            ["IN", "NOT_IN"].includes(node.operator)
                ? "val1, val2, val3"       // ← hint untuk list
                : ["MORE_THAN", "LESS_THAN", "MORE_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL"]
                    .includes(node.operator)
                ? "angka, contoh: 25"    // ← hint untuk numeric
                : "value"
            }
            value={node.value}
            onChange={(e) => onUpdate(node.id, (n) => ({ ...n, value: e.target.value }))}
            className="font-mono text-sm"
        />
        ) : (
        <div className="flex-1 px-3 py-2 text-sm text-muted-foreground italic">—</div>
      )}
      {!viewMode && (
        <Button size="sm" variant="destructive" onClick={() => onRemove(node.id)}>✕</Button>
      )}
    </div>
  );
}