import { useState } from "react";
import type { SchemaField } from "@/types";
import FieldList from "./FieldList";
import JsonEditor from "./JsonEditor";

interface Props {
  fields: SchemaField[];
  onChange: (fields: SchemaField[]) => void;
}

export default function SchemaBuilder({ fields, onChange }: Props) {
  const [activeTab, setActiveTab] = useState<"visual" | "json">("visual");

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex border-b">
        <button
          type="button"
          onClick={() => setActiveTab("visual")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "visual"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Visual Builder
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("json")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "json"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          JSON Editor
        </button>
      </div>

      {/* Content */}
      {activeTab === "visual" ? (
        <FieldList fields={fields} onChange={onChange} depth={0} />
      ) : (
        <JsonEditor fields={fields} onChange={onChange} />
      )}
    </div>
  );
}
