export interface ObjectAttribute {
  name: string;
  type: "string" | "number" | "boolean";
  description?: string;
  suggestedOperators?: string[];
  exampleValue?: string;
}

export interface ObjectDefinition {
  name: string;
  category: string;
  icon: string;
  color: "blue" | "emerald" | "amber" | "purple" | "indigo" | "rose";
  description: string;
  attributes: ObjectAttribute[];
}

export const OBJECT_DEFINITIONS: ObjectDefinition[] = [
  {
    name: "Customer",
    category: "Entity",
    icon: "User",
    color: "blue",
    description: "Customer profile, membership tier, and demographic data",
    attributes: [
      { name: "membershipLevel", type: "string", description: "Tier status: PLATINUM, GOLD, SILVER", suggestedOperators: ["EQUAL", "NOT_EQUAL", "IN", "NOT_IN"], exampleValue: "GOLD" },
      { name: "status",          type: "string", description: "Account lifecycle status", suggestedOperators: ["EQUAL", "NOT_EQUAL", "IN"], exampleValue: "ACTIVE" },
      { name: "region",          type: "string", description: "Geographic territory code", suggestedOperators: ["EQUAL", "NOT_EQUAL", "IN", "NOT_IN"], exampleValue: "JKT-01" },
      { name: "age",             type: "number", description: "Age in completed years", suggestedOperators: ["EQUAL", "MORE_THAN", "LESS_THAN", "MORE_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL"], exampleValue: "25" },
      { name: "email",           type: "string", description: "Primary contact email address", suggestedOperators: ["EQUAL", "VALID_EMAIL", "CONTAINS"], exampleValue: "user@corp.id" },
    ]
  },
  {
    name: "Cart",
    category: "Transaction",
    icon: "ShoppingCart",
    color: "emerald",
    description: "Shopping basket, line items count, and order values",
    attributes: [
      { name: "total",     type: "number", description: "Gross transaction amount (IDR)", suggestedOperators: ["MORE_THAN", "LESS_THAN", "MORE_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL", "EQUAL"], exampleValue: "500000" },
      { name: "coupon",    type: "string", description: "Applied promo voucher code", suggestedOperators: ["EQUAL", "NOT_NULL", "NULL"], exampleValue: "ASTRAHEMAT" },
      { name: "itemCount", type: "number", description: "Quantity of items inside basket", suggestedOperators: ["MORE_THAN", "LESS_THAN", "EQUAL"], exampleValue: "3" },
    ]
  },
  {
    name: "Branch",
    category: "Organization",
    icon: "Building2",
    color: "amber",
    description: "Retail store, dealership branch, or sales depot",
    attributes: [
      { name: "name",   type: "string", description: "Official branch display name", suggestedOperators: ["EQUAL", "IN", "NOT_IN", "CONTAINS"], exampleValue: "Astra Sunter" },
      { name: "region", type: "string", description: "Regional area coverage", suggestedOperators: ["EQUAL", "IN", "NOT_IN"], exampleValue: "DKI" },
      { name: "code",   type: "string", description: "Unique outlet identifier code", suggestedOperators: ["EQUAL", "IN", "NOT_IN"], exampleValue: "BR-901" },
    ]
  },
];

export interface ActionTemplate {
  key: string;
  label: string;
  icon: string;
  category: string;
  description: string;
  defaultValue: string;
  type: "string" | "number" | "boolean";
}

export const ACTION_TEMPLATES: ActionTemplate[] = [
  { key: "discount",     label: "Apply Discount",    icon: "Percent",     category: "Pricing",      defaultValue: "10",             type: "number",  description: "Deducts percentage or fixed discount on order" },
  { key: "message",      label: "System Message",    icon: "MessageSquare", category: "Notification", defaultValue: "Procedure rule matched", type: "string", description: "Outputs status message or modal banner" },
  { key: "eligible",     label: "Grant Eligibility", icon: "CheckCircle2", category: "Validation",   defaultValue: "true",           type: "boolean", description: "Marks customer fact as verified and approved" },
  { key: "rewardValue",  label: "Reward Points",     icon: "Gift",         category: "Loyalty",      defaultValue: "500",            type: "number",  description: "Credits loyalty reward points balance" },
  { key: "rewardType",   label: "Reward Category",   icon: "Tag",          category: "Loyalty",      defaultValue: "CASHBACK",       type: "string",  description: "Classification of promotional reward" },
  { key: "campaignName", label: "Target Campaign",   icon: "Megaphone",    category: "Marketing",    defaultValue: "Q1_PROMO_SPECIAL", type: "string", description: "Associates execution to marketing campaign" },
];

export const COLOR_MAP: Record<string, { bg: string; border: string; badge: string; text: string; lightBg: string; ring: string }> = {
  blue: {
    bg: "bg-blue-50/80 dark:bg-blue-950/40",
    border: "border-blue-200 dark:border-blue-800/80",
    badge: "bg-blue-100/90 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300",
    text: "text-blue-600 dark:text-blue-400",
    lightBg: "bg-blue-50/40 dark:bg-blue-950/20",
    ring: "focus:ring-blue-500",
  },
  emerald: {
    bg: "bg-emerald-50/80 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-800/80",
    badge: "bg-emerald-100/90 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
    text: "text-emerald-600 dark:text-emerald-400",
    lightBg: "bg-emerald-50/40 dark:bg-emerald-950/20",
    ring: "focus:ring-emerald-500",
  },
  green: {
    bg: "bg-emerald-50/80 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-800/80",
    badge: "bg-emerald-100/90 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
    text: "text-emerald-600 dark:text-emerald-400",
    lightBg: "bg-emerald-50/40 dark:bg-emerald-950/20",
    ring: "focus:ring-emerald-500",
  },
  amber: {
    bg: "bg-amber-50/80 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-800/80",
    badge: "bg-amber-100/90 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300",
    text: "text-amber-600 dark:text-amber-400",
    lightBg: "bg-amber-50/40 dark:bg-amber-950/20",
    ring: "focus:ring-amber-500",
  },
  orange: {
    bg: "bg-amber-50/80 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-800/80",
    badge: "bg-amber-100/90 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300",
    text: "text-amber-600 dark:text-amber-400",
    lightBg: "bg-amber-50/40 dark:bg-amber-950/20",
    ring: "focus:ring-amber-500",
  },
  purple: {
    bg: "bg-purple-50/80 dark:bg-purple-950/40",
    border: "border-purple-200 dark:border-purple-800/80",
    badge: "bg-purple-100/90 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300",
    text: "text-purple-600 dark:text-purple-400",
    lightBg: "bg-purple-50/40 dark:bg-purple-950/20",
    ring: "focus:ring-purple-500",
  },
  indigo: {
    bg: "bg-indigo-50/80 dark:bg-indigo-950/40",
    border: "border-indigo-200 dark:border-indigo-800/80",
    badge: "bg-indigo-100/90 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300",
    text: "text-indigo-600 dark:text-indigo-400",
    lightBg: "bg-indigo-50/40 dark:bg-indigo-950/20",
    ring: "focus:ring-indigo-500",
  },
  rose: {
    bg: "bg-rose-50/80 dark:bg-rose-950/40",
    border: "border-rose-200 dark:border-rose-800/80",
    badge: "bg-rose-100/90 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300",
    text: "text-rose-600 dark:text-rose-400",
    lightBg: "bg-rose-50/40 dark:bg-rose-950/20",
    ring: "focus:ring-rose-500",
  },
};
