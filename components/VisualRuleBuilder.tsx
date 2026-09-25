"use client";

import { useState, useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  OBJECT_DEFINITIONS,
  COLOR_MAP,
  ACTION_TEMPLATES,
  type ObjectDefinition,
  type ObjectAttribute,
  type ActionTemplate,
} from "@/lib/objects";
import {
  type ConditionNode,
  type LeafNode,
  type GroupNode,
  uid,
  mkGroup,
  OPERATORS,
  NO_VALUE_OPS,
  OPTIONAL_VALUE_OPS,
  LIST_OPS,
  NUMERIC_OPS,
} from "@/components/RuleConditionNode";
import {
  Search,
  GripVertical,
  Plus,
  Trash2,
  GitBranch,
  Play,
  Zap,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Sliders,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Grid,
  Layers,
  ArrowDown,
  User,
  ShoppingCart,
  Building2,
  Tag,
  Percent,
  MessageSquare,
  Gift,
  Megaphone,
  Box,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ─── Types ──────────────────────────────────────────────────
export interface ActionEntry {
  id: string;
  key: string;
  value: string;
  type?: "string" | "number" | "boolean";
}

interface DragItem {
  type: "condition" | "action";
  objectName?: string;
  attribute?: ObjectAttribute;
  template?: ActionTemplate;
}

interface Props {
  tree: ConditionNode;
  onTreeChange: (tree: ConditionNode) => void;
  actionEntries: ActionEntry[];
  onActionEntriesChange: (entries: ActionEntry[]) => void;
}

// Icon mapper for dynamic icons
const renderObjectIcon = (iconName: string, className = "w-4 h-4") => {
  switch (iconName) {
    case "User":
      return <User className={className} />;
    case "ShoppingCart":
      return <ShoppingCart className={className} />;
    case "Building2":
      return <Building2 className={className} />;
    default:
      return <Box className={className} />;
  }
};

const renderActionIcon = (iconName: string, className = "w-4 h-4") => {
  switch (iconName) {
    case "Percent":
      return <Percent className={className} />;
    case "MessageSquare":
      return <MessageSquare className={className} />;
    case "CheckCircle2":
      return <CheckCircle2 className={className} />;
    case "Gift":
      return <Gift className={className} />;
    case "Tag":
      return <Tag className={className} />;
    case "Megaphone":
      return <Megaphone className={className} />;
    default:
      return <Zap className={className} />;
  }
};

// ─── Draggable Palette Chips ────────────────────────────────
function DraggableAttributeChip({
  objectDef,
  attr,
}: {
  objectDef: ObjectDefinition;
  attr: ObjectAttribute;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `attr::${objectDef.name}::${attr.name}`,
    data: {
      type: "condition",
      objectName: objectDef.name,
      attribute: attr,
    } as DragItem,
  });

  const c = COLOR_MAP[objectDef.color] || COLOR_MAP.blue;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.35 : 1,
      }}
      className={`group flex items-center justify-between p-2 rounded-xl border bg-card text-xs font-medium cursor-grab active:cursor-grabbing select-none transition-all hover:shadow-sm hover:border-slate-300 dark:hover:border-slate-700 ${
        isDragging ? "ring-2 ring-primary" : ""
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0" />
        <span className={`font-mono font-semibold truncate ${c.text}`}>
          {attr.name}
        </span>
      </div>
      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0 uppercase">
        {attr.type}
      </span>
    </div>
  );
}

function DraggableActionChip({ template }: { template: ActionTemplate }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `action::${template.key}`,
    data: {
      type: "action",
      template,
    } as DragItem,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.35 : 1,
      }}
      className={`group flex items-center justify-between p-2 rounded-xl border border-purple-200/70 bg-purple-50/40 dark:bg-purple-950/20 dark:border-purple-800/60 text-xs font-medium cursor-grab active:cursor-grabbing select-none transition-all hover:shadow-sm hover:border-purple-300 dark:hover:border-purple-700 ${
        isDragging ? "ring-2 ring-purple-500" : ""
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <GripVertical className="w-3.5 h-3.5 text-purple-400 group-hover:text-purple-600 shrink-0" />
        <span className="text-purple-600 dark:text-purple-400 shrink-0">
          {renderActionIcon(template.icon, "w-3.5 h-3.5")}
        </span>
        <span className="text-foreground font-medium truncate">{template.label}</span>
      </div>
      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-100/60 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 shrink-0 uppercase">
        {template.type}
      </span>
    </div>
  );
}

