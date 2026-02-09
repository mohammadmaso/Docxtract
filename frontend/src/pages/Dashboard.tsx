import { Head, Link } from "@inertiajs/react";
import AppLayout from "@/layouts/AppLayout";
import type { DashboardStats, ProcessingJob } from "@/types";
import {
  Database,
  FileText,
  ListTodo,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";

interface Props {
  stats: DashboardStats;
  recentJobs: ProcessingJob[];
}

export default function Dashboard({ stats, recentJobs }: Props) {
  const statCards = [
    {
      label: "Schemas",
      value: stats.schemas,
      icon: Database,
      href: "/schemas/",
      color: "text-blue-600",
    },
    {
      label: "Documents",
      value: stats.documents,
      icon: FileText,
      href: "/documents/",
      color: "text-green-600",
    },
    {
      label: "Completed",
      value: stats.jobsCompleted,
      icon: CheckCircle,
      href: "/jobs/",
      color: "text-emerald-600",
    },
    {
      label: "Pending",
      value: stats.jobsPending,
      icon: Clock,
      href: "/jobs/",
      color: "text-yellow-600",
    },
    {
      label: "Failed",
      value: stats.jobsFailed,
      icon: XCircle,
      href: "/jobs/",
      color: "text-red-600",
    },
    {
      label: "Total Jobs",
      value: stats.jobsTotal,
      icon: ListTodo,
      href: "/jobs/",
      color: "text-purple-600",
    },
  ];

  return (
    <AppLayout>
      <Head title="Dashboard" />

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your document processing pipeline.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {statCards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="rounded-lg border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-3xl font-bold mt-1">{card.value}</p>
                </div>
                <card.icon className={`h-8 w-8 ${card.color}`} />
              </div>
            </Link>
          ))}
        </div>

        {/* Recent Jobs */}
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold">Recent Jobs</h2>
          </div>
          {recentJobs.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              No processing jobs yet.{" "}
              <Link
                href="/documents/upload/"
                className="text-primary underline"
              >
                Upload documents
              </Link>{" "}
              to get started.
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
                      Schema
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-muted/30">
                      <td className="px-6 py-4 text-sm">
                        {job.document__title}
                      </td>
                      <td className="px-6 py-4 text-sm">{job.schema__name}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={job.status} />
                      </td>
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
