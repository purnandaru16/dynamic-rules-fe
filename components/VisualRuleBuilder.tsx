"use client";

import { useState } from "react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectGroup,
  SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { OBJECT_DEFINITIONS, COLOR_MAP, type ObjectDefinition, type ObjectAttribute } from "@/lib/objects";
import { type ConditionNode, type LeafNode, type GroupNode, uid, mkGroup } from "@/components/RuleConditionNode";

// ─── Types ────────────────────────────────────────────────────
interface DragItem {
  objectName: string;
  attribute: ObjectAttribute;
}

// ─── Constants ───────────────────────────────────────────────
const ALL_OPERATORS = [
  "EQUAL", "NOT_EQUAL", "MORE_THAN", "LESS_THAN",
  "MORE_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL",
  "IN", "NOT_IN", "CONTAINS", "STARTS_WITH", "ENDS_WITH",
  "NULL", "NOT_NULL", "VALID_EMAIL",
];
const NO_VALUE_OPS = new Set(["NULL", "NOT_NULL", "VALID_EMAIL"]);
const LIST_OPS     = new Set(["IN", "NOT_IN"]);
const NUMERIC_OPS  = new Set(["MORE_THAN", "LESS_THAN", "MORE_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL"]);
const OP_COLORS    = { AND: "bg-blue-500", OR: "bg-orange-500" };
const DEPTH_COLORS = ["border-blue-400", "border-green-400", "border-orange-400", "border-purple-400"];

const ACTION_TEMPLATES = [
  { key: "discount",     label: "Discount",      icon: "🏷️", defaultValue: "10",             type: "number"  },
  { key: "message",      label: "Message",       icon: "💬", defaultValue: "Rule matched",    type: "string"  },
  { key: "eligible",     label: "Eligible",      icon: "✅", defaultValue: "true",            type: "boolean" },
  { key: "rewardValue",  label: "Reward Value",  icon: "🎁", defaultValue: "0",               type: "number"  },
  { key: "rewardType",   label: "Reward Type",   icon: "🎯", defaultValue: "percentage",      type: "string"  },
  { key: "campaignName", label: "Campaign Name", icon: "📣", defaultValue: "",                type: "string"  },
];

// ─── Draggable Chip ───────────────────────────────────────────
function DraggableChip({ objectDef, attr }: { objectDef: ObjectDefinition; attr: ObjectAttribute }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${objectDef.name}::${attr.name}`,
    data: { objectName: objectDef.name, attribute: attr },
  });
  const c = COLOR_MAP[objectDef.color];
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 }}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-grab active:cursor-grabbing text-xs font-medium select-none transition-shadow hover:shadow-md ${c.bg} ${c.border}`}
    >
      <span className={c.text}>{objectDef.icon}</span>
      <span className={c.text}>{attr.name}</span>
      <span className="text-muted-foreground opacity-60 text-[10px]">{attr.type}</span>
    </div>
  );
}

function DraggableActionChip({ template }: { template: typeof ACTION_TEMPLATES[0] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `action::${template.key}`,
    data: { type: "action", template },
  });
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-purple-200 bg-purple-50 dark:bg-purple-950 dark:border-purple-800 cursor-grab active:cursor-grabbing text-xs font-medium select-none hover:shadow-md transition-shadow"
    >
      <span>{template.icon}</span>
      <span className="text-purple-600 dark:text-purple-300">{template.label}</span>
    </div>
  );
}

