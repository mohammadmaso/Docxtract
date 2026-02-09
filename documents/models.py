from django.db import models
from django.contrib.postgres.indexes import GinIndex


class ExtractionSchema(models.Model):
    """
    User-defined schema that describes the structured output to extract.
    The schema_definition field stores the visual builder format:
    {
      "fields": [
        {
          "id": "uuid",
          "name": "field_name",
          "type": "string|number|integer|boolean|object|array",
          "description": "Helper text for AI",
          "required": true/false,
          "fields": [...],  // for object type
          "items": { "type": "string|object", "fields": [...] }  // for array type
        }
      ]
    }
    """

    LLM_PROVIDER_CHOICES = [
        ("openai", "OpenAI"),
        ("anthropic", "Anthropic"),
        ("google", "Google"),
    ]

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    schema_definition = models.JSONField(
        default=dict,
        help_text="Internal field definition format used by the visual builder.",
    )
    llm_provider = models.CharField(
        max_length=50, choices=LLM_PROVIDER_CHOICES, default="openai"
    )
    llm_model = models.CharField(max_length=100, default="gpt-4o")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Extraction Schema"
        verbose_name_plural = "Extraction Schemas"

    def __str__(self):
        return self.name

    @property
    def field_count(self):
        return len(self.schema_definition.get("fields", []))


class Document(models.Model):
    """
    Stores an uploaded document's raw text content and original file.
    """

    title = models.CharField(max_length=255)
    raw_text = models.TextField()
    original_file = models.FileField(
        upload_to="documents/%Y/%m/", blank=True, null=True
    )
    file_type = models.CharField(max_length=20, default="md")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class ProcessingJob(models.Model):
    """
    Tracks the processing of a document against a schema.
    Stores the extracted JSON result in a JSONB field.
    """

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("completed", "Completed"),
        ("failed", "Failed"),
        ("retrying", "Retrying"),
    ]

    document = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="jobs"
    )
    schema = models.ForeignKey(
        ExtractionSchema, on_delete=models.CASCADE, related_name="jobs"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    result_data = models.JSONField(null=True, blank=True)
    error_message = models.TextField(blank=True, default="")
    retry_count = models.IntegerField(default=0)
    max_retries = models.IntegerField(default=10)
    celery_task_id = models.CharField(max_length=255, blank=True, default="")
    # Chunking fields
    is_chunked = models.BooleanField(default=False)
    total_chunks = models.IntegerField(default=0)
    processed_chunks = models.IntegerField(default=0)
    chunk_results = models.JSONField(
        null=True,
        blank=True,
        help_text="Intermediate chunk results during chunked processing.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            GinIndex(fields=["result_data"], name="result_data_gin_idx"),
        ]

    def __str__(self):
        return f"Job #{self.pk}: {self.document.title} → {self.schema.name} [{self.status}]"


class SchemaSuggestion(models.Model):
    """
    Tracks an AI schema suggestion job for a document.
    The agent analyzes the document and proposes an ExtractionSchema.
    """

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]

    document = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="schema_suggestions"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    suggested_name = models.CharField(max_length=255, blank=True, default="")
    suggested_description = models.TextField(blank=True, default="")
    suggested_schema = models.JSONField(
        null=True,
        blank=True,
        help_text="Suggested schema definition in internal format.",
    )
    llm_provider = models.CharField(max_length=50, default="openai")
    llm_model = models.CharField(max_length=100, default="gpt-4o")
    error_message = models.TextField(blank=True, default="")
    celery_task_id = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Suggestion #{self.pk}: {self.document.title} [{self.status}]"
