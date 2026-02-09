"""
Inertia views for the document processing application.
"""

import json

from django.http import HttpResponse, JsonResponse
from django.shortcuts import redirect, get_object_or_404
from django.views.decorators.http import require_POST
from inertia import render as inertia_render

from .models import ExtractionSchema, Document, ProcessingJob, SchemaSuggestion
from .services import export_result_as_csv, get_available_providers, get_schema_presets
from .tasks import process_document_task, process_batch_task, suggest_schema_task


# ──────────────────────────────── Dashboard ────────────────────────────────


def dashboard(request):
    schemas_count = ExtractionSchema.objects.count()
    documents_count = Document.objects.count()
    jobs_total = ProcessingJob.objects.count()
    jobs_completed = ProcessingJob.objects.filter(status="completed").count()
    jobs_failed = ProcessingJob.objects.filter(status="failed").count()
    jobs_pending = ProcessingJob.objects.filter(
        status__in=["pending", "processing", "retrying"]
    ).count()

    recent_jobs = list(
        ProcessingJob.objects.select_related("document", "schema")
        .order_by("-created_at")[:10]
        .values(
            "id",
            "document__title",
            "schema__name",
            "status",
            "retry_count",
            "created_at",
            "completed_at",
        )
    )
    # Serialize datetimes
    for job in recent_jobs:
        job["created_at"] = job["created_at"].isoformat() if job["created_at"] else None
        job["completed_at"] = (
            job["completed_at"].isoformat() if job["completed_at"] else None
        )

    return inertia_render(
        request,
        "Dashboard",
        props={
            "stats": {
                "schemas": schemas_count,
                "documents": documents_count,
                "jobsTotal": jobs_total,
                "jobsCompleted": jobs_completed,
                "jobsFailed": jobs_failed,
                "jobsPending": jobs_pending,
            },
            "recentJobs": recent_jobs,
        },
    )


# ──────────────────────────────── Schemas ──────────────────────────────────


def schema_index(request):
    schemas = list(
        ExtractionSchema.objects.values(
            "id", "name", "description", "llm_provider", "llm_model", "created_at"
        )
    )
    for s in schemas:
        s["created_at"] = s["created_at"].isoformat() if s["created_at"] else None
        # Get field count
        obj = ExtractionSchema.objects.get(id=s["id"])
        s["field_count"] = obj.field_count

    return inertia_render(request, "schemas/Index", props={"schemas": schemas})


def schema_create(request):
    if request.method == "POST":
        data = json.loads(request.body) if request.content_type == "application/json" else request.POST
        errors = {}

        name = data.get("name", "").strip()
        if not name:
            errors["name"] = "Name is required."

        schema_definition = data.get("schema_definition", {})
        if isinstance(schema_definition, str):
            try:
                schema_definition = json.loads(schema_definition)
            except json.JSONDecodeError:
                errors["schema_definition"] = "Invalid JSON."

        if not schema_definition.get("fields"):
            errors["schema_definition"] = "At least one field is required."

        if errors:
            return inertia_render(
                request,
                "schemas/Create",
                props={
                    "errors": errors,
                    "providers": get_available_providers(),
                    "presets": get_schema_presets(),
                },
            )

        ExtractionSchema.objects.create(
            name=name,
            description=data.get("description", ""),
            schema_definition=schema_definition,
            llm_provider=data.get("llm_provider", "openai"),
            llm_model=data.get("llm_model", "gpt-4o"),
        )
        return redirect("/schemas/")

    return inertia_render(
        request,
        "schemas/Create",
        props={
            "providers": get_available_providers(),
            "presets": get_schema_presets(),
        },
    )


def schema_show(request, schema_id):
    schema = get_object_or_404(ExtractionSchema, id=schema_id)
    jobs = list(
        schema.jobs.select_related("document")
        .order_by("-created_at")[:20]
        .values(
            "id",
            "document__title",
            "status",
            "retry_count",
            "created_at",
            "completed_at",
        )
    )
    for j in jobs:
        j["created_at"] = j["created_at"].isoformat() if j["created_at"] else None
        j["completed_at"] = j["completed_at"].isoformat() if j["completed_at"] else None

    return inertia_render(
        request,
        "schemas/Show",
        props={
            "schema": {
                "id": schema.id,
                "name": schema.name,
                "description": schema.description,
                "schema_definition": schema.schema_definition,
                "llm_provider": schema.llm_provider,
                "llm_model": schema.llm_model,
                "field_count": schema.field_count,
                "created_at": schema.created_at.isoformat(),
                "updated_at": schema.updated_at.isoformat(),
            },
            "jobs": jobs,
        },
    )


