import type { SchemaField } from "@/types";
import FieldEditor from "./FieldEditor";
import { Plus } from "lucide-react";

interface Props {
  fields: SchemaField[];
  onChange: (fields: SchemaField[]) => void;
  depth: number;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

export function createEmptyField(): SchemaField {
  return {
    id: generateId(),
    name: "",
    type: "string",
    description: "",
    required: false,
  };
}

export default function FieldList({ fields, onChange, depth }: Props) {
  const addField = () => {
    onChange([...fields, createEmptyField()]);
  };

  const updateField = (index: number, updated: SchemaField) => {
    const newFields = [...fields];
    newFields[index] = updated;
    onChange(newFields);
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const moveField = (index: number, direction: "up" | "down") => {
    const newFields = [...fields];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newFields.length) return;
    [newFields[index], newFields[targetIndex]] = [
      newFields[targetIndex],
      newFields[index],
    ];
    onChange(newFields);
  };

  return (
    <div className="space-y-3">
      {fields.length === 0 && depth === 0 && (
        <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
          <p className="mb-2">No fields defined yet.</p>
          <p className="text-sm">Click "Add Field" to start building your schema.</p>
        </div>
      )}

      {fields.map((field, index) => (
        <FieldEditor
          key={field.id}
          field={field}
          index={index}
          total={fields.length}
          depth={depth}
          onChange={(updated) => updateField(index, updated)}
          onRemove={() => removeField(index)}
          onMove={(dir) => moveField(index, dir)}
        />
      ))}

      <button
        type="button"
        onClick={addField}
        className={`inline-flex items-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors ${
          depth > 0 ? "ml-6" : ""
        }`}
      >
        <Plus className="h-3.5 w-3.5" />
        Add {depth > 0 ? "Nested " : ""}Field
      </button>
    </div>
  );
}
