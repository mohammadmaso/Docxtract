import { Head, router, Link } from "@inertiajs/react";
import { useState, useCallback, useRef, useEffect } from "react";
import AppLayout from "@/layouts/AppLayout";
import SchemaBuilder from "@/components/schema-builder/SchemaBuilder";
import type {
  SchemaField,
  SchemaDefinition,
  LLMProvider,
  PageProps,
  SchemaSuggestion,
  SchemaPreset,
} from "@/types";
import {
  Sparkles,
  Loader2,
  Upload,
  FileText,
  LayoutTemplate,
  CheckCircle2,
} from "lucide-react";

interface Props extends PageProps {
  providers: LLMProvider[];
  presets: SchemaPreset[];
  suggestion?: SchemaSuggestion;
}

export default function SchemaCreate({
  providers,
  presets,
  errors,
  suggestion,
}: Props) {
  const [name, setName] = useState(suggestion?.name || "");
  const [description, setDescription] = useState(
    suggestion?.description || ""
  );
  const [llmProvider, setLlmProvider] = useState(
    providers[0]?.value || "openai"
  );
  const [llmModel, setLlmModel] = useState(
    providers[0]?.models[0] || "gpt-4o"
  );
  const [fields, setFields] = useState<SchemaField[]>(
    suggestion?.schema_definition?.fields || []
  );
  const [submitting, setSubmitting] = useState(false);

  // ─── File upload + suggestion state ───
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentProvider = providers.find((p) => p.value === llmProvider);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleProviderChange = (value: string) => {
    setLlmProvider(value);
    const provider = providers.find((p) => p.value === value);
    if (provider?.models.length) {
      setLlmModel(provider.models[0]);
    }
  };

  // ─── Handle file selection ───
  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setSuggestionError("");
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  // ─── Upload file & request AI suggestion ───
  const handleSuggest = useCallback(async () => {
    if (!selectedFile) return;
    setSuggesting(true);
    setSuggestionError("");

    try {
      const csrf =
        window.document.cookie
          .split("; ")
          .find((row: string) => row.startsWith("csrftoken="))
          ?.split("=")[1] || "";

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("llm_provider", llmProvider);
      formData.append("llm_model", llmModel);

      const res = await fetch("/api/upload-and-suggest/", {
        method: "POST",
        headers: { "X-CSRFToken": csrf },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to upload and start suggestion");
      }

      const data = await res.json();
      const suggestionId = data.suggestion_id;

      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(
            `/api/suggestions/${suggestionId}/status/`
          );
          const pollData = await pollRes.json();

          if (pollData.status === "completed") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setSuggesting(false);
            setName(pollData.suggested_name || "");
            setDescription(pollData.suggested_description || "");
            const suggestedFields =
              pollData.suggested_schema?.fields || [];
            setFields(suggestedFields);
          } else if (pollData.status === "failed") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setSuggesting(false);
            setSuggestionError(
              pollData.error_message || "Schema suggestion failed."
            );
          }
        } catch {
          // Ignore transient poll errors
        }
      }, 2000);
    } catch (err: any) {
      setSuggesting(false);
      setSuggestionError(err.message || "Failed to start suggestion");
    }
  }, [selectedFile, llmProvider, llmModel]);

  // ─── Apply a preset template ───
  const handlePresetSelect = (preset: SchemaPreset) => {
    setName(preset.schema.name);
    setDescription(preset.schema.description);
    setFields(preset.schema.schema_definition.fields);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const schemaDefinition: SchemaDefinition = { fields };

    router.post(
      "/schemas/create/",
      {
        name,
        description,
        schema_definition: schemaDefinition,
        llm_provider: llmProvider,
        llm_model: llmModel,
      } as Record<string, unknown>,
      {
        headers: { "Content-Type": "application/json" },
        onFinish: () => setSubmitting(false),
      }
    );
  };

  return (
    <AppLayout>
      <Head title="Create Schema" />

      <div className="max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Create Extraction Schema</h1>
          <p className="text-muted-foreground">
            Define the fields and structure you want to extract from documents.
          </p>
        </div>

        {/* AI Suggestion Banner (when pre-filled from suggestion route) */}
        {suggestion && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  AI-Suggested Schema
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  This schema was suggested by analyzing{" "}
                  <Link
                    href={`/documents/${suggestion.document_id}/`}
                    className="underline font-medium"
                  >
                    {suggestion.document_title}
                  </Link>
                  . Review the fields below, make any adjustments, and save.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ─── Preset Templates ─── */}
        {presets.length > 0 && !suggestion && (
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5 text-blue-500" />
              <h2 className="text-lg font-semibold">
                Start from a Template
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Choose a built-in extraction template for common document patterns.
              You can customize the fields after selecting.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {presets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => handlePresetSelect(preset)}
                  className="flex flex-col items-start gap-1 rounded-lg border p-4 text-left hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors"
                >
                  <span className="text-sm font-medium">{preset.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {preset.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── AI Suggest from Uploaded File ─── */}
        {providers.length > 0 && !suggestion && (
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-semibold">
                Suggest Schema from a Document
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Upload a sample document and let AI analyze it to suggest the best
              extraction schema automatically.
            </p>

            {/* File upload area */}
            <div
              className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                dragOver
                  ? "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv,.json,.xml,.html,.md,.log"
                className="hidden"
                onChange={handleFileInputChange}
              />
              {selectedFile ? (
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                  <div>
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="ml-2 text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Drag &amp; drop a file here, or{" "}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-amber-600 dark:text-amber-400 underline font-medium"
                    >
                      browse
                    </button>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supports .txt, .csv, .json, .xml, .html, .md, .log
                  </p>
                </>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSuggest}
                disabled={suggesting || !selectedFile}
                className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {suggesting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing document...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Upload &amp; Suggest Schema
                  </>
                )}
              </button>
            </div>
            {suggestionError && (
              <p className="text-sm text-destructive">{suggestionError}</p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h2 className="text-lg font-semibold">Basic Information</h2>

            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Schema Name *
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Invoice Extractor"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
              {errors?.name && (
                <p className="text-sm text-destructive">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this schema extracts..."
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
          </div>

          {/* LLM Configuration */}
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h2 className="text-lg font-semibold">LLM Configuration</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="provider" className="text-sm font-medium">
                  Provider
                </label>
                <select
                  id="provider"
                  value={llmProvider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {providers.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {providers.length === 0 && (
                  <p className="text-sm text-destructive">
                    No LLM providers configured. Set API keys in .env file.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="model" className="text-sm font-medium">
                  Model
                </label>
                <select
                  id="model"
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {currentProvider?.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Schema Builder */}
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h2 className="text-lg font-semibold">Schema Definition</h2>
            <p className="text-sm text-muted-foreground">
              Define the fields the AI should extract. Use the visual builder or
              edit JSON directly.
            </p>
            {errors?.schema_definition && (
              <p className="text-sm text-destructive">
                {errors.schema_definition}
              </p>
            )}
            <SchemaBuilder fields={fields} onChange={setFields} />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Creating..." : "Create Schema"}
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