def schema_edit(request, schema_id):
    schema = get_object_or_404(ExtractionSchema, id=schema_id)

    if request.method == "POST":
        data = json.loads(request.body) if request.content_type == "application/json" else request.POST
        errors = {}

        name = data.get("name", "").strip()
        if not name:
            errors["name"] = "Name is required."

        schema_definition = data.get("schema_definition", {})
        if isinstance(schema_definition, str):
            try:
                schema_definition = json.loads(schema_definition)
            except json.JSONDecodeError:
                errors["schema_definition"] = "Invalid JSON."

        if not schema_definition.get("fields"):
            errors["schema_definition"] = "At least one field is required."

        if errors:
            return inertia_render(
                request,
                "schemas/Edit",
                props={
                    "schema": {
                        "id": schema.id,
                        "name": schema.name,
                        "description": schema.description,
                        "schema_definition": schema.schema_definition,
                        "llm_provider": schema.llm_provider,
                        "llm_model": schema.llm_model,
                    },
                    "errors": errors,
                    "providers": get_available_providers(),
                },
            )

        schema.name = name
        schema.description = data.get("description", "")
        schema.schema_definition = schema_definition
        schema.llm_provider = data.get("llm_provider", schema.llm_provider)
        schema.llm_model = data.get("llm_model", schema.llm_model)
        schema.save()
        return redirect(f"/schemas/{schema.id}/")

    return inertia_render(
        request,
        "schemas/Edit",
        props={
            "schema": {
                "id": schema.id,
                "name": schema.name,
                "description": schema.description,
                "schema_definition": schema.schema_definition,
                "llm_provider": schema.llm_provider,
                "llm_model": schema.llm_model,
            },
            "providers": get_available_providers(),
        },
    )


@require_POST
def schema_delete(request, schema_id):
    schema = get_object_or_404(ExtractionSchema, id=schema_id)
    schema.delete()
    return redirect("/schemas/")


# ──────────────────────────────── Documents ────────────────────────────────


def document_index(request):
    documents = list(
        Document.objects.values("id", "title", "file_type", "created_at")
    )
    for d in documents:
        d["created_at"] = d["created_at"].isoformat() if d["created_at"] else None
        # Latest job info
        latest_job = (
            ProcessingJob.objects.filter(document_id=d["id"])
            .order_by("-created_at")
            .values("status", "schema__name")
            .first()
        )
        d["latest_job"] = latest_job

    return inertia_render(
        request, "documents/Index", props={"documents": documents}
    )


def document_upload(request):
    if request.method == "POST":
        schema_id = request.POST.get("schema_id")
        if not schema_id:
            return inertia_render(
                request,
                "documents/Upload",
                props={
                    "schemas": list(
                        ExtractionSchema.objects.values("id", "name")
                    ),
                    "errors": {"schema_id": "Please select a schema."},
                },
            )

        schema = get_object_or_404(ExtractionSchema, id=schema_id)
        files = request.FILES.getlist("files")

        if not files:
            return inertia_render(
                request,
                "documents/Upload",
                props={
                    "schemas": list(
                        ExtractionSchema.objects.values("id", "name")
                    ),
                    "errors": {"files": "Please upload at least one file."},
                },
            )

        job_ids = []
        for f in files:
            content = f.read().decode("utf-8", errors="replace")
            ext = f.name.rsplit(".", 1)[-1].lower() if "." in f.name else "txt"

            doc = Document.objects.create(
                title=f.name,
                raw_text=content,
                original_file=f,
                file_type=ext,
            )
            job = ProcessingJob.objects.create(
                document=doc,
                schema=schema,
                status="pending",
            )
            job_ids.append(job.id)

        # Dispatch batch processing
        process_batch_task.delay(job_ids)
        return redirect("/jobs/")

    schemas = list(ExtractionSchema.objects.values("id", "name"))
    return inertia_render(
        request,
        "documents/Upload",
        props={"schemas": schemas},
    )


