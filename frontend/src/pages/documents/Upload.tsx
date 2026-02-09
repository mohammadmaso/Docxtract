import { Head, router, usePage } from "@inertiajs/react";
import { useRef, useState, type DragEvent } from "react";
import AppLayout from "@/layouts/AppLayout";
import type { PageProps } from "@/types";
import { Upload, FileText, X } from "lucide-react";

interface Schema {
  id: number;
  name: string;
}

interface Props extends PageProps {
  schemas: Schema[];
}

export default function DocumentUpload({ schemas, errors }: Props) {
  // Read schema from URL param if present
  const { url } = usePage();
  const urlParams = new URLSearchParams(url.split("?")[1] || "");
  const defaultSchema = urlParams.get("schema") || "";

  const [schemaId, setSchemaId] = useState(defaultSchema);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...droppedFiles]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selected]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!schemaId || files.length === 0) return;

    setSubmitting(true);

    const formData = new FormData();
    formData.append("schema_id", schemaId);
    files.forEach((file) => {
      formData.append("files", file);
    });

    router.post("/documents/upload/", formData, {
      forceFormData: true,
      onFinish: () => setSubmitting(false),
    });
  };

  return (
    <AppLayout>
      <Head title="Upload Documents" />

      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Upload Documents</h1>
          <p className="text-muted-foreground">
            Upload one or more documents to process with a selected schema.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Schema Selection */}
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h2 className="text-lg font-semibold">Select Schema</h2>
            <select
              value={schemaId}
              onChange={(e) => setSchemaId(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            >
              <option value="">Choose a schema...</option>
              {schemas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {errors?.schema_id && (
              <p className="text-sm text-destructive">{errors.schema_id}</p>
            )}
            {schemas.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No schemas available.{" "}
                <a href="/schemas/create/" className="text-primary underline">
                  Create one first
                </a>{" "}
                — or let AI suggest one from a document.
              </p>
            )}
            {schemas.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Don't see the right schema?{" "}
                <a href="/schemas/create/" className="text-primary underline">
                  Create a new one
                </a>{" "}
                — you can also let AI suggest fields from a document.
              </p>
            )}
          </div>

          {/* File Upload */}
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h2 className="text-lg font-semibold">Upload Files</h2>

            {/* Drag & Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
            >
              <Upload className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">
                Drag & drop files here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports: Markdown (.md), Text (.txt), JSON (.json)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".md,.txt,.markdown,.json"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
            {errors?.files && (
              <p className="text-sm text-destructive">{errors.files}</p>
            )}

            {/* File List */}
            {files.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {files.length} file{files.length !== 1 ? "s" : ""} selected
                </p>
                <ul className="space-y-1">
                  {files.map((file, index) => (
                    <li
                      key={index}
                      className="flex items-center justify-between rounded-md bg-muted px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{file.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="p-1 rounded hover:bg-background"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
              disabled={submitting || !schemaId || files.length === 0}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {submitting
                ? "Uploading..."
                : `Upload & Process ${files.length || ""} File${files.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
