import type { SchemaField } from "@/types";
import FieldList, { createEmptyField } from "./FieldList";
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  GripVertical,
} from "lucide-react";

const FIELD_TYPES = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "integer", label: "Integer" },
  { value: "boolean", label: "Boolean" },
  { value: "object", label: "Object (nested)" },
  { value: "array", label: "Array (list)" },
] as const;

const ARRAY_ITEM_TYPES = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "integer", label: "Integer" },
  { value: "boolean", label: "Boolean" },
  { value: "object", label: "Object" },
] as const;

interface Props {
  field: SchemaField;
  index: number;
  total: number;
  depth: number;
  onChange: (field: SchemaField) => void;
  onRemove: () => void;
  onMove: (direction: "up" | "down") => void;
}

export default function FieldEditor({
  field,
  index,
  total,
  depth,
  onChange,
  onRemove,
  onMove,
}: Props) {
  const updateProp = <K extends keyof SchemaField>(
    key: K,
    value: SchemaField[K]
  ) => {
    const updated = { ...field, [key]: value };

    // When changing to object type, initialize fields array
    if (key === "type" && value === "object" && !updated.fields) {
      updated.fields = [];
      delete updated.items;
    }
    // When changing to array type, initialize items
    if (key === "type" && value === "array" && !updated.items) {
      updated.items = { type: "string" };
      delete updated.fields;
    }
    // When changing away from object/array, clear nested
    if (
      key === "type" &&
      value !== "object" &&
      value !== "array"
    ) {
      delete updated.fields;
      delete updated.items;
    }

    onChange(updated);
  };

  const handleArrayItemTypeChange = (itemType: string) => {
    const updated = { ...field };
    if (itemType === "object") {
      updated.items = {
        type: "object",
        fields: updated.items?.fields || [],
      };
    } else {
      updated.items = { type: itemType };
    }
    onChange(updated);
  };

  const depthColor = depth === 0 ? "border-l-blue-400" : depth === 1 ? "border-l-green-400" : "border-l-purple-400";

  return (
    <div
      className={`rounded-md border bg-background ${depthColor} border-l-4 ${
        depth > 0 ? "ml-6" : ""
      }`}
    >
      <div className="p-4 space-y-3">
        {/* Top row: controls */}
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />

          {/* Field name */}
          <input
            type="text"
            value={field.name}
            onChange={(e) => updateProp("name", e.target.value)}
            placeholder="field_name"
            className="flex-1 rounded-md border bg-background px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />

          {/* Type selector */}
          <select
            value={field.type}
            onChange={(e) =>
              updateProp(
                "type",
                e.target.value as SchemaField["type"]
              )
            }
            className="rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          {/* Required toggle */}
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => updateProp("required", e.target.checked)}
              className="rounded"
            />
            <span className="text-xs text-muted-foreground">Required</span>
          </label>

          {/* Move buttons */}
          <button
            type="button"
            onClick={() => onMove("up")}
            disabled={index === 0}
            className="p-1 rounded hover:bg-accent disabled:opacity-30"
            title="Move up"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove("down")}
            disabled={index === total - 1}
            className="p-1 rounded hover:bg-accent disabled:opacity-30"
            title="Move down"
          >
            <ChevronDown className="h-4 w-4" />
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={onRemove}
            className="p-1 rounded text-destructive hover:bg-destructive/10"
            title="Remove field"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {/* Description (AI helper text) */}
        <div className="flex items-start gap-2 pl-6">
          <textarea
            value={field.description}
            onChange={(e) => updateProp("description", e.target.value)}
            placeholder="Helper text for AI (describe what data to extract for this field)..."
            rows={2}
            className="flex-1 rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>

        {/* Nested fields for object type */}
        {field.type === "object" && (
          <div className="pt-2">
            <p className="text-xs font-medium text-muted-foreground mb-2 pl-6">
              Object properties:
            </p>
            <FieldList
              fields={field.fields || []}
              onChange={(nestedFields) =>
                onChange({ ...field, fields: nestedFields })
              }
              depth={depth + 1}
            />
          </div>
        )}

        {/* Array items config */}
        {field.type === "array" && (
          <div className="pt-2 pl-6 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Array item type:
              </span>
              <select
                value={field.items?.type || "string"}
                onChange={(e) => handleArrayItemTypeChange(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {ARRAY_ITEM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {field.items?.type === "object" && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Object properties within array:
                </p>
                <FieldList
                  fields={field.items.fields || []}
                  onChange={(nestedFields) =>
                    onChange({
                      ...field,
                      items: { ...field.items!, fields: nestedFields },
                    })
                  }
                  depth={depth + 1}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
