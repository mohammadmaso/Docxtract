import { Head, Link, router } from "@inertiajs/react";
import { useState, useRef, useCallback, useEffect } from "react";
import AppLayout from "@/layouts/AppLayout";
import type {
  Document,
  ProcessingJob,
  LLMProvider,
  SchemaField,
} from "@/types";
import {
  ArrowLeft,
  FileJson,
  FileSpreadsheet,
  FileText,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { JsonViewer } from "@/components/JsonViewer";

interface SuggestionResult {
  name: string;
  description: string;
  fields: SchemaField[];
}

interface Props {
  document: Document;
  jobs: ProcessingJob[];
  providers: LLMProvider[];
}

export default function DocumentShow({ document, jobs, providers }: Props) {
  const [activeJobIndex, setActiveJobIndex] = useState(0);
  const activeJob = jobs[activeJobIndex] || null;

  // ─── Suggestion state ───
  const [llmProvider, setLlmProvider] = useState(
    providers[0]?.value || "openai"
  );
  const [llmModel, setLlmModel] = useState(
    providers[0]?.models[0] || "gpt-4o"
  );
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");
  const [suggestion, setSuggestion] = useState<SuggestionResult | null>(null);
  const [suggestionId, setSuggestionId] = useState<number | null>(null);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [showSuggestionDetails, setShowSuggestionDetails] = useState(true);
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

  // ─── Trigger suggestion ───
  const handleSuggest = useCallback(async () => {
    setSuggesting(true);
    setSuggestionError("");
    setSuggestion(null);
    setApproved(false);

    try {
      const csrf =
        window.document.cookie
          .split("; ")
          .find((row: string) => row.startsWith("csrftoken="))
          ?.split("=")[1] || "";

      const res = await fetch(
        `/api/documents/${document.id}/suggest-schema/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrf,
          },
          body: JSON.stringify({
            llm_provider: llmProvider,
            llm_model: llmModel,
          }),
        }
      );

      if (!res.ok) throw new Error("Failed to start suggestion");

      const data = await res.json();
      const sId = data.suggestion_id;
      setSuggestionId(sId);

      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/suggestions/${sId}/status/`);
          const pollData = await pollRes.json();

          if (pollData.status === "completed") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setSuggesting(false);
            setSuggestion({
              name: pollData.suggested_name || "",
              description: pollData.suggested_description || "",
              fields: pollData.suggested_schema?.fields || [],
            });
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
  }, [document.id, llmProvider, llmModel]);

  // ─── Approve suggestion → create schema + process ───
  const handleApprove = useCallback(async () => {
    if (!suggestionId || !suggestion) return;
    setApproving(true);

    try {
      const csrf =
        window.document.cookie
          .split("; ")
          .find((row: string) => row.startsWith("csrftoken="))
          ?.split("=")[1] || "";

      const res = await fetch(`/api/suggestions/${suggestionId}/approve/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrf,
        },
        body: JSON.stringify({
          name: suggestion.name,
          description: suggestion.description,
          schema_definition: { fields: suggestion.fields },
        }),
      });

      if (!res.ok) throw new Error("Failed to approve suggestion");

      setApproved(true);
      setApproving(false);

      // Reload the page to show the new job
      setTimeout(() => {
        router.reload();
      }, 1500);
    } catch (err: any) {
      setApproving(false);
      setSuggestionError(err.message || "Failed to approve suggestion");
    }
  }, [suggestionId, suggestion]);

  return (
    <AppLayout>
      <Head title={document.title} />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Link href="/documents/" className="hover:text-foreground">
                <ArrowLeft className="h-4 w-4 inline mr-1" />
                Documents
              </Link>
            </div>
            <h1 className="text-2xl font-bold">{document.title}</h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                .{document.file_type}
              </span>
              <span>
                {new Date(document.created_at).toLocaleString()}
              </span>
            </div>
          </div>
          <a
            href={`/documents/${document.id}/export/text/`}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            <FileText className="h-4 w-4" />
            Export Text
          </a>
        </div>

        {/* ─── AI Schema Suggestion ─── */}
        {providers.length > 0 && (
          <div className="rounded-lg border bg-card shadow-sm">
            <div className="p-4 border-b flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              <h2 className="font-semibold">Auto-Suggest Schema & Process</h2>
            </div>
            <div className="p-4 space-y-4">
              {/* Not yet suggested or retrying */}
              {!suggestion && !approved && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Let AI analyze this document, suggest an extraction schema,
                    and — if you approve — immediately process the document with it.
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1.5 min-w-[140px]">
                      <label className="text-xs font-medium">Provider</label>
                      <select
                        value={llmProvider}
                        onChange={(e) => handleProviderChange(e.target.value)}
                        disabled={suggesting}
                        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      >
                        {providers.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5 min-w-[140px]">
                      <label className="text-xs font-medium">Model</label>
                      <select
                        value={llmModel}
                        onChange={(e) => setLlmModel(e.target.value)}
                        disabled={suggesting}
                        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      >
                        {currentProvider?.models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={handleSuggest}
                      disabled={suggesting}
                      className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                    >
                      {suggesting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Suggest Schema
                        </>
                      )}
                    </button>
                  </div>
                  {suggestionError && (
                    <p className="text-sm text-destructive">{suggestionError}</p>
                  )}
                </>
              )}

              {/* Suggestion ready — show for review */}
              {suggestion && !approved && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-green-700 dark:text-green-400 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" />
                      Schema suggested successfully
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setShowSuggestionDetails(!showSuggestionDetails)
                      }
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      {showSuggestionDetails ? (
                        <>
                          <ChevronUp className="h-3 w-3" /> Hide details
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" /> Show details
                        </>
                      )}
                    </button>
                  </div>

                  {/* Editable name/description */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Schema Name</label>
                      <input
                        type="text"
                        value={suggestion.name}
                        onChange={(e) =>
                          setSuggestion({ ...suggestion, name: e.target.value })
                        }
                        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Description</label>
                      <input
                        type="text"
                        value={suggestion.description}
                        onChange={(e) =>
                          setSuggestion({
                            ...suggestion,
                            description: e.target.value,
                          })
                        }
                        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      />
                    </div>
                  </div>

                  {/* Field list preview */}
                  {showSuggestionDetails && (
                    <div className="rounded-md border bg-muted/40 p-3 max-h-60 overflow-y-auto">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Fields ({suggestion.fields.length})
                      </p>
                      <div className="space-y-1">
                        {suggestion.fields.map((f, i) => (
                          <div
                            key={f.id || i}
                            className="flex items-center gap-2 text-xs"
                          >
                            <span className="font-mono font-medium">
                              {f.name}
                            </span>
                            <span className="rounded bg-muted px-1 py-0.5 text-[10px]">
                              {f.type}
                            </span>
                            {f.required && (
                              <span className="text-red-500">*</span>
                            )}
                            {f.description && (
                              <span className="text-muted-foreground truncate">
                                — {f.description}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Approve / Reject buttons */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={approving}
                      className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {approving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Creating & Processing...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Approve & Process
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSuggestion(null);
                        setSuggestionId(null);
                        setSuggestionError("");
                      }}
                      disabled={approving}
                      className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50 transition-colors"
                    >
                      <XCircle className="h-4 w-4" />
                      Discard
                    </button>
                    <Link
                      href={`/schemas/from-suggestion/${suggestionId}/`}
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Edit in full schema builder instead
                    </Link>
                  </div>
                  {suggestionError && (
                    <p className="text-sm text-destructive">{suggestionError}</p>
                  )}
                </div>
              )}

              {/* Approved confirmation */}
              {approved && (
                <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>
                    Schema created and processing started! Reloading...
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Job selector (if multiple) */}
        {jobs.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Processing job:</span>
            <select
              value={activeJobIndex}
              onChange={(e) => setActiveJobIndex(Number(e.target.value))}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            >
              {jobs.map((job, i) => (
                <option key={job.id} value={i}>
                  {job.schema__name} — {job.status}
                  {job.completed_at
                    ? ` (${new Date(job.completed_at).toLocaleString()})`
                    : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Two-panel view */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: Raw text */}
          <div className="rounded-lg border bg-card shadow-sm">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">Document Text</h2>
              <span className="text-xs text-muted-foreground">
                {document.raw_text.length.toLocaleString()} chars
              </span>
            </div>
            <div className="p-4 max-h-[600px] overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed">
                {document.raw_text}
              </pre>
            </div>
          </div>

          {/* Right: Extracted data */}
          <div className="rounded-lg border bg-card shadow-sm">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">Extracted Data</h2>
              {activeJob?.status === "completed" && activeJob.result_data && (
                <div className="flex items-center gap-2">
                  <a
                    href={`/jobs/${activeJob.id}/export/json/`}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium hover:bg-accent transition-colors"
                    title="Download JSON"
                  >
                    <FileJson className="h-3.5 w-3.5" />
                    JSON
                  </a>
                  <a
                    href={`/jobs/${activeJob.id}/export/csv/`}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium hover:bg-accent transition-colors"
                    title="Download CSV"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    CSV
                  </a>
                </div>
              )}
            </div>
            <div className="p-4 max-h-[600px] overflow-y-auto">
              {!activeJob ? (
                <p className="text-sm text-muted-foreground">
                  No processing jobs for this document.
                </p>
              ) : activeJob.status === "completed" && activeJob.result_data ? (
                <JsonViewer data={activeJob.result_data} initialExpandDepth={2} />
              ) : activeJob.status === "failed" ? (
                <div className="space-y-2">
                  <StatusBadge status="failed" />
                  <p className="text-sm text-destructive">
                    {activeJob.error_message || "Processing failed."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Retries: {activeJob.retry_count}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8">
                  <StatusBadge status={activeJob.status} />
                  <p className="text-sm text-muted-foreground mt-2">
                    {activeJob.status === "pending"
                      ? "Waiting in queue..."
                      : activeJob.status === "processing"
                        ? "Processing document..."
                        : `Retrying (attempt ${activeJob.retry_count})...`}
                  </p>
                  {/* Chunk progress bar */}
                  {activeJob.is_chunked &&
                    activeJob.total_chunks &&
                    activeJob.total_chunks > 0 && (
                      <div className="mt-4 w-48 space-y-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Chunk progress</span>
                          <span>
                            {activeJob.processed_chunks || 0}/
                            {activeJob.total_chunks}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-500"
                            style={{
                              width: `${
                                ((activeJob.processed_chunks || 0) /
                                  activeJob.total_chunks) *
                                100
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    processing: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    retrying: "bg-orange-100 text-orange-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        styles[status] || "bg-gray-100 text-gray-800"
      }`}
    >
      {status}
    </span>
  );
}
