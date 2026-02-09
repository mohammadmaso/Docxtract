import { Head, Link } from "@inertiajs/react";
import AppLayout from "@/layouts/AppLayout";
import type { ExtractionSchema, ProcessingJob, SchemaField } from "@/types";
import { Pencil, Upload, ArrowLeft } from "lucide-react";

interface Props {
  schema: ExtractionSchema;
  jobs: ProcessingJob[];
}

export default function SchemaShow({ schema, jobs }: Props) {
  return (
    <AppLayout>
      <Head title={schema.name} />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Link href="/schemas/" className="hover:text-foreground">
                <ArrowLeft className="h-4 w-4 inline mr-1" />
                Schemas
              </Link>
            </div>
            <h1 className="text-2xl font-bold">{schema.name}</h1>
            {schema.description && (
              <p className="text-muted-foreground">{schema.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Link
              href={`/documents/upload/?schema=${schema.id}`}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              <Upload className="h-4 w-4" />
              Process Documents
            </Link>
            <Link
              href={`/schemas/${schema.id}/edit/`}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          </div>
        </div>

        {/* Schema Info */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h2 className="text-lg font-semibold">Configuration</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-muted-foreground">LLM Provider</dt>
                <dd className="text-sm font-medium">
                  {schema.llm_provider} / {schema.llm_model}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Fields</dt>
                <dd className="text-sm font-medium">
                  {schema.field_count} top-level fields
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Created</dt>
                <dd className="text-sm font-medium">
                  {new Date(schema.created_at).toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>

          {/* Field Tree */}
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h2 className="text-lg font-semibold">Schema Fields</h2>
            <div className="space-y-1">
              {schema.schema_definition?.fields?.length > 0 ? (
                <FieldTree fields={schema.schema_definition.fields} depth={0} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No fields defined.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Recent Jobs */}
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold">Processing History</h2>
          </div>
          {jobs.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              No documents processed with this schema yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Document
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Retries
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-muted/30">
                      <td className="px-6 py-4 text-sm">
                        {job.document__title}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-6 py-4 text-sm">{job.retry_count}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {job.created_at
                          ? new Date(job.created_at).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function FieldTree({ fields, depth }: { fields: SchemaField[]; depth: number }) {
  return (
    <ul className={depth > 0 ? "ml-4 border-l pl-4" : ""}>
      {fields.map((field) => (
        <li key={field.id || field.name} className="py-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium">{field.name}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {field.type}
            </span>
            {field.required && (
              <span className="text-xs text-destructive">required</span>
            )}
          </div>
          {field.description && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {field.description}
            </p>
          )}
          {field.type === "object" && field.fields && (
            <FieldTree fields={field.fields} depth={depth + 1} />
          )}
          {field.type === "array" && field.items?.type === "object" && field.items.fields && (
            <div className="ml-4 border-l pl-4 mt-1">
              <span className="text-xs text-muted-foreground">
                Array items:
              </span>
              <FieldTree fields={field.items.fields} depth={depth + 1} />
            </div>
          )}
          {field.type === "array" && field.items?.type !== "object" && (
            <p className="text-xs text-muted-foreground ml-4">
              Items type: {field.items?.type || "string"}
            </p>
          )}
        </li>
      ))}
    </ul>
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
