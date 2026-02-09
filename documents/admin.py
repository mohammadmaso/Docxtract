from django.contrib import admin
from .models import ExtractionSchema, Document, ProcessingJob, SchemaSuggestion


@admin.register(ExtractionSchema)
class ExtractionSchemaAdmin(admin.ModelAdmin):
    list_display = ("name", "llm_provider", "llm_model", "field_count", "created_at")
    list_filter = ("llm_provider",)
    search_fields = ("name", "description")
    readonly_fields = ("created_at", "updated_at")


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("title", "file_type", "created_at")
    list_filter = ("file_type",)
    search_fields = ("title",)
    readonly_fields = ("created_at",)


@admin.register(ProcessingJob)
class ProcessingJobAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "document",
        "schema",
        "status",
        "retry_count",
        "created_at",
        "completed_at",
    )
    list_filter = ("status", "schema")
    search_fields = ("document__title", "schema__name")
    readonly_fields = ("created_at", "updated_at", "completed_at")


@admin.register(SchemaSuggestion)
class SchemaSuggestionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "document",
        "status",
        "suggested_name",
        "llm_provider",
        "llm_model",
        "created_at",
        "completed_at",
    )
    list_filter = ("status", "llm_provider")
    search_fields = ("document__title", "suggested_name")
    readonly_fields = ("created_at", "completed_at")
