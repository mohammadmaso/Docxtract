import { Head, Link, router } from "@inertiajs/react";
import { useEffect } from "react";
import AppLayout from "@/layouts/AppLayout";
import type { ProcessingJob } from "@/types";
import { RefreshCw, Eye, FileJson, FileSpreadsheet } from "lucide-react";

interface Props {
  jobs: ProcessingJob[];
  hasActiveJobs: boolean;
}

export default function JobIndex({ jobs, hasActiveJobs }: Props) {
  // Auto-refresh when there are active jobs
  useEffect(() => {
    if (!hasActiveJobs) return;
    const interval = setInterval(() => {
      router.reload({ only: ["jobs", "hasActiveJobs"] });
    }, 3000);
    return () => clearInterval(interval);
  }, [hasActiveJobs]);

  const handleRetry = (jobId: number) => {
    router.post(`/jobs/${jobId}/retry/`);
  };

  return (
    <AppLayout>
      <Head title="Processing Jobs" />

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Processing Jobs</h1>
            <p className="text-muted-foreground">
              Monitor document processing status and results.
              {hasActiveJobs && (
                <span className="ml-2 text-blue-600 animate-pulse">
                  ● Auto-refreshing...
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => router.reload()}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="rounded-lg border bg-card p-12 text-center">
            <p className="text-muted-foreground mb-4">
              No processing jobs yet.
            </p>
            <Link
              href="/documents/upload/"
              className="text-primary underline text-sm"
            >
              Upload documents to start processing
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Document
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Schema
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Retries
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Time
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-muted/30">
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {job.id}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <Link
                          href={`/documents/${job.document__id}/`}
                          className="hover:underline text-primary"
                        >
                          {job.document__title}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {job.schema__name}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={job.status} />
                        {/* Chunk progress */}
                        {job.is_chunked &&
                          job.total_chunks &&
                          job.total_chunks > 0 &&
                          job.status !== "completed" &&
                          job.status !== "failed" && (
                            <div className="mt-1.5 space-y-1">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span>
                                  Chunk {job.processed_chunks || 0}/
                                  {job.total_chunks}
                                </span>
                              </div>
                              <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full transition-all"
                                  style={{
                                    width: `${
                                      ((job.processed_chunks || 0) /
                                        job.total_chunks) *
                                      100
                                    }%`,
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        {job.is_chunked && job.status === "completed" && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({job.total_chunks} chunks)
                          </span>
                        )}
                        {job.error_message && job.status === "failed" && (
                          <p
                            className="text-xs text-destructive mt-1 max-w-xs truncate"
                            title={job.error_message}
                          >
                            {job.error_message}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {job.retry_count > 0 ? job.retry_count : "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        <div>
                          {job.created_at
                            ? new Date(job.created_at).toLocaleString()
                            : "—"}
                        </div>
                        {job.completed_at && (
                          <div className="text-xs text-green-600">
                            Done:{" "}
                            {new Date(job.completed_at).toLocaleTimeString()}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {job.document__id && (
                            <Link
                              href={`/documents/${job.document__id}/`}
                              className="p-1.5 rounded hover:bg-accent"
                              title="View document"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                          )}
                          {job.status === "completed" && (
                            <>
                              <a
                                href={`/jobs/${job.id}/export/json/`}
                                className="p-1.5 rounded hover:bg-accent"
                                title="Download JSON"
                              >
                                <FileJson className="h-4 w-4" />
                              </a>
                              <a
                                href={`/jobs/${job.id}/export/csv/`}
                                className="p-1.5 rounded hover:bg-accent"
                                title="Download CSV"
                              >
                                <FileSpreadsheet className="h-4 w-4" />
                              </a>
                            </>
                          )}
                          {job.status === "failed" && (
                            <button
                              onClick={() => handleRetry(job.id)}
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                            >
                              <RefreshCw className="h-3 w-3" />
                              Retry
                            </button>
                          )}
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
