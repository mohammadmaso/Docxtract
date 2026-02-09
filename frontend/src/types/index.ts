// ─── Schema Types ───

export interface SchemaField {
  id: string;
  name: string;
  type: "string" | "number" | "integer" | "boolean" | "object" | "array";
  description: string;
  required: boolean;
  fields?: SchemaField[]; // for type === "object"
  items?: {
    type: string;
    fields?: SchemaField[]; // for array of objects
  };
}

export interface SchemaDefinition {
  fields: SchemaField[];
}

export interface LLMProvider {
  value: string;
  label: string;
  models: string[];
}

export interface ExtractionSchema {
  id: number;
  name: string;
  description: string;
  schema_definition: SchemaDefinition;
  llm_provider: string;
  llm_model: string;
  field_count: number;
  created_at: string;
  updated_at?: string;
}

// ─── Document Types ───

export interface Document {
  id: number;
  title: string;
  raw_text: string;
  file_type: string;
  created_at: string;
  latest_job?: {
    status: string;
    schema__name: string;
  } | null;
}

// ─── Job Types ───

export type JobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "retrying";

export interface ProcessingJob {
  id: number;
  document__id?: number;
  document__title: string;
  schema__name: string;
  schema__id?: number;
  status: JobStatus;
  result_data?: Record<string, unknown> | null;
  error_message: string;
  retry_count: number;
  created_at: string;
  updated_at?: string;
  completed_at: string | null;
  // Chunk progress
  is_chunked?: boolean;
  total_chunks?: number;
  processed_chunks?: number;
}

// ─── Schema Suggestion Types ───

export interface SchemaSuggestion {
  name: string;
  description: string;
  schema_definition: SchemaDefinition;
  document_id: number;
  document_title: string;
}

export interface SchemaPreset {
  key: string;
  label: string;
  description: string;
  schema: {
    name: string;
    description: string;
    schema_definition: SchemaDefinition;
  };
}

// ─── Dashboard Types ───

export interface DashboardStats {
  schemas: number;
  documents: number;
  jobsTotal: number;
  jobsCompleted: number;
  jobsFailed: number;
  jobsPending: number;
}

// ─── Shared Page Props ───

export interface PageProps {
  errors?: Record<string, string>;
}
