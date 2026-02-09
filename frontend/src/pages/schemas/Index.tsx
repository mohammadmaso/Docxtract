import { Head, Link, router } from "@inertiajs/react";
import AppLayout from "@/layouts/AppLayout";
import type { ExtractionSchema } from "@/types";
import { Plus, Eye, Pencil, Trash2 } from "lucide-react";

interface Props {
  schemas: ExtractionSchema[];
}

export default function SchemaIndex({ schemas }: Props) {
  const handleDelete = (id: number, name: string) => {
    if (confirm(`Delete schema "${name}"? This cannot be undone.`)) {
      router.post(`/schemas/${id}/delete/`);
    }
  };

  return (
    <AppLayout>
      <Head title="Schemas" />

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Extraction Schemas</h1>
            <p className="text-muted-foreground">
              Define the structure of data you want to extract from documents.
            </p>
          </div>
          <Link
            href="/schemas/create/"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Schema
          </Link>
        </div>

        {schemas.length === 0 ? (
          <div className="rounded-lg border bg-card p-12 text-center">
            <p className="text-muted-foreground mb-4">
              No schemas defined yet. Create one to start extracting data.
            </p>
            <Link
              href="/schemas/create/"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
              Create Your First Schema
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Fields
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Model
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
                  {schemas.map((schema) => (
                    <tr key={schema.id} className="hover:bg-muted/30">
                      <td className="px-6 py-4 text-sm font-medium">
                        {schema.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground max-w-xs truncate">
                        {schema.description || "—"}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                          {schema.field_count} fields
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {schema.llm_provider}/{schema.llm_model}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {schema.created_at
                          ? new Date(schema.created_at).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/schemas/${schema.id}/`}
                            className="p-1.5 rounded hover:bg-accent"
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <Link
                            href={`/schemas/${schema.id}/edit/`}
                            className="p-1.5 rounded hover:bg-accent"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                          <button
                            onClick={() =>
                              handleDelete(schema.id, schema.name)
                            }
                            className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
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
