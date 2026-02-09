import { useState, useEffect } from "react";
import type { SchemaField, SchemaDefinition } from "@/types";

interface Props {
  fields: SchemaField[];
  onChange: (fields: SchemaField[]) => void;
}

export default function JsonEditor({ fields, onChange }: Props) {
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Sync fields → JSON text
  useEffect(() => {
    const definition: SchemaDefinition = { fields };
    setJsonText(JSON.stringify(definition, null, 2));
    setError(null);
  }, [fields]);

  const handleTextChange = (value: string) => {
    setJsonText(value);

    try {
      const parsed = JSON.parse(value);
      if (!parsed.fields || !Array.isArray(parsed.fields)) {
        setError('JSON must have a "fields" array at the top level.');
        return;
      }

      // Validate field structure
      const validated = validateFields(parsed.fields);
      if (validated.error) {
        setError(validated.error);
        return;
      }

      setError(null);
      onChange(parsed.fields);
    } catch {
      setError("Invalid JSON syntax.");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Edit the schema definition as JSON. Changes are validated in real-time.
        </p>
        <button
          type="button"
          onClick={() => {
            try {
              const formatted = JSON.stringify(JSON.parse(jsonText), null, 2);
              setJsonText(formatted);
            } catch {
              // ignore
            }
          }}
          className="text-xs text-primary hover:underline"
        >
          Format JSON
        </button>
      </div>

      <textarea
        value={jsonText}
        onChange={(e) => handleTextChange(e.target.value)}
        rows={20}
        spellCheck={false}
        className="w-full rounded-md border bg-background px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
      />

      {error && (
        <p className="text-sm text-destructive flex items-center gap-1">
          ⚠ {error}
        </p>
      )}

      <div className="text-xs text-muted-foreground space-y-1">
        <p className="font-medium">Schema format reference:</p>
        <pre className="bg-muted rounded p-2 overflow-x-auto">
          {`{
  "fields": [
    {
      "id": "unique-id",
      "name": "field_name",
      "type": "string|number|integer|boolean|object|array",
      "description": "Helper text for AI",
      "required": true,
      "fields": [...],           // for object type
      "items": {                 // for array type
        "type": "string|object",
        "fields": [...]          // if array of objects
      }
    }
  ]
}`}
        </pre>
      </div>
    </div>
  );
}

function validateFields(
  fields: unknown[]
): { error: string | null } {
  const validTypes = [
    "string",
    "number",
    "integer",
    "boolean",
    "object",
    "array",
  ];

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i] as Record<string, unknown>;

    if (!field.name || typeof field.name !== "string") {
      return { error: `Field ${i + 1}: "name" must be a non-empty string.` };
    }

    if (!field.type || !validTypes.includes(field.type as string)) {
      return {
        error: `Field "${field.name}": "type" must be one of: ${validTypes.join(", ")}.`,
      };
    }

    if (field.type === "object" && field.fields) {
      if (!Array.isArray(field.fields)) {
        return {
          error: `Field "${field.name}": "fields" must be an array.`,
        };
      }
      const nested = validateFields(field.fields as unknown[]);
      if (nested.error) return nested;
    }

    if (field.type === "array" && field.items) {
      const items = field.items as Record<string, unknown>;
      if (items.type === "object" && items.fields) {
        if (!Array.isArray(items.fields)) {
          return {
            error: `Field "${field.name}": items.fields must be an array.`,
          };
        }
        const nested = validateFields(items.fields as unknown[]);
        if (nested.error) return nested;
      }
    }
  }

  return { error: null };
}