def document_show(request, document_id):
    document = get_object_or_404(Document, id=document_id)
    jobs = list(
        document.jobs.select_related("schema")
        .order_by("-created_at")
        .values(
            "id",
            "schema__name",
            "schema__id",
            "status",
            "result_data",
            "error_message",
            "retry_count",
            "is_chunked",
            "total_chunks",
            "processed_chunks",
            "created_at",
            "completed_at",
        )
    )
    for j in jobs:
        j["created_at"] = j["created_at"].isoformat() if j["created_at"] else None
        j["completed_at"] = j["completed_at"].isoformat() if j["completed_at"] else None

    return inertia_render(
        request,
        "documents/Show",
        props={
            "document": {
                "id": document.id,
                "title": document.title,
                "raw_text": document.raw_text,
                "file_type": document.file_type,
                "created_at": document.created_at.isoformat(),
            },
            "jobs": jobs,
            "providers": get_available_providers(),
        },
    )


@require_POST
def document_delete(request, document_id):
    doc = get_object_or_404(Document, id=document_id)
    doc.delete()
    return redirect("/documents/")


# ──────────────────────────────── Jobs ─────────────────────────────────────


def job_index(request):
    jobs = list(
        ProcessingJob.objects.select_related("document", "schema")
        .order_by("-created_at")
        .values(
            "id",
            "document__id",
            "document__title",
            "schema__name",
            "status",
            "retry_count",
            "error_message",
            "is_chunked",
            "total_chunks",
            "processed_chunks",
            "created_at",
            "updated_at",
            "completed_at",
        )[:100]
    )
    for j in jobs:
        j["created_at"] = j["created_at"].isoformat() if j["created_at"] else None
        j["updated_at"] = j["updated_at"].isoformat() if j["updated_at"] else None
        j["completed_at"] = j["completed_at"].isoformat() if j["completed_at"] else None

    has_active = ProcessingJob.objects.filter(
        status__in=["pending", "processing", "retrying"]
    ).exists()

    return inertia_render(
        request,
        "jobs/Index",
        props={"jobs": jobs, "hasActiveJobs": has_active},
    )


@require_POST
def job_retry(request, job_id):
    job = get_object_or_404(ProcessingJob, id=job_id)
    job.status = "pending"
    job.error_message = ""
    job.retry_count = 0
    job.save(update_fields=["status", "error_message", "retry_count", "updated_at"])
    process_document_task.delay(job.id)
    return redirect("/jobs/")


# ──────────────────────────────── Export ────────────────────────────────────


def export_job_json(request, job_id):
    job = get_object_or_404(ProcessingJob, id=job_id, status="completed")
    response = HttpResponse(
        json.dumps(job.result_data, indent=2, ensure_ascii=False),
        content_type="application/json",
    )
    safe_title = job.document.title.replace(" ", "_")
    response["Content-Disposition"] = f'attachment; filename="{safe_title}_result.json"'
    return response


def export_job_csv(request, job_id):
    job = get_object_or_404(ProcessingJob, id=job_id, status="completed")
    csv_content = export_result_as_csv(job.result_data)
    response = HttpResponse(csv_content, content_type="text/csv")
    safe_title = job.document.title.replace(" ", "_")
    response["Content-Disposition"] = f'attachment; filename="{safe_title}_result.csv"'
    return response


def export_document_text(request, document_id):
    document = get_object_or_404(Document, id=document_id)
    response = HttpResponse(document.raw_text, content_type="text/plain; charset=utf-8")
    safe_title = document.title.replace(" ", "_")
    response["Content-Disposition"] = f'attachment; filename="{safe_title}.txt"'
    return response


# ──────────────────────────────── API (polling) ────────────────────────────


def api_job_status(request, job_id):
    """Simple JSON endpoint for polling job status from the frontend."""
    job = get_object_or_404(ProcessingJob, id=job_id)
    return JsonResponse(
        {
            "id": job.id,
            "status": job.status,
            "retry_count": job.retry_count,
            "error_message": job.error_message,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
            "has_result": job.result_data is not None,
            # Chunk progress
            "is_chunked": job.is_chunked,
            "total_chunks": job.total_chunks,
            "processed_chunks": job.processed_chunks,
        }
    )


# ──────────────────────────── Schema Suggestion ────────────────────────────


@require_POST
def api_suggest_schema(request, document_id):
    """
    Trigger AI schema suggestion for a document.
    Accepts JSON body with optional llm_provider and llm_model.
    Returns the suggestion ID for polling.
    """
    document = get_object_or_404(Document, id=document_id)

    data = json.loads(request.body) if request.content_type == "application/json" else request.POST
    providers = get_available_providers()
    default_provider = providers[0]["value"] if providers else "openai"
    default_model = providers[0]["models"][0] if providers else "gpt-4o"

    suggestion = SchemaSuggestion.objects.create(
        document=document,
        llm_provider=data.get("llm_provider", default_provider),
        llm_model=data.get("llm_model", default_model),
        status="pending",
    )

    suggest_schema_task.delay(suggestion.id)

    return JsonResponse(
        {
            "suggestion_id": suggestion.id,
            "status": "pending",
        }
    )