// ─── Droppable Canvas Component ─────────────────────────────
function DroppableGroupCanvas({
  groupId,
  children,
  isEmpty,
}: {
  groupId: string;
  children: React.ReactNode;
  isEmpty: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `dropzone-${groupId}` });

  return (
    <div ref={setNodeRef} className="w-full min-w-0">
      {isEmpty ? (
        <div
          className={`min-h-32 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-6 text-center transition-all duration-200 ${
            isOver
              ? "border-primary bg-primary/10 ring-4 ring-primary/20 scale-[1.01]"
              : "border-slate-200 dark:border-slate-800 bg-muted/20 hover:border-slate-300 dark:hover:border-slate-700"
          }`}
        >
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2 shadow-xs">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <span className="text-xs font-semibold text-foreground">
            {isOver ? "Lepaskan Attribute ke Kondisi" : "Drag Attribute dari Library ke Sini"}
          </span>
          <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xs">
            Atau gunakan tombol Tambah Kondisi untuk memasukkan ekspresi aturan bisnis secara langsung
          </p>
        </div>
      ) : (
        <div
          className={`rounded-2xl transition-all duration-200 ${
            isOver ? "ring-2 ring-primary ring-offset-2" : ""
          }`}
        >
          {children}
          {isOver && (
            <div className="mt-2 h-12 rounded-xl border-2 border-dashed border-primary bg-primary/5 flex items-center justify-center text-xs font-semibold text-primary gap-1.5 animate-pulse">
              <Plus className="w-4 h-4" />
              <span>Lepaskan untuk menambahkan kondisi ke grup ini</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Flow Condition Card Node ───────────────────────────────
function FlowConditionNode({
  node,
  objectDef,
  onUpdate,
  onRemove,
}: {
  node: LeafNode;
  objectDef?: ObjectDefinition;
  onUpdate: (id: string, patch: Partial<LeafNode>) => void;
  onRemove: (id: string) => void;
}) {
  const c = objectDef ? COLOR_MAP[objectDef.color] : COLOR_MAP.blue;
  const attrDef = objectDef?.attributes.find((a) => a.name === node.attribute);
  const suggested = attrDef?.suggestedOperators ?? [];
  const allOps = Array.from(new Set(Object.values(OPERATORS).flat()));
  const others = allOps.filter((op) => !suggested.includes(op));
  const needsValue = !NO_VALUE_OPS.has(node.operator);
  const isOptionalValue = OPTIONAL_VALUE_OPS.has(node.operator);
  const attrType = attrDef?.type ?? "string";

  return (
    <div className="group relative flex flex-col gap-3 p-3.5 sm:p-4 rounded-2xl border border-border bg-card shadow-xs hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all">
      {/* Port Anchor Left (Incoming) */}
      <div className="hidden sm:block absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary/70 border-2 border-card z-10" />

      {/* Header Row: Object & Attribute identity (Left) + Delete Action (Right) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border ${c.border} ${c.bg} ${c.text}`}
          >
            {renderObjectIcon(objectDef?.icon || "Box", "w-3.5 h-3.5")}
            <span>{node.object || "Object"}</span>
          </div>
          <span className="text-muted-foreground font-mono text-xs font-bold">.</span>
          <span className="font-mono text-xs font-semibold text-foreground bg-muted/60 border border-border/70 px-2.5 py-1 rounded-xl truncate max-w-[180px]">
            {node.attribute || "attribute"}
          </span>
          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-lg bg-muted text-muted-foreground border border-border/60">
            {attrType}
          </span>
          {attrDef?.description && (
            <span
              className="hidden md:inline text-[11px] text-muted-foreground/80 truncate max-w-[220px]"
              title={attrDef.description}
            >
              • {attrDef.description}
            </span>
          )}
        </div>

        {/* Delete button cleanly stationed at top-right */}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg shrink-0 transition-colors"
          title="Hapus kondisi"
          onClick={() => onRemove(node.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Fields Composition: Operator & Value in a responsive balanced grid */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start p-3 rounded-xl bg-muted/30 border border-border/50 shadow-2xs">
        {/* Operator Field */}
        <div className="sm:col-span-5 flex flex-col gap-1.5">
          <div className="h-6 flex items-center">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Sliders className="w-3 h-3 text-primary" />
              <span>Operator</span>
            </label>
          </div>
          <Select
            value={node.operator}
            onValueChange={(v) => onUpdate(node.id, { operator: v })}
          >
            <SelectTrigger className="h-9 w-full font-mono text-xs bg-background border-border shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {suggested.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase font-bold text-primary">
                    Disarankan
                  </SelectLabel>
                  {suggested.map((op) => (
                    <SelectItem key={op} value={op} className="font-mono text-xs">
                      {op}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {others.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase font-bold text-muted-foreground">
                    Semua Operator
                  </SelectLabel>
                  {others.map((op) => (
                    <SelectItem key={op} value={op} className="font-mono text-xs text-muted-foreground">
                      {op}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Value Field */}
        <div className="sm:col-span-7 flex flex-col gap-1.5">
          <div className="h-6 flex items-center justify-between">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Tag className="w-3 h-3 text-primary" />
              <span>
                Target Nilai{" "}
                {isOptionalValue && (
                  <span className="font-normal lowercase text-[10px] text-muted-foreground">
                    (opsional format)
                  </span>
                )}
              </span>
            </label>
            {attrDef?.exampleValue && needsValue && !isOptionalValue && (
              <span className="text-[10px] text-muted-foreground">
                cth: <code className="font-mono text-foreground/80">{attrDef.exampleValue}</code>
              </span>
            )}
          </div>

          {needsValue ? (
            <Input
              value={node.value}
              onChange={(e) => onUpdate(node.id, { value: e.target.value })}
              placeholder={
                LIST_OPS.has(node.operator)
                  ? "val1, val2, val3..."
                  : NUMERIC_OPS.has(node.operator)
                  ? "contoh: 25"
                  : isOptionalValue
                  ? "format opsional (cth: dd-MM-yyyy atau dd-MM-yyyy HH:mm:ss)"
                  : attrDef?.exampleValue
                  ? `contoh: ${attrDef.exampleValue}`
                  : "masukkan nilai..."
              }
              className="h-9 text-xs font-mono bg-background border-border shadow-2xs w-full hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
            />
          ) : (
            <div className="h-9 px-3 flex items-center text-xs text-muted-foreground italic bg-muted/40 rounded-xl border border-dashed border-border/80">
              Operator unary (tidak memerlukan nilai input)
            </div>
          )}
        </div>
      </div>

      {/* Port Anchor Right (Outgoing) */}
      <div className="hidden sm:block absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-emerald-500/70 border-2 border-card z-10" />
    </div>
  );
}

// ─── Flow Group Node ────────────────────────────────────────
function FlowGroupBlock({
  node,
  onUpdateLeaf,
  onRemoveLeaf,
  onToggleOperator,
  onRemoveGroup,
  depth,
}: {
  node: GroupNode;
  onUpdateLeaf: (id: string, patch: Partial<LeafNode>) => void;
  onRemoveLeaf: (id: string) => void;
  onToggleOperator: (id: string) => void;
  onRemoveGroup: (id: string) => void;
  depth: number;
}) {
  const isEmpty = node.children.length === 0;

  return (
    <div
      className={`relative ${
        depth > 0
          ? "pl-4 sm:pl-6 border-l-2 border-primary/30 dark:border-primary/20 my-3 rounded-r-2xl"
          : ""
      }`}
    >
      {/* Group logic header */}
      <div className="flex items-center justify-between gap-3 mb-3 p-2.5 rounded-2xl bg-muted/30 border border-border/70 backdrop-blur-xs">
        <div className="flex items-center gap-2">
          {/* Logic Segmented Switch */}
          <div className="flex rounded-xl overflow-hidden border border-border bg-background p-0.5 shadow-xs">
            <button
              type="button"
              onClick={() => onToggleOperator(node.id)}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                node.operator === "AND"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              AND
            </button>
            <button
              type="button"
              onClick={() => onToggleOperator(node.id)}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                node.operator === "OR"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              OR
            </button>
          </div>

          <span className="text-xs text-muted-foreground font-medium">
            {node.operator === "AND"
              ? "Semua kriteria di bawah harus terpenuhi"
              : "Minimal salah satu kriteria di bawah harus terpenuhi"}
          </span>
        </div>

        {depth > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
            onClick={() => onRemoveGroup(node.id)}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            Hapus Sub-Group
          </Button>
        )}
      </div>

      {/* Droppable Canvas area */}
      <DroppableGroupCanvas groupId={node.id} isEmpty={isEmpty}>
        <div className="flex flex-col gap-2.5">
          {node.children.map((child, i) => (
            <div key={child.id} className="relative">
              {i > 0 && (
                <div className="flex items-center justify-center my-1.5 relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-dashed border-border" />
                  </div>
                  <span
                    className={`relative px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white shadow-xs ${
                      node.operator === "AND" ? "bg-blue-600" : "bg-amber-600"
                    }`}
                  >
                    {node.operator}
                  </span>
                </div>
              )}

              {child.type === "leaf" ? (
                <FlowConditionNode
                  node={child}
                  objectDef={OBJECT_DEFINITIONS.find((o) => o.name === child.object)}
                  onUpdate={onUpdateLeaf}
                  onRemove={onRemoveLeaf}
                />
              ) : (
                <FlowGroupBlock
                  node={child as GroupNode}
                  onUpdateLeaf={onUpdateLeaf}
                  onRemoveLeaf={onRemoveLeaf}
                  onToggleOperator={onToggleOperator}
                  onRemoveGroup={onRemoveGroup}
                  depth={depth + 1}
                />
              )}
            </div>
          ))}
        </div>
      </DroppableGroupCanvas>
    </div>
  );
}

// ─── Flow Action Card Node ──────────────────────────────────
function FlowActionNode({
  entry,
  onUpdate,
  onRemove,
}: {
  entry: ActionEntry;
  onUpdate: (id: string, patch: Partial<ActionEntry>) => void;
  onRemove: (id: string) => void;
}) {
  const template = ACTION_TEMPLATES.find((t) => t.key === entry.key);
  const type = entry.type ?? template?.type ?? "string";

  return (
    <div className="group relative flex flex-col gap-3 p-3.5 sm:p-4 rounded-2xl border border-purple-200/80 dark:border-purple-800/70 bg-purple-50/30 dark:bg-purple-950/20 shadow-xs hover:shadow-md hover:border-purple-300 dark:hover:border-purple-700 transition-all">
      {/* Port Anchor Left (Incoming from Conditions) */}
      <div className="hidden sm:block absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-purple-500 border-2 border-card z-10" />

      {/* Header Row: Action Identity (Left) + Delete Action (Right) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 border border-purple-200/60 dark:border-purple-800/60">
            {renderActionIcon(template?.icon || "Zap", "w-3.5 h-3.5")}
          </div>
          <span className="text-xs font-bold text-foreground truncate">
            {template?.label ?? entry.key}
          </span>
          {template?.category && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-purple-100/70 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/60">
              {template.category}
            </span>
          )}
          {template?.description && (
            <span
              className="hidden md:inline text-[11px] text-muted-foreground/80 truncate max-w-[220px]"
              title={template.description}
            >
              • {template.description}
            </span>
          )}
        </div>

        {/* Delete button cleanly stationed at top-right (no longer alone at bottom!) */}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg shrink-0 transition-colors"
          title="Hapus action"
          onClick={() => onRemove(entry.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Fields Composition: Parameter Key & Output Value in responsive grid */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start p-3 rounded-xl bg-background/80 border border-purple-200/70 dark:border-purple-900/50 shadow-2xs">
        {/* Parameter Key Field */}
        <div className="sm:col-span-5 flex flex-col gap-1.5">
          <div className="h-6 flex items-center">
            <label className="text-[10px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider flex items-center gap-1">
              <Zap className="w-3 h-3 text-purple-600 dark:text-purple-400" />
              <span>Parameter Key</span>
            </label>
          </div>
          <Input
            value={entry.key}
            onChange={(e) => onUpdate(entry.id, { key: e.target.value })}
            placeholder="action key..."
            className="h-9 font-mono text-xs bg-background border-border shadow-2xs hover:border-purple-300 dark:hover:border-purple-700 transition-colors w-full"
          />
        </div>

        {/* Output Value Field */}
        <div className="sm:col-span-7 flex flex-col gap-1.5">
          <div className="h-6 flex items-center justify-between">
            <label className="text-[10px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-purple-600 dark:text-purple-400" />
              <span>Output Value</span>
            </label>
            {/* Quick Type Selector */}
            <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-lg border border-border/60">
              {(["string", "number", "boolean"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    onUpdate(entry.id, {
                      type: t,
                      value:
                        t === "boolean" && entry.value !== "true" && entry.value !== "false"
                          ? "true"
                          : entry.value,
                    })
                  }
                  className={`text-[9px] font-mono px-2 py-0.5 rounded-md uppercase leading-none transition-colors ${
                    type === t
                      ? "bg-purple-600 text-white font-bold shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {type === "boolean" ? (
            <div className="flex rounded-lg overflow-hidden border border-border bg-background p-0.5 h-9 shadow-2xs">
              <button
                type="button"
                onClick={() => onUpdate(entry.id, { value: "true" })}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold rounded-md transition-all ${
                  entry.value === "true"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    entry.value === "true" ? "bg-white" : "bg-emerald-500"
                  }`}
                />
                TRUE
              </button>
              <button
                type="button"
                onClick={() => onUpdate(entry.id, { value: "false" })}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold rounded-md transition-all ${
                  entry.value === "false"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    entry.value === "false" ? "bg-white" : "bg-rose-500"
                  }`}
                />
                FALSE
              </button>
            </div>
          ) : type === "number" ? (
            <Input
              type="number"
              value={entry.value}
              onChange={(e) => onUpdate(entry.id, { value: e.target.value })}
              placeholder={template?.defaultValue ? `default: ${template.defaultValue}` : "nilai angka..."}
              className="h-9 text-xs font-mono bg-background border-border shadow-2xs w-full hover:border-purple-300 dark:hover:border-purple-700 transition-colors"
            />
          ) : (
            <Input
              value={entry.value}
              onChange={(e) => onUpdate(entry.id, { value: e.target.value })}
              placeholder={template?.defaultValue ? `default: ${template.defaultValue}` : "nilai teks..."}
              className="h-9 text-xs font-mono bg-background border-border shadow-2xs w-full hover:border-purple-300 dark:hover:border-purple-700 transition-colors"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ActionDroppableZone() {
  const { isOver, setNodeRef } = useDroppable({ id: "action-dropzone-main" });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-6 transition-all duration-200 ${
        isOver
          ? "border-purple-500 bg-purple-500/10 ring-4 ring-purple-500/20 scale-[1.01]"
          : "border-purple-200 dark:border-purple-800/50 bg-purple-50/20 dark:bg-purple-950/10 hover:border-purple-300"
      }`}
    >
      <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400 mb-2 shadow-xs">
        <Sparkles className="w-5 h-5 animate-pulse" />
      </div>
      <span className="text-xs font-semibold text-foreground">
        {isOver ? "Lepaskan Action di Sini" : "Drag Action dari Library ke Sini"}
      </span>
      <p className="text-[11px] text-muted-foreground mt-0.5">
        Contoh: Apply Discount, Notification Message, Grant Eligibility
      </p>
    </div>
  );
}

function ActionDroppableZoneBottom() {
  const { isOver, setNodeRef } = useDroppable({ id: "action-dropzone-bottom" });

  return (
    <div
      ref={setNodeRef}
      className={`h-11 rounded-xl border-2 border-dashed flex items-center justify-center text-xs font-semibold transition-all ${
        isOver
          ? "border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400 animate-pulse"
          : "border-purple-200 dark:border-purple-900 text-purple-500/80 hover:border-purple-300"
      }`}
    >
      <Plus className="w-3.5 h-3.5 mr-1" />
      <span>{isOver ? "Lepaskan untuk menambah Action" : "Drop Action tambahan di sini"}</span>
    </div>
  );
}

// ─── Main Visual Rule Builder Component ─────────────────────
export function VisualRuleBuilder({
  tree,
  onTreeChange,
  actionEntries,
  onActionEntriesChange,
}: Props) {
  const [activeDrag, setActiveDrag] = useState<DragItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    Customer: true,
    Cart: true,
    Branch: false,
    Actions: true,
  });

  // Canvas visual controls
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showGrid, setShowGrid] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const toggleSection = (sec: string) => {
    setOpenSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  // ─── Tree Operations ────────────────────────────────────────
  const updateLeaf = (id: string, patch: Partial<LeafNode>) => {
    const walk = (node: ConditionNode): ConditionNode => {
      if (node.id === id && node.type === "leaf") return { ...node, ...patch } as LeafNode;
      if (node.type === "group") return { ...node, children: node.children.map(walk) };
      return node;
    };
    onTreeChange(walk(tree));
  };

  const removeNode = (id: string) => {
    const walk = (node: ConditionNode): ConditionNode => {
      if (node.type !== "group") return node;
      return { ...node, children: node.children.filter((c) => c.id !== id).map(walk) };
    };
    onTreeChange(walk(tree));
  };

  const toggleOperator = (id: string) => {
    const walk = (node: ConditionNode): ConditionNode => {
      if (node.id === id && node.type === "group") {
        return { ...node, operator: node.operator === "AND" ? "OR" : "AND" };
      }
      if (node.type === "group") return { ...node, children: node.children.map(walk) };
      return node;
    };
    onTreeChange(walk(tree));
  };

  const addLeafToGroup = (item: { objectName: string; attribute: ObjectAttribute }, groupId: string) => {
    const newLeaf: LeafNode = {
      id: uid(),
      type: "leaf",
      object: item.objectName,
      attribute: item.attribute.name,
      operator: item.attribute.suggestedOperators?.[0] ?? "EQUAL",
      value: item.attribute.exampleValue ?? "",
    };

    const walk = (node: ConditionNode): ConditionNode => {
      if (node.id === groupId && node.type === "group") {
        return { ...node, children: [...node.children, newLeaf] };
      }
      if (node.type === "group") return { ...node, children: node.children.map(walk) };
      return node;
    };
    onTreeChange(walk(tree));
  };

  const addSubGroup = () => {
    if (tree.type === "group") {
      const newGroup: GroupNode = { ...mkGroup("AND"), children: [] };
      onTreeChange({ ...tree, children: [...tree.children, newGroup] });
    }
  };

  // ─── Action Operations ──────────────────────────────────────
  const updateAction = (id: string, patch: Partial<ActionEntry>) => {
    onActionEntriesChange(actionEntries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const removeAction = (id: string) => {
    onActionEntriesChange(actionEntries.filter((e) => e.id !== id));
  };

  const addActionFromTemplate = (template: ActionTemplate) => {
    onActionEntriesChange([
      ...actionEntries,
      {
        id: uid(),
        key: template.key,
        value: template.defaultValue,
        type: template.type,
      },
    ]);
  };

  // ─── Drag & Drop Handlers ───────────────────────────────────
  const handleDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as DragItem | undefined;
    if (data) setActiveDrag(data);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { over, active } = e;
    if (over && active.data.current) {
      const data = active.data.current as DragItem;

      const isActionDrop =
        over.id === "action-dropzone-main" || over.id === "action-dropzone-bottom";

      if (data.type === "action" && isActionDrop && data.template) {
        addActionFromTemplate(data.template);
      } else if (data.type === "condition" && data.objectName && data.attribute) {
        const groupId = (over.id as string).replace("dropzone-", "");
        addLeafToGroup(
          { objectName: data.objectName, attribute: data.attribute },
          groupId
        );
      }
    }
    setActiveDrag(null);
  };

  // ─── Filtered Palette Definitions ───────────────────────────
  const filteredObjects = useMemo(() => {
    if (!searchQuery.trim()) return OBJECT_DEFINITIONS;
    const q = searchQuery.toLowerCase();
    return OBJECT_DEFINITIONS.map((obj) => ({
      ...obj,
      attributes: obj.attributes.filter(
        (a) => a.name.toLowerCase().includes(q) || obj.name.toLowerCase().includes(q)
      ),
    })).filter((obj) => obj.attributes.length > 0 || obj.name.toLowerCase().includes(q));
  }, [searchQuery]);

  const filteredActions = useMemo(() => {
    if (!searchQuery.trim()) return ACTION_TEMPLATES;
    const q = searchQuery.toLowerCase();
    return ACTION_TEMPLATES.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.key.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const isRootEmpty = tree.type === "group" && tree.children.length === 0;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-4">
        {/* ─── Canvas Control Header (Toolbar inspired by Dribbble) ─── */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-card border border-border shadow-xs">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center font-bold">
              <Workflow className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground">
                  Interactive Procedures Flow
                </span>
                <Badge variant="outline" className="text-[10px] font-mono text-emerald-600 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800">
                  Ready
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Drag and drop components to connect business conditions & procedural actions
              </p>
            </div>
          </div>

          {/* Canvas View Controls */}
          <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-xl border border-border">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => setZoomLevel((z) => Math.max(z - 10, 60))}
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
            <span className="text-[11px] font-mono font-semibold px-1.5 text-muted-foreground w-11 text-center">
              {zoomLevel}%
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => setZoomLevel((z) => Math.min(z + 10, 140))}
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <div className="w-px h-4 bg-border mx-0.5" />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => setZoomLevel(100)}
              title="Reset Zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={`h-7 w-7 p-0 rounded-lg ${
                showGrid ? "text-primary bg-primary/10" : "text-muted-foreground"
              }`}
              onClick={() => setShowGrid((g) => !g)}
              title="Toggle Grid Canvas"
            >
              <Grid className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* ─── Main Workspace: Left Tray + Center Canvas ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 items-start">
          {/* ─── LEFT: Procedures Library Tray ─── */}
          <div className="flex flex-col gap-3 rounded-2xl bg-card border border-border p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Procedures Library
                </span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                Drag-n-Drop
              </span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari attribute & action..."
                className="h-8 pl-8 text-xs bg-muted/30 border-border rounded-xl"
              />
            </div>

            {/* Objects & Attributes Section */}
            <div className="flex flex-col gap-2.5 mt-1">
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                Data Models & Fact Attributes
              </div>

              {filteredObjects.map((obj) => {
                const isOpen = openSections[obj.name] ?? true;
                const c = COLOR_MAP[obj.color] || COLOR_MAP.blue;

                return (
                  <div
                    key={obj.name}
                    className={`rounded-xl border transition-all overflow-hidden ${
                      isOpen ? `${c.border} ${c.bg}` : "border-border bg-card"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSection(obj.name)}
                      className="w-full flex items-center justify-between p-2.5 text-xs font-bold transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-2">
                        <span className={c.text}>
                          {renderObjectIcon(obj.icon, "w-4 h-4")}
                        </span>
                        <span className="text-foreground">{obj.name}</span>
                        <span className="text-[10px] font-mono text-muted-foreground bg-background px-1.5 py-0.2 rounded border border-border/60">
                          {obj.attributes.length}
                        </span>
                      </div>
                      {isOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </button>

                    {isOpen && (
                      <div className="p-2.5 pt-0 flex flex-col gap-1.5">
                        <p className="text-[10px] text-muted-foreground px-1 pb-1">
                          {obj.description}
                        </p>
                        {obj.attributes.map((attr) => (
                          <DraggableAttributeChip
                            key={attr.name}
                            objectDef={obj}
                            attr={attr}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Action Library Section */}
            <div className="flex flex-col gap-2.5 mt-2">
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                Execution Actions (THEN)
              </div>

              <div className="rounded-xl border border-purple-200 dark:border-purple-900 bg-purple-50/20 dark:bg-purple-950/10 p-2.5">
                <div className="flex flex-col gap-1.5">
                  {filteredActions.map((t) => (
                    <DraggableActionChip key={t.key} template={t} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ─── CENTER: Interactive Procedural Canvas ─── */}
          <div
            className={`flex flex-col gap-5 rounded-3xl p-6 sm:p-8 border border-border shadow-sm min-h-[700px] transition-all relative overflow-hidden min-w-0 ${
              showGrid ? "bg-canvas-dots" : "bg-card"
            }`}
            style={{
              zoom: `${zoomLevel}%`,
            }}
          >
            {/* ── STEP 1: Procedure Trigger Node (Entry Point) ── */}
            <div className="max-w-xl mx-auto w-full">
              <div className="relative p-4 rounded-2xl border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/40 shadow-xs backdrop-blur-xs flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                    <Play className="w-5 h-5 fill-current" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider">
                        Step 1: Fact Ingestion Trigger
                      </span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      Incoming Fact Stream Evaluation
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Evaluasi berbasis event terhadap fact & transaksi yang masuk
                    </p>
                  </div>
                </div>

                {/* Output Anchor Port */}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-blue-600 ring-4 ring-blue-200 dark:ring-blue-900" />
              </div>
            </div>

            {/* Connector Line Step 1 -> Step 2 */}
            <div className="flex flex-col items-center justify-center -my-2 relative z-10">
              <div className="w-0.5 h-8 bg-gradient-to-b from-blue-500 to-indigo-500" />
              <div className="w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center shadow-xs">
                <ArrowDown className="w-3 h-3 text-muted-foreground" />
              </div>
              <div className="w-0.5 h-8 bg-gradient-to-b from-indigo-500 to-primary" />
            </div>

            {/* ── STEP 2: Logic Decision & Conditions Engine (IF) ── */}
            <div className="w-full">
              <div className="p-5 rounded-3xl border border-border bg-card shadow-xs backdrop-blur-xs flex flex-col gap-4">
                {/* Node Section Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/80">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                      <GitBranch className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-primary uppercase tracking-wider">
                          Step 2: Logic Engine (IF Conditions)
                        </span>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {tree.type === "group" ? `${tree.children.length} Criteria` : "1 Criteria"}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Drag facts from the left library or add nested condition groups
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1.5 rounded-xl border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/60"
                      onClick={() => {
                        const defaultObj = OBJECT_DEFINITIONS[0];
                        const defaultAttr = defaultObj.attributes[0];
                        addLeafToGroup(
                          { objectName: defaultObj.name, attribute: defaultAttr },
                          tree.id
                        );
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Kondisi</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1.5 rounded-xl border-border hover:bg-primary/5 hover:text-primary hover:border-primary/40"
                      onClick={addSubGroup}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Sub-Group</span>
                    </Button>
                  </div>
                </div>

                {/* Condition Tree Canvas */}
                {isRootEmpty ? (
                  <DroppableGroupCanvas groupId={tree.id} isEmpty={true}>
                    <></>
                  </DroppableGroupCanvas>
                ) : (
                  tree.type === "group" && (
                    <FlowGroupBlock
                      node={tree}
                      onUpdateLeaf={updateLeaf}
                      onRemoveLeaf={removeNode}
                      onToggleOperator={toggleOperator}
                      onRemoveGroup={removeNode}
                      depth={0}
                    />
                  )
                )}
              </div>
            </div>

            {/* Connector Line Step 2 -> Step 3 */}
            <div className="flex flex-col items-center justify-center -my-2 relative z-10">
              <div className="w-0.5 h-8 bg-gradient-to-b from-primary to-purple-500" />
              <div className="w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center shadow-xs">
                <ArrowDown className="w-3 h-3 text-purple-500" />
              </div>
              <div className="w-0.5 h-8 bg-gradient-to-b from-purple-500 to-purple-600" />
            </div>

            {/* ── STEP 3: Action Execution Pipeline (THEN) ── */}
            <div className="w-full">
              <div className="p-5 rounded-3xl border border-purple-200/80 dark:border-purple-800/60 bg-card shadow-xs backdrop-blur-xs flex flex-col gap-4">
                {/* Node Section Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/80">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                          Step 3: Procedure Actions (THEN Outputs)
                        </span>
                        <Badge variant="outline" className="text-[10px] font-mono text-purple-600 border-purple-300 dark:border-purple-800">
                          {actionEntries.length} Actions
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Actions triggered when all conditional rules pass validation
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5 rounded-xl border-purple-300 dark:border-purple-800 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950"
                    onClick={() =>
                      onActionEntriesChange([
                        ...actionEntries,
                        { id: uid(), key: "customAction", value: "active", type: "string" },
                      ])
                    }
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Action</span>
                  </Button>
                </div>

                {/* Action Entries Canvas */}
                {actionEntries.length === 0 ? (
                  <ActionDroppableZone />
                ) : (
                  <div className="flex flex-col gap-3">
                    {actionEntries.map((entry) => (
                      <FlowActionNode
                        key={entry.id}
                        entry={entry}
                        onUpdate={updateAction}
                        onRemove={removeAction}
                      />
                    ))}
                    <ActionDroppableZoneBottom />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Drag Overlay Ghost Preview ─── */}
      <DragOverlay>
        {activeDrag?.type === "condition" && activeDrag.attribute && activeDrag.objectName && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border-2 border-primary shadow-xl text-xs font-bold text-primary animate-pulse">
            <span>{activeDrag.objectName}</span>
            <span>.</span>
            <span>{activeDrag.attribute.name}</span>
          </div>
        )}
        {activeDrag?.type === "action" && activeDrag.template && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border-2 border-purple-500 shadow-xl text-xs font-bold text-purple-600 animate-pulse">
            <Zap className="w-3.5 h-3.5" />
            <span>{activeDrag.template.label}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
