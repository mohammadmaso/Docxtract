from django.urls import path
from . import views

urlpatterns = [
    # Dashboard
    path("", views.dashboard, name="dashboard"),
    # Schemas
    path("schemas/", views.schema_index, name="schema-index"),
    path("schemas/create/", views.schema_create, name="schema-create"),
    path("schemas/<int:schema_id>/", views.schema_show, name="schema-show"),
    path("schemas/<int:schema_id>/edit/", views.schema_edit, name="schema-edit"),
    path("schemas/<int:schema_id>/delete/", views.schema_delete, name="schema-delete"),
    # Documents
    path("documents/", views.document_index, name="document-index"),
    path("documents/upload/", views.document_upload, name="document-upload"),
    path("documents/<int:document_id>/", views.document_show, name="document-show"),
    path(
        "documents/<int:document_id>/delete/",
        views.document_delete,
        name="document-delete",
    ),
    path(
        "documents/<int:document_id>/export/text/",
        views.export_document_text,
        name="export-document-text",
    ),
    # Jobs
    path("jobs/", views.job_index, name="job-index"),
    path("jobs/<int:job_id>/retry/", views.job_retry, name="job-retry"),
    path("jobs/<int:job_id>/export/json/", views.export_job_json, name="export-job-json"),
    path("jobs/<int:job_id>/export/csv/", views.export_job_csv, name="export-job-csv"),
    # Schema Suggestion
    path(
        "schemas/from-suggestion/<int:suggestion_id>/",
        views.schema_create_from_suggestion,
        name="schema-create-from-suggestion",
    ),
    # API
    path("api/jobs/<int:job_id>/status/", views.api_job_status, name="api-job-status"),
    path(
        "api/documents/<int:document_id>/suggest-schema/",
        views.api_suggest_schema,
        name="api-suggest-schema",
    ),
    path(
        "api/suggestions/<int:suggestion_id>/status/",
        views.api_suggestion_status,
        name="api-suggestion-status",
    ),
    path(
        "api/suggestions/<int:suggestion_id>/approve/",
        views.api_approve_suggestion,
        name="api-approve-suggestion",
    ),
    path(
        "api/upload-and-suggest/",
        views.api_upload_and_suggest,
        name="api-upload-and-suggest",
    ),
]