// ─── Droppable Canvas ─────────────────────────────────────────
function DroppableCanvas({ groupId, children, isEmpty }: {
  groupId: string;
  children: React.ReactNode;
  isEmpty: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `dropzone-${groupId}` });
  return (
    <div ref={setNodeRef} className="w-full">
      {isEmpty ? (
        <div className={`min-h-30 rounded-xl border-2 border-dashed flex items-center justify-center transition-all duration-200
          ${isOver ? "border-primary bg-primary/5" : "border-muted-foreground/20 bg-muted/10"}`}>
          <span className={`text-sm transition-colors ${isOver ? "text-primary font-medium" : "text-muted-foreground"}`}>
            {isOver ? "✨ Lepaskan untuk menambah kondisi" : "⬇ Drag attribute ke sini untuk mulai"}
          </span>
        </div>
      ) : (
        <div className={`rounded-xl transition-all duration-200 ${isOver ? "ring-2 ring-primary/40 ring-offset-1" : ""}`}>
          {children}
          {isOver && (
            <div className="mt-2 h-10 rounded-lg border-2 border-dashed border-primary/40 flex items-center justify-center text-xs text-primary">
              + Tambah kondisi baru
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Condition Row ────────────────────────────────────────────
function ConditionRow({ node, objectDef, onUpdate, onRemove }: {
  node: LeafNode;
  objectDef?: ObjectDefinition;
  onUpdate: (id: string, patch: Partial<LeafNode>) => void;
  onRemove: (id: string) => void;
}) {
  const c = objectDef ? COLOR_MAP[objectDef.color] : COLOR_MAP["blue"];
  const suggested = objectDef?.attributes.find((a) => a.name === node.attribute)?.suggestedOperators ?? [];
  const others    = ALL_OPERATORS.filter((op) => !suggested.includes(op));
  const needsValue = !NO_VALUE_OPS.has(node.operator);

  return (
    <div className={`flex items-center gap-2 p-3 rounded-xl border ${c.bg} ${c.border}`}>
      <span className={`text-xs font-bold px-2 py-1 rounded-md whitespace-nowrap shrink-0 ${c.badge}`}>
        {objectDef?.icon} {node.object}
      </span>
      <span className={`text-xs font-mono font-semibold whitespace-nowrap shrink-0 ${c.text}`}>
        .{node.attribute}
      </span>
      <Select value={node.operator} onValueChange={(v) => onUpdate(node.id, { operator: v })}>
        <SelectTrigger className="h-8 w-48 text-xs font-mono shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {suggested.length > 0 && (
            <SelectGroup>
              <SelectLabel>Disarankan</SelectLabel>
              {suggested.map((op) => (
                <SelectItem key={op} value={op} className="text-xs font-mono">{op}</SelectItem>
              ))}
            </SelectGroup>
          )}
          {others.length > 0 && (
            <SelectGroup>
              <SelectLabel>Lainnya</SelectLabel>
              {others.map((op) => (
                <SelectItem key={op} value={op} className="text-xs font-mono text-muted-foreground">{op}</SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
      {needsValue ? (
        <Input
          value={node.value}
          onChange={(e) => onUpdate(node.id, { value: e.target.value })}
          placeholder={
            LIST_OPS.has(node.operator)   ? "val1, val2, val3" :
            NUMERIC_OPS.has(node.operator) ? "angka" : "value"
          }
          className="h-8 text-xs font-mono flex-1 min-w-0"
        />
      ) : (
        <div className="flex-1 text-xs text-muted-foreground italic px-2">— tidak perlu value</div>
      )}
      <Button size="sm" variant="ghost"
        className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(node.id)}>
        ✕
      </Button>
    </div>
  );
}

// ─── Group Block ──────────────────────────────────────────────
function GroupBlock({ node, onUpdateLeaf, onRemoveLeaf, onToggleOperator, onRemoveGroup, depth }: {
  node: GroupNode;
  onUpdateLeaf: (id: string, patch: Partial<LeafNode>) => void;
  onRemoveLeaf: (id: string) => void;
  onToggleOperator: (id: string) => void;
  onRemoveGroup: (id: string) => void;
  depth: number;
}) {
  const isEmpty = node.children.length === 0;

  return (
    <div className={depth > 0 ? `pl-4 border-l-2 ${DEPTH_COLORS[depth % DEPTH_COLORS.length]}` : ""}>

      {/* Group header — hanya tampil jika ada isi ATAU sub group */}
      {(!isEmpty || depth > 0) && (
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => onToggleOperator(node.id)}
            className={`px-3 py-1 rounded-md text-xs font-bold text-white transition-opacity hover:opacity-80 ${OP_COLORS[node.operator]}`}>
            {node.operator}
          </button>
          <span className="text-xs text-muted-foreground">
            {depth === 0 ? "Root group · klik toggle AND/OR" : "Sub group · klik toggle AND/OR"}
          </span>
          {depth > 0 && (
            <Button size="sm" variant="ghost"
              className="ml-auto h-6 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => onRemoveGroup(node.id)}>
              Hapus group
            </Button>
          )}
        </div>
      )}

      {/* Drop area */}
      <DroppableCanvas groupId={node.id} isEmpty={isEmpty}>
        <div className="flex flex-col gap-2">
          {node.children.map((child, i) => (
            <div key={child.id}>
              {i > 0 && (
                <div className="flex items-center gap-2 my-1.5">
                  <div className="flex-1 h-px bg-border" />
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded text-white ${OP_COLORS[node.operator]}`}>
                    {node.operator}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              {child.type === "leaf" ? (
                <ConditionRow
                  node={child}
                  objectDef={OBJECT_DEFINITIONS.find((o) => o.name === child.object)}
                  onUpdate={onUpdateLeaf}
                  onRemove={onRemoveLeaf}
                />
              ) : (
                <GroupBlock
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
      </DroppableCanvas>
    </div>
  );
}

function ActionDropZoneBottom() {
  const { isOver, setNodeRef } = useDroppable({ id: "action-dropzone-bottom" });
  return (
    <div ref={setNodeRef}
      className={`h-10 rounded-lg border-2 border-dashed flex items-center justify-center text-xs transition-all
        ${isOver ? "border-purple-400 bg-purple-50 text-purple-500" : "border-muted-foreground/20 text-muted-foreground"}`}>
      {isOver ? "✨ Tambah action" : "+ Drop action di sini"}
    </div>
  );
}

function ActionDropZone() {
  const { isOver, setNodeRef } = useDroppable({ id: "action-dropzone" });
  return (
    <div ref={setNodeRef}
      className={`min-h-15 rounded-xl border-2 border-dashed flex items-center justify-center transition-all duration-200
        ${isOver ? "border-purple-400 bg-purple-50/50 dark:bg-purple-950/50" : "border-muted-foreground/20 bg-muted/10"}`}>
      <span className={`text-sm ${isOver ? "text-purple-500 font-medium" : "text-muted-foreground"}`}>
        {isOver ? "✨ Lepaskan untuk menambah action" : "⬇ Drag action ke sini"}
      </span>
    </div>
  );
}

function ActionRow({ entry, onUpdate, onRemove }: {
  entry: ActionEntry;
  onUpdate: (id: string, patch: Partial<ActionEntry>) => void;
  onRemove: (id: string) => void;
}) {
  const template = ACTION_TEMPLATES.find((t) => t.key === entry.key);
  const type = template?.type ?? "string";

  return (
    <div className="flex items-center gap-2 p-3 rounded-xl border border-purple-200 bg-purple-50 dark:bg-purple-950 dark:border-purple-800">
      <span className="text-purple-500 text-sm shrink-0">
        {template?.icon ?? "⚙️"}
      </span>

      {/* Key */}
      <Input
        value={entry.key}
        onChange={(e) => onUpdate(entry.id, { key: e.target.value })}
        placeholder="key"
        className="h-8 text-xs font-mono w-36 shrink-0"
      />

      <span className="text-muted-foreground text-sm shrink-0">:</span>

      {/* Value — render berbeda per tipe */}
      {type === "boolean" ? (
        <Select
          value={entry.value}
          onValueChange={(v) => onUpdate(entry.id, { value: v })}>
          <SelectTrigger className="h-8 text-xs font-mono flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true" className="text-xs font-mono">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                true
              </span>
            </SelectItem>
            <SelectItem value="false" className="text-xs font-mono">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                false
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      ) : type === "number" ? (
        <Input
          type="number"
          value={entry.value}
          onChange={(e) => onUpdate(entry.id, { value: e.target.value })}
          placeholder="angka"
          className="h-8 text-xs font-mono flex-1"
        />
      ) : (
        <Input
          value={entry.value}
          onChange={(e) => onUpdate(entry.id, { value: e.target.value })}
          placeholder="value"
          className="h-8 text-xs font-mono flex-1"
        />
      )}

      {/* Type badge */}
      <span className="text-[10px] text-muted-foreground font-mono px-1.5 py-0.5 bg-muted rounded shrink-0">
        {type}
      </span>

      <Button size="sm" variant="ghost"
        className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(entry.id)}>
        ✕
      </Button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────
export interface ActionEntry {
  id: string;
  key: string;
  value: string;
  type?: "string" | "number" | "boolean";
}

interface Props {
  tree: ConditionNode;
  onTreeChange: (tree: ConditionNode) => void;
  actionEntries: ActionEntry[];
  onActionEntriesChange: (entries: ActionEntry[]) => void;
}

export function VisualRuleBuilder({ tree, onTreeChange, actionEntries, onActionEntriesChange }: Props) {
  const [activeItem, setActiveItem] = useState<DragItem | null>(null);
  const [activeType, setActiveType] = useState<"condition" | "action" | null>(null);
  const [openLib, setOpenLib] = useState<"object" | "action" | null>("object");

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  }));

  // ── Tree helpers ──────────────────────────────────────────
  const updateLeaf = (id: string, patch: Partial<LeafNode>) => {
    const walk = (node: ConditionNode): ConditionNode => {
      if (node.id === id && node.type === "leaf") return { ...node, ...patch } as LeafNode;
      if (node.type === "group") return { ...node, children: node.children.map(walk) };
      return node;
    };
    onTreeChange(walk(tree));
  };

  // ── Action helpers ──
  const updateAction = (id: string, patch: Partial<ActionEntry>) => {
    onActionEntriesChange(actionEntries.map((e) => e.id === id ? { ...e, ...patch } : e));
  };

  const removeAction = (id: string) => {
    onActionEntriesChange(actionEntries.filter((e) => e.id !== id));
  };

  const addAction = (template: typeof ACTION_TEMPLATES[0]) => {
    onActionEntriesChange([
        ...actionEntries,
        { id: uid(), key: template.key, value: template.defaultValue, type: template.type as "string" | "number" | "boolean" },
    ]);
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
      if (node.id === id && node.type === "group")
        return { ...node, operator: node.operator === "AND" ? "OR" : "AND" };
      if (node.type === "group") return { ...node, children: node.children.map(walk) };
      return node;
    };
    onTreeChange(walk(tree));
  };

  const addToGroup = (item: DragItem, groupId: string) => {
    const newLeaf: LeafNode = {
      id: uid(),
      type: "leaf",
      object: item.objectName,
      attribute: item.attribute.name,
      operator: item.attribute.suggestedOperators?.[0] ?? "EQUAL",
      value: "",
    };
    const walk = (node: ConditionNode): ConditionNode => {
      if (node.id === groupId && node.type === "group")
        return { ...node, children: [...node.children, newLeaf] };
      if (node.type === "group") return { ...node, children: node.children.map(walk) };
      return node;
    };
    onTreeChange(walk(tree));
  };

  const addSubGroup = () => {
    if (tree.type === "group") {
      const newGroup: GroupNode = { ...mkGroup(), children: [] };
      onTreeChange({ ...tree, children: [...tree.children, newGroup] });
    }
  };

  // ── DnD ──────────────────────────────────────────────────
  const handleDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { type?: string };
    setActiveType(data?.type === "action" ? "action" : "condition");
    setActiveItem(e.active.data.current as DragItem);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { over, active } = e;
    if (over && active.data.current) {
        const data = active.data.current as {
        type?: string;
        template?: typeof ACTION_TEMPLATES[0];
        objectName?: string;
        attribute?: ObjectAttribute
        };

        const isActionDrop = over.id === "action-dropzone" || over.id === "action-dropzone-bottom";

        if (data.type === "action" && isActionDrop && data.template) {
        addAction(data.template);
        } else if (data.type !== "action") {
        const groupId = (over.id as string).replace("dropzone-", "");
        addToGroup(active.data.current as DragItem, groupId);
        }
    }
    setActiveItem(null);
    setActiveType(null);
    };

  const isRootEmpty = tree.type === "group" && tree.children.length === 0;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-[220px_1fr] gap-5">

        {/* ── Left: Library ── */}
        <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Library
            </p>

            {/* Object Library Dropdown */}
            <div className="rounded-xl border overflow-hidden">
                <button
                onClick={() => setOpenLib(openLib === "object" ? null : "object")}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/40 hover:bg-muted/70 transition-colors text-sm font-semibold">
                <span className="flex items-center gap-2">
                    <span>📦</span>
                    <span>Object Library</span>
                </span>
                <span className={`text-muted-foreground text-xs transition-transform duration-200 ${openLib === "object" ? "rotate-180" : ""}`}>
                    ▼
                </span>
                </button>

                {openLib === "object" && (
                <div className="p-3 flex flex-col gap-3 border-t">
                    {OBJECT_DEFINITIONS.map((objDef) => {
                    const c = COLOR_MAP[objDef.color];
                    return (
                        <div key={objDef.name} className={`rounded-xl border p-3 ${c.bg} ${c.border}`}>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-base">{objDef.icon}</span>
                            <span className={`text-sm font-semibold ${c.text}`}>{objDef.name}</span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            {objDef.attributes.map((attr) => (
                            <DraggableChip key={attr.name} objectDef={objDef} attr={attr} />
                            ))}
                        </div>
                        </div>
                    );
                    })}
                </div>
                )}
            </div>

            {/* Action Library Dropdown */}
            <div className="rounded-xl border overflow-hidden">
                <button
                onClick={() => setOpenLib(openLib === "action" ? null : "action")}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/40 hover:bg-muted/70 transition-colors text-sm font-semibold">
                <span className="flex items-center gap-2">
                    <span>⚡</span>
                    <span>Action Library</span>
                </span>
                <span className={`text-muted-foreground text-xs transition-transform duration-200 ${openLib === "action" ? "rotate-180" : ""}`}>
                    ▼
                </span>
                </button>

                {openLib === "action" && (
                <div className="p-3 border-t">
                    <div className="rounded-xl border border-purple-200 bg-purple-50 dark:bg-purple-950 dark:border-purple-800 p-3">
                    <div className="flex flex-col gap-1.5">
                        {ACTION_TEMPLATES.map((t) => (
                        <DraggableActionChip key={t.key} template={t} />
                        ))}
                    </div>
                    </div>
                </div>
                )}
            </div>
        </div>

        {/* ── Right: Canvas ── */}
        <div className="flex flex-col gap-5">

          {/* Kondisi */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Canvas Kondisi (IF)
              </p>
              {!isRootEmpty && (
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={addSubGroup}>
                  + Tambah Sub Group
                </Button>
              )}
            </div>

            {isRootEmpty ? (
              <DroppableCanvas groupId={tree.id} isEmpty={true}>
                <></>
              </DroppableCanvas>
            ) : (
              tree.type === "group" && (
                <GroupBlock
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

          {/* Action */}
            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Canvas Action (THEN)
                    </p>
                    <Button size="sm" variant="outline"
                    className="text-xs h-7 border-purple-300 text-purple-600 hover:bg-purple-50"
                    onClick={() => onActionEntriesChange([...actionEntries, { id: uid(), key: "", value: "", type: "string" }])}>
                    + Tambah Manual
                    </Button>
                </div>

                {actionEntries.length === 0 ? (
                    // Kosong — tampilkan full drop zone
                    <ActionDropZone />
                ) : (
                    // Ada entries — tampilkan list + drop zone di bawah
                    <div className="flex flex-col gap-2">
                    {actionEntries.map((entry) => (
                        <ActionRow
                        key={entry.id}
                        entry={entry}
                        onUpdate={updateAction}
                        onRemove={removeAction}
                        />
                    ))}
                    <ActionDropZoneBottom />
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeItem && (
          <div className={`px-3 py-2 rounded-lg border shadow-xl text-xs font-medium flex items-center gap-2 rotate-1 opacity-95 bg-background
            ${activeType === "action" ? "border-purple-300" : "border-border"}`}>
            {activeType === "action"
              ? <span>{(activeItem as unknown as { template: typeof ACTION_TEMPLATES[0] }).template?.icon}</span>
              : <span>{OBJECT_DEFINITIONS.find((o) => o.name === (activeItem as DragItem).objectName)?.icon}</span>
            }
            <span>
              {activeType === "action"
                ? (activeItem as unknown as { template: typeof ACTION_TEMPLATES[0] }).template?.label
                : `${(activeItem as DragItem).objectName}.${(activeItem as DragItem).attribute?.name}`
              }
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}