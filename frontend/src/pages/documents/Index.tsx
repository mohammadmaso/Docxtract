import { Head, Link, router } from "@inertiajs/react";
import AppLayout from "@/layouts/AppLayout";
import type { Document } from "@/types";
import { Upload, Eye, Trash2 } from "lucide-react";

interface Props {
  documents: Document[];
}

export default function DocumentIndex({ documents }: Props) {
  const handleDelete = (id: number, title: string) => {
    if (confirm(`Delete document "${title}" and all its processing jobs?`)) {
      router.post(`/documents/${id}/delete/`);
    }
  };

  return (
    <AppLayout>
      <Head title="Documents" />

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Documents</h1>
            <p className="text-muted-foreground">
              Uploaded documents and their processing status.
            </p>
          </div>
          <Link
            href="/documents/upload/"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Upload className="h-4 w-4" />
            Upload Documents
          </Link>
        </div>

        {documents.length === 0 ? (
          <div className="rounded-lg border bg-card p-12 text-center">
            <p className="text-muted-foreground mb-4">
              No documents uploaded yet.
            </p>
            <Link
              href="/documents/upload/"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              <Upload className="h-4 w-4" />
              Upload Your First Document
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Title
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Latest Job
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Created
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-muted/30">
                      <td className="px-6 py-4 text-sm font-medium">
                        {doc.title}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                          .{doc.file_type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {doc.latest_job ? (
                          <div className="flex items-center gap-2">
                            <StatusBadge status={doc.latest_job.status} />
                            <span className="text-xs text-muted-foreground">
                              {doc.latest_job.schema__name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            No jobs
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {doc.created_at
                          ? new Date(doc.created_at).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/documents/${doc.id}/`}
                            className="p-1.5 rounded hover:bg-accent"
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <button
                            onClick={() => handleDelete(doc.id, doc.title)}
                            className="p-1.5 rounded text-destructive hover:bg-destructive/10"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
