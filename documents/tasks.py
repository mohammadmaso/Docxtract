"""
Celery tasks for document processing with retry and rate-limit handling.
Includes: chunked processing for long documents and schema suggestion.
"""

import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=10)
def process_document_task(self, job_id: int) -> dict:
    """
    Process a single document against its schema using Pydantic AI.
    Automatically uses chunked processing for large documents.
    Retries with exponential backoff on failure (rate limits, transient errors).
    """
    from .models import ProcessingJob
    from .services import (
        process_document_with_ai,
        process_document_chunked,
        should_chunk,
    )

    try:
        job = ProcessingJob.objects.select_related("document", "schema").get(id=job_id)
    except ProcessingJob.DoesNotExist:
        logger.error("ProcessingJob %d does not exist.", job_id)
        return {"status": "error", "message": f"Job {job_id} not found"}

    job.status = "processing"
    job.celery_task_id = self.request.id or ""
    job.save(update_fields=["status", "celery_task_id", "updated_at"])

    document_text = job.document.raw_text
    use_chunking = should_chunk(document_text)

    try:
        if use_chunking:
            # Chunked processing for long documents
            from .services import chunk_document

            chunks = chunk_document(document_text)
            job.is_chunked = True
            job.total_chunks = len(chunks)
            job.processed_chunks = 0
            job.save(update_fields=["is_chunked", "total_chunks", "processed_chunks", "updated_at"])

            def on_chunk_complete(chunk_idx, total, accumulated):
                """Update progress after each chunk."""
                job.processed_chunks = chunk_idx + 1
                job.chunk_results = accumulated
                job.save(update_fields=["processed_chunks", "chunk_results", "updated_at"])

            result = process_document_chunked(
                document_text=document_text,
                schema_name=job.schema.name,
                schema_description=job.schema.description,
                schema_definition=job.schema.schema_definition,
                llm_provider=job.schema.llm_provider,
                llm_model=job.schema.llm_model,
                on_chunk_complete=on_chunk_complete,
            )
        else:
            # Normal single-pass processing
            result = process_document_with_ai(
                document_text=document_text,
                schema_name=job.schema.name,
                schema_description=job.schema.description,
                schema_definition=job.schema.schema_definition,
                llm_provider=job.schema.llm_provider,
                llm_model=job.schema.llm_model,
            )

        job.result_data = result
        job.status = "completed"
        job.error_message = ""
        job.completed_at = timezone.now()
        job.save(
            update_fields=[
                "result_data",
                "status",
                "error_message",
                "completed_at",
                "updated_at",
            ]
        )

        logger.info(
            "Job %d completed successfully%s.",
            job_id,
            f" (chunked: {job.total_chunks} chunks)" if use_chunking else "",
        )
        return {"status": "completed", "job_id": job_id}

    except Exception as exc:
        job.retry_count = self.request.retries + 1
        job.error_message = str(exc)

        if self.request.retries < self.max_retries:
            job.status = "retrying"
            job.save(
                update_fields=[
                    "retry_count",
                    "error_message",
                    "status",
                    "updated_at",
                ]
            )
            logger.warning(
                "Job %d failed (attempt %d/%d): %s — retrying...",
                job_id,
                self.request.retries + 1,
                self.max_retries,
                exc,
            )
            # Exponential backoff: 30s, 60s, 120s, ... up to 10 minutes
            countdown = min(2**self.request.retries * 30, 600)
            raise self.retry(exc=exc, countdown=countdown)
        else:
            job.status = "failed"
            job.save(
                update_fields=[
                    "retry_count",
                    "error_message",
                    "status",
                    "updated_at",
                ]
            )
            logger.error(
                "Job %d failed permanently after %d retries: %s",
                job_id,
                self.max_retries,
                exc,
            )
            return {"status": "failed", "job_id": job_id, "error": str(exc)}


@shared_task(bind=True, max_retries=3)
def suggest_schema_task(self, suggestion_id: int) -> dict:
    """
    AI agent analyzes a document and suggests an extraction schema.
    """
    from .models import SchemaSuggestion
    from .services import suggest_schema_for_document

    try:
        suggestion = SchemaSuggestion.objects.select_related("document").get(
            id=suggestion_id
        )
    except SchemaSuggestion.DoesNotExist:
        logger.error("SchemaSuggestion %d does not exist.", suggestion_id)
        return {"status": "error", "message": f"Suggestion {suggestion_id} not found"}

    suggestion.status = "processing"
    suggestion.celery_task_id = self.request.id or ""
    suggestion.save(update_fields=["status", "celery_task_id"])

    try:
        result = suggest_schema_for_document(
            document_text=suggestion.document.raw_text,
            llm_provider=suggestion.llm_provider,
            llm_model=suggestion.llm_model,
        )

        suggestion.suggested_name = result["name"]
        suggestion.suggested_description = result["description"]
        suggestion.suggested_schema = result["schema_definition"]
        suggestion.status = "completed"
        suggestion.error_message = ""
        suggestion.completed_at = timezone.now()
        suggestion.save(
            update_fields=[
                "suggested_name",
                "suggested_description",
                "suggested_schema",
                "status",
                "error_message",
                "completed_at",
            ]
        )

        logger.info("Schema suggestion %d completed.", suggestion_id)
        return {"status": "completed", "suggestion_id": suggestion_id}

    except Exception as exc:
        if self.request.retries < self.max_retries:
            suggestion.status = "processing"
            suggestion.error_message = str(exc)
            suggestion.save(update_fields=["status", "error_message"])
            countdown = min(2**self.request.retries * 30, 300)
            raise self.retry(exc=exc, countdown=countdown)
        else:
            suggestion.status = "failed"
            suggestion.error_message = str(exc)
            suggestion.save(update_fields=["status", "error_message"])
            logger.error(
                "Schema suggestion %d failed: %s", suggestion_id, exc
            )
            return {
                "status": "failed",
                "suggestion_id": suggestion_id,
                "error": str(exc),
            }


@shared_task
def process_batch_task(job_ids: list[int]) -> dict:
    """
    Dispatch a batch of document processing tasks.
    Each job is processed independently — failures don't affect others.
    """
    for job_id in job_ids:
        process_document_task.delay(job_id)

    logger.info("Dispatched %d processing tasks.", len(job_ids))
    return {"status": "dispatched", "count": len(job_ids), "job_ids": job_ids}
