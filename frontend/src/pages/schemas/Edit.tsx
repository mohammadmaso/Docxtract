import { Head, router } from "@inertiajs/react";
import { useState } from "react";
import AppLayout from "@/layouts/AppLayout";
import SchemaBuilder from "@/components/schema-builder/SchemaBuilder";
import type {
  ExtractionSchema,
  SchemaField,
  SchemaDefinition,
  LLMProvider,
  PageProps,
} from "@/types";

interface Props extends PageProps {
  schema: ExtractionSchema;
  providers: LLMProvider[];
}

export default function SchemaEdit({ schema, providers, errors }: Props) {
  const [name, setName] = useState(schema.name);
  const [description, setDescription] = useState(schema.description);
  const [llmProvider, setLlmProvider] = useState(schema.llm_provider);
  const [llmModel, setLlmModel] = useState(schema.llm_model);
  const [fields, setFields] = useState<SchemaField[]>(
    schema.schema_definition?.fields || []
  );
  const [submitting, setSubmitting] = useState(false);

  const currentProvider = providers.find((p) => p.value === llmProvider);

  const handleProviderChange = (value: string) => {
    setLlmProvider(value);
    const provider = providers.find((p) => p.value === value);
    if (provider?.models.length) {
      setLlmModel(provider.models[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const schemaDefinition: SchemaDefinition = { fields };

    router.post(
      `/schemas/${schema.id}/edit/`,
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
      <Head title={`Edit: ${schema.name}`} />

      <div className="max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Edit Schema</h1>
          <p className="text-muted-foreground">
            Update the extraction schema "{schema.name}".
          </p>
        </div>

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
              {submitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