def api_suggestion_status(request, suggestion_id):
    """Poll schema suggestion status and get the result when complete."""
    suggestion = get_object_or_404(SchemaSuggestion, id=suggestion_id)

    response_data = {
        "id": suggestion.id,
        "status": suggestion.status,
        "error_message": suggestion.error_message,
        "completed_at": (
            suggestion.completed_at.isoformat() if suggestion.completed_at else None
        ),
    }

    if suggestion.status == "completed":
        response_data.update(
            {
                "suggested_name": suggestion.suggested_name,
                "suggested_description": suggestion.suggested_description,
                "suggested_schema": suggestion.suggested_schema,
            }
        )

    return JsonResponse(response_data)


def schema_create_from_suggestion(request, suggestion_id):
    """
    Pre-populate schema creation form with an AI suggestion.
    User can review, edit, and save.
    """
    suggestion = get_object_or_404(
        SchemaSuggestion, id=suggestion_id, status="completed"
    )

    return inertia_render(
        request,
        "schemas/Create",
        props={
            "providers": get_available_providers(),
            "presets": get_schema_presets(),
            "suggestion": {
                "name": suggestion.suggested_name,
                "description": suggestion.suggested_description,
                "schema_definition": suggestion.suggested_schema,
                "document_id": suggestion.document_id,
                "document_title": suggestion.document.title,
            },
        },
    )


@require_POST
def api_approve_suggestion(request, suggestion_id):
    """
    Approve an AI-suggested schema: save it as a real ExtractionSchema
    and immediately start processing the associated document.

    Returns the new schema id and job id.
    """
    suggestion = get_object_or_404(
        SchemaSuggestion, id=suggestion_id, status="completed"
    )

    data = (
        json.loads(request.body)
        if request.content_type == "application/json"
        else {}
    )

    # Allow the user to override name/description from the frontend
    schema_name = data.get("name", suggestion.suggested_name) or suggestion.suggested_name
    schema_desc = data.get("description", suggestion.suggested_description) or ""
    schema_def = data.get("schema_definition", suggestion.suggested_schema)

    schema = ExtractionSchema.objects.create(
        name=schema_name,
        description=schema_desc,
        schema_definition=schema_def,
        llm_provider=suggestion.llm_provider,
        llm_model=suggestion.llm_model,
    )

    job = ProcessingJob.objects.create(
        document=suggestion.document,
        schema=schema,
        status="pending",
    )

    process_document_task.delay(job.id)

    return JsonResponse(
        {
            "schema_id": schema.id,
            "job_id": job.id,
            "status": "started",
        }
    )


@require_POST
def api_upload_and_suggest(request):
    """
    Upload a document file and trigger AI schema suggestion in one step.
    Used from the Schema Create page where user doesn't have an existing document.

    Accepts multipart form data with:
      - file: the document file
      - llm_provider: (optional)
      - llm_model: (optional)

    Returns suggestion_id for polling.
    """
    uploaded_file = request.FILES.get("file")
    if not uploaded_file:
        return JsonResponse({"error": "No file provided."}, status=400)

    content = uploaded_file.read().decode("utf-8", errors="replace")
    if not content.strip():
        return JsonResponse({"error": "File is empty."}, status=400)

    ext = (
        uploaded_file.name.rsplit(".", 1)[-1].lower()
        if "." in uploaded_file.name
        else "txt"
    )

    # Save the document
    uploaded_file.seek(0)
    doc = Document.objects.create(
        title=uploaded_file.name,
        raw_text=content,
        original_file=uploaded_file,
        file_type=ext,
    )

    providers = get_available_providers()
    default_provider = providers[0]["value"] if providers else "openai"
    default_model = providers[0]["models"][0] if providers else "gpt-4o"

    suggestion = SchemaSuggestion.objects.create(
        document=doc,
        llm_provider=request.POST.get("llm_provider", default_provider),
        llm_model=request.POST.get("llm_model", default_model),
        status="pending",
    )

    suggest_schema_task.delay(suggestion.id)

    return JsonResponse(
        {
            "suggestion_id": suggestion.id,
            "document_id": doc.id,
            "status": "pending",
        }
    )
