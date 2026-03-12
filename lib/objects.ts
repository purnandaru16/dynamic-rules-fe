export interface ObjectAttribute {
  name: string;
  type: "string" | "number" | "boolean";
  suggestedOperators?: string[];
}

export interface ObjectDefinition {
  name: string;
  icon: string;
  color: string;
  attributes: ObjectAttribute[];
}

export const OBJECT_DEFINITIONS: ObjectDefinition[] = [
  {
    name: "Customer",
    icon: "👤",
    color: "blue",
    attributes: [
      { name: "membershipLevel", type: "string",  suggestedOperators: ["EQUAL", "NOT_EQUAL", "IN", "NOT_IN"] },
      { name: "status",          type: "string",  suggestedOperators: ["EQUAL", "NOT_EQUAL", "IN"] },
      { name: "region",          type: "string",  suggestedOperators: ["EQUAL", "NOT_EQUAL", "IN", "NOT_IN"] },
      { name: "age",             type: "number",  suggestedOperators: ["EQUAL", "MORE_THAN", "LESS_THAN", "MORE_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL"] },
      { name: "email",           type: "string",  suggestedOperators: ["EQUAL", "VALID_EMAIL", "CONTAINS"] },
    ]
  },
  {
    name: "Cart",
    icon: "🛒",
    color: "green",
    attributes: [
      { name: "total",     type: "number", suggestedOperators: ["MORE_THAN", "LESS_THAN", "MORE_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL", "EQUAL"] },
      { name: "coupon",    type: "string", suggestedOperators: ["EQUAL", "NOT_NULL", "NULL"] },
      { name: "itemCount", type: "number", suggestedOperators: ["MORE_THAN", "LESS_THAN", "EQUAL"] },
    ]
  },
  {
    name: "Branch",
    icon: "🏢",
    color: "orange",
    attributes: [
      { name: "name",   type: "string", suggestedOperators: ["EQUAL", "IN", "NOT_IN", "CONTAINS"] },
      { name: "region", type: "string", suggestedOperators: ["EQUAL", "IN", "NOT_IN"] },
      { name: "code",   type: "string", suggestedOperators: ["EQUAL", "IN", "NOT_IN"] },
    ]
  },
];

export const COLOR_MAP: Record<string, { bg: string; border: string; badge: string; text: string }> = {
  blue:   { bg: "bg-blue-50 dark:bg-blue-950",   border: "border-blue-200 dark:border-blue-800",   badge: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",   text: "text-blue-600" },
  green:  { bg: "bg-green-50 dark:bg-green-950", border: "border-green-200 dark:border-green-800", badge: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", text: "text-green-600" },
  orange: { bg: "bg-orange-50 dark:bg-orange-950", border: "border-orange-200 dark:border-orange-800", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300", text: "text-orange-600" },
};