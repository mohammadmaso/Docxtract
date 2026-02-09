"""
Pydantic AI service layer for document processing.
Converts user-defined schemas to JSON Schema and runs extraction.
Includes: schema suggestion agent, semantic chunking, iterative accumulation.
"""

import csv
import io
import json
import logging
import os
import re
from typing import Any

from pydantic_ai import Agent, StructuredDict

logger = logging.getLogger(__name__)

# ─── Chunking Configuration ───────────────────────────────────────────────

# Characters threshold — documents above this are chunked automatically.
# ~50K chars ≈ 12.5K tokens, leaving room for schema + accumulated result.
CHUNK_THRESHOLD = 50_000
# Target chunk size in characters.
CHUNK_SIZE = 40_000
# Overlap between chunks to avoid losing context at boundaries.
CHUNK_OVERLAP = 2_000


def schema_definition_to_json_schema(schema_definition: dict) -> dict:
    """
    Convert internal field-based schema definition to JSON Schema format.

    Internal format:
    {
      "fields": [
        {"name": "x", "type": "string", "description": "...", "required": true},
        {"name": "y", "type": "object", "description": "...", "fields": [...]},
        {"name": "z", "type": "array", "items": {"type": "object", "fields": [...]}}
      ]
    }

    Output: Standard JSON Schema object.
    """

    def _field_to_schema(field: dict) -> dict:
        field_type = field.get("type", "string")
        schema: dict[str, Any] = {}

        if field_type in ("string", "number", "integer", "boolean"):
            schema["type"] = field_type

        elif field_type == "object":
            schema["type"] = "object"
            properties = {}
            required = []
            for sub_field in field.get("fields", []):
                properties[sub_field["name"]] = _field_to_schema(sub_field)
                if sub_field.get("required"):
                    required.append(sub_field["name"])
            schema["properties"] = properties
            if required:
                schema["required"] = required

        elif field_type == "array":
            schema["type"] = "array"
            items_def = field.get("items", {"type": "string"})
            if items_def.get("type") == "object":
                items_schema: dict[str, Any] = {"type": "object", "properties": {}}
                items_required = []
                for sub_field in items_def.get("fields", []):
                    items_schema["properties"][sub_field["name"]] = _field_to_schema(
                        sub_field
                    )
                    if sub_field.get("required"):
                        items_required.append(sub_field["name"])
                if items_required:
                    items_schema["required"] = items_required
                schema["items"] = items_schema
            else:
                schema["items"] = {"type": items_def.get("type", "string")}

        if field.get("description"):
            schema["description"] = field["description"]

        return schema

    properties = {}
    required = []

    for field in schema_definition.get("fields", []):
        properties[field["name"]] = _field_to_schema(field)
        if field.get("required"):
            required.append(field["name"])

    json_schema: dict[str, Any] = {
        "type": "object",
        "properties": properties,
    }
    if required:
        json_schema["required"] = required

    return json_schema


def _set_api_key_env(provider: str) -> None:
    """Ensure the appropriate API key env var is set for the provider."""
    from django.conf import settings

    key_map = {
        "openai": ("OPENAI_API_KEY", settings.OPENAI_API_KEY),
        "anthropic": ("ANTHROPIC_API_KEY", settings.ANTHROPIC_API_KEY),
        "google": ("GOOGLE_API_KEY", settings.GOOGLE_API_KEY),
    }
    env_name, value = key_map.get(provider, ("", ""))
    if env_name and value:
        os.environ[env_name] = value

    # Set custom OpenAI base URL if configured (for OpenAI-compatible APIs)
    if provider == "openai" and getattr(settings, "OPENAI_BASE_URL", ""):
        os.environ["OPENAI_BASE_URL"] = settings.OPENAI_BASE_URL


def process_document_with_ai(
    document_text: str,
    schema_name: str,
    schema_description: str,
    schema_definition: dict,
    llm_provider: str,
    llm_model: str,
) -> dict:
    """
    Process a document using Pydantic AI to extract structured data.

    Returns the extracted data as a dict matching the schema.
    Raises on failure — caller (Celery task) handles retries.
    """
    _set_api_key_env(llm_provider)

    json_schema = schema_definition_to_json_schema(schema_definition)
    logger.info("Generated JSON Schema for '%s': %s", schema_name, json_schema)

    safe_name = schema_name.replace(" ", "_").replace("-", "_")

    output_type = StructuredDict(
        json_schema,
        name=safe_name,
        description=schema_description
        or f"Extract structured data using the '{schema_name}' schema.",
    )

    model_name = f"{llm_provider}:{llm_model}"

    agent = Agent(
        model_name,
        output_type=output_type,
        retries=3,
        system_prompt=(
            "You are a document data extraction specialist. "
            "Given a document, extract structured information strictly according to the provided schema. "
            "Use the field descriptions as guidance for what information to extract. "
            "Be thorough and accurate. If a field's data is not found in the document, use null. "
            "Return ONLY the structured data — no explanations."
        ),
    )

    result = agent.run_sync(document_text)
    return result.output


# ─── Semantic Chunking ────────────────────────────────────────────────────


def should_chunk(text: str, threshold: int = CHUNK_THRESHOLD) -> bool:
    """Return True if the document exceeds the chunking threshold."""
    return len(text) > threshold


def chunk_document(
    text: str,
    max_chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[str]:
    """
    Split document text into semantically meaningful chunks.

    Strategy:
    1. Split by double-newlines (paragraphs) or markdown headers.
    2. Accumulate paragraphs into chunks up to max_chunk_size.
    3. Add overlap from previous chunk's last paragraphs.

    Returns a list of text chunks.
    """
    # Split by double-newline or markdown header boundaries
    # We keep the header with the paragraph that follows it
    segments = re.split(r"(\n\s*\n)", text)

    # Rebuild paragraphs (keeping separators attached)
    paragraphs: list[str] = []
    current = ""
    for segment in segments:
        current += segment
        # A double-newline separator marks end of a paragraph
        if segment.strip() == "":
            if current.strip():
                paragraphs.append(current)
            current = ""
    if current.strip():
        paragraphs.append(current)

    if not paragraphs:
        # Fallback: split by fixed size if no paragraph boundaries
        return _fixed_size_chunk(text, max_chunk_size, overlap)

    chunks: list[str] = []
    current_chunk: list[str] = []
    current_size = 0

    for para in paragraphs:
        para_size = len(para)

        # If single paragraph exceeds max, split it by fixed size
        if para_size > max_chunk_size:
            # Flush what we have
            if current_chunk:
                chunks.append("".join(current_chunk))
                current_chunk = []
                current_size = 0
            # Split the big paragraph
            sub_chunks = _fixed_size_chunk(para, max_chunk_size, overlap)
            chunks.extend(sub_chunks)
            continue

        if current_size + para_size > max_chunk_size and current_chunk:
            # Finalize current chunk
            chunks.append("".join(current_chunk))
            # Start new chunk with overlap from end of previous
            overlap_text = "".join(current_chunk)[-overlap:] if overlap > 0 else ""
            current_chunk = [overlap_text, para] if overlap_text else [para]
            current_size = len(overlap_text) + para_size
        else:
            current_chunk.append(para)
            current_size += para_size

    # Don't forget the last chunk
    if current_chunk:
        chunks.append("".join(current_chunk))

    logger.info("Document split into %d chunks (sizes: %s)", len(chunks),
                [len(c) for c in chunks])
    return chunks


def _fixed_size_chunk(text: str, size: int, overlap: int) -> list[str]:
    """Fallback: split by fixed character size with overlap."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + size
        chunks.append(text[start:end])
        start = end - overlap if overlap > 0 else end
    return chunks


def process_document_chunked(
    document_text: str,
    schema_name: str,
    schema_description: str,
    schema_definition: dict,
    llm_provider: str,
    llm_model: str,
    on_chunk_complete: Any = None,
) -> dict:
    """
    Process a long document by chunking and iteratively accumulating results.

    For each chunk:
    1. Send the chunk + accumulated result so far to the LLM.
    2. The LLM returns an updated/extended structured result.
    3. The accumulated result is passed to the next chunk.

    Args:
        on_chunk_complete: Optional callback(chunk_index, total_chunks, accumulated_result)
                          for progress tracking.
    Returns:
        The final accumulated structured result.
    """
    _set_api_key_env(llm_provider)

    chunks = chunk_document(document_text)
    json_schema = schema_definition_to_json_schema(schema_definition)
    safe_name = schema_name.replace(" ", "_").replace("-", "_")
    model_name = f"{llm_provider}:{llm_model}"

    accumulated_result: dict | None = None

    for i, chunk in enumerate(chunks):
        logger.info("Processing chunk %d/%d (%d chars)", i + 1, len(chunks), len(chunk))

        if accumulated_result is None:
            # First chunk — extract from scratch
            system_prompt = (
                "You are a document data extraction specialist. "
                "You are processing a LONG document in multiple chunks. This is the FIRST chunk. "
                "Extract structured information strictly according to the provided schema. "
                "Use the field descriptions as guidance. "
                "If a field's data is not found yet, use null. "
                "For array fields, include all items found in this chunk. "
                "Return ONLY the structured data — no explanations."
            )
            user_message = chunk
        else:
            # Subsequent chunks — pass accumulated result + new chunk in the user message
            accumulated_json = json.dumps(accumulated_result, ensure_ascii=False, indent=2)
            system_prompt = (
                "You are a document data extraction specialist. "
                f"You are processing chunk {i + 1} of {len(chunks)} of a long document.\n\n"
                "CRITICAL RULES:\n"
                "- You will receive a PREVIOUS RESULT (JSON) and a NEW CHUNK of text.\n"
                "- The PREVIOUS RESULT contains ALL data extracted from earlier chunks. "
                "You MUST preserve every single value in it.\n"
                "- Read the NEW CHUNK and extract any additional information according to the schema.\n"
                "- MERGE the new data INTO the previous result:\n"
                "   * Array fields: APPEND new items to the existing array. NEVER remove existing items.\n"
                "   * Scalar fields (string, number, boolean): KEEP the existing value UNLESS it is null "
                "and the new chunk has a value, or the new chunk provides a clearly more complete value.\n"
                "   * Object fields: recursively merge sub-fields using the same rules.\n"
                "- The output MUST contain ALL data from the previous result PLUS any new data from this chunk.\n"
                "- If the new chunk has no relevant new data, return the previous result unchanged.\n"
                "- Return ONLY the structured JSON — no explanations."
            )
            user_message = (
                "=== PREVIOUS RESULT (preserve ALL of this data) ===\n"
                f"```json\n{accumulated_json}\n```\n\n"
                "=== NEW CHUNK (extract new data from this and merge) ===\n"
                f"{chunk}"
            )

        output_type = StructuredDict(
            json_schema,
            name=safe_name,
            description=schema_description
            or f"Extract structured data using the '{schema_name}' schema.",
        )

        agent = Agent(
            model_name,
            output_type=output_type,
            retries=3,
            system_prompt=system_prompt,
        )

        result = agent.run_sync(user_message)
        new_result = result.output

        if accumulated_result is not None:
            # Safety net: programmatic merge to guarantee no data is lost.
            # The LLM output should already be merged, but we enforce it.
            accumulated_result = _deep_merge(accumulated_result, new_result)
        else:
            accumulated_result = new_result

        logger.info(
            "Chunk %d/%d done. Accumulated keys: %s",
            i + 1,
            len(chunks),
            list(accumulated_result.keys()) if accumulated_result else "N/A",
        )

        if on_chunk_complete:
            on_chunk_complete(i, len(chunks), accumulated_result)

    return accumulated_result or {}


def _deep_merge(base: Any, update: Any) -> Any:
    """
    Deep-merge two extracted results.

    Rules:
    - Both dicts: recursively merge keys. For shared keys, merge values.
    - Both lists: concatenate, then deduplicate (keep order, remove exact dupes).
    - base is None / empty: use update.
    - update is None / empty: keep base.
    - Scalar conflict: prefer update only if base is None.
    """
    if base is None:
        return update
    if update is None:
        return base

    if isinstance(base, dict) and isinstance(update, dict):
        merged = dict(base)  # start with all base keys
        for key, update_val in update.items():
            if key in merged:
                merged[key] = _deep_merge(merged[key], update_val)
            else:
                merged[key] = update_val
        return merged

    if isinstance(base, list) and isinstance(update, list):
        # Append new items, deduplicate by JSON serialization
        seen = set()
        combined = []
        for item in base + update:
            # Use JSON for hashable comparison of dicts/lists
            try:
                key = json.dumps(item, sort_keys=True, ensure_ascii=False)
            except (TypeError, ValueError):
                key = str(item)
            if key not in seen:
                seen.add(key)
                combined.append(item)
        return combined

    # Scalars: keep base unless it's None/empty
    if base in (None, "", 0, False) and update not in (None, "", 0, False):
        return update
    return base


# ─── Schema Suggestion Agent ─────────────────────────────────────────────


def suggest_schema_for_document(
    document_text: str,
    llm_provider: str,
    llm_model: str,
) -> dict:
    """
    Analyze a document and suggest an ExtractionSchema for it.

    Sends a sample of the document to the LLM and asks it to propose
    field names, types, and descriptions.

    Returns a dict with:
      - name: suggested schema name
      - description: suggested schema description
      - schema_definition: {"fields": [...]} in internal format
    """
    _set_api_key_env(llm_provider)

    # Use a sample of the document to avoid huge prompts.
    # Take first 12000 chars + last 3000 chars for a balanced view.
    if len(document_text) > 16000:
        sample = (
            document_text[:12000]
            + "\n\n... [document truncated for analysis] ...\n\n"
            + document_text[-3000:]
        )
    else:
        sample = document_text

    model_name = f"{llm_provider}:{llm_model}"

    suggestion_schema = {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "A short, descriptive name for this schema (e.g., 'Invoice Extractor', 'Resume Parser').",
            },
            "description": {
                "type": "string",
                "description": "A brief description of what this schema extracts.",
            },
            "fields": {
                "type": "array",
                "description": "The list of fields to extract from documents like this.",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Field name in snake_case.",
                        },
                        "type": {
                            "type": "string",
                            "enum": [
                                "string",
                                "number",
                                "integer",
                                "boolean",
                                "object",
                                "array",
                            ],
                            "description": "Data type of the field.",
                        },
                        "description": {
                            "type": "string",
                            "description": "A brief description of what this field captures, used as guidance for the AI extractor.",
                        },
                        "required": {
                            "type": "boolean",
                            "description": "Whether this field is required.",
                        },
                        "fields": {
                            "type": "array",
                            "description": "Sub-fields for object type.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string"},
                                    "type": {
                                        "type": "string",
                                        "enum": [
                                            "string",
                                            "number",
                                            "integer",
                                            "boolean",
                                        ],
                                    },
                                    "description": {"type": "string"},
                                    "required": {"type": "boolean"},
                                },
                                "required": ["name", "type", "description", "required"],
                            },
                        },
                        "items": {
                            "type": "object",
                            "description": "Item definition for array type.",
                            "properties": {
                                "type": {
                                    "type": "string",
                                    "enum": [
                                        "string",
                                        "number",
                                        "integer",
                                        "boolean",
                                        "object",
                                    ],
                                },
                                "fields": {
                                    "type": "array",
                                    "description": "Sub-fields for array of objects.",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "name": {"type": "string"},
                                            "type": {
                                                "type": "string",
                                                "enum": [
                                                    "string",
                                                    "number",
                                                    "integer",
                                                    "boolean",
                                                ],
                                            },
                                            "description": {"type": "string"},
                                            "required": {"type": "boolean"},
                                        },
                                        "required": [
                                            "name",
                                            "type",
                                            "description",
                                            "required",
                                        ],
                                    },
                                },
                            },
                        },
                    },
                    "required": ["name", "type", "description", "required"],
                },
            },
        },
        "required": ["name", "description", "fields"],
    }

    output_type = StructuredDict(
        suggestion_schema,
        name="SchemaSuggestion",
        description="Suggest an extraction schema for the given document.",
    )

    agent = Agent(
        model_name,
        output_type=output_type,
        retries=3,
        system_prompt=(
            "You are a document analysis specialist. Your task is to analyze a document "
            "and suggest an extraction schema — a set of structured fields that can capture "
            "the key information in documents like this.\n\n"
            "Guidelines:\n"
            "- Identify ALL meaningful data points in the document.\n"
            "- Use snake_case for field names.\n"
            "- Choose appropriate types: string, number, integer, boolean, object, array.\n"
            "- Use 'array' for lists of items (e.g., line items in an invoice, skills in a resume).\n"
            "- Use 'object' for grouped related fields (e.g., address with street, city, zip).\n"
            "- For array types, define the 'items' property with type and fields.\n"
            "- For object types, define nested 'fields'.\n"
            "- Write clear descriptions that help an AI extractor know what to look for.\n"
            "- Mark fields as required if they are essential.\n"
            "- Generate a descriptive schema name and description.\n"
            "- Each field MUST have a unique id (use UUID v4 format).\n"
            "Return ONLY the structured suggestion — no explanations."
        ),
    )

    result = agent.run_sync(
        f"Analyze this document and suggest an extraction schema:\n\n{sample}"
    )
    suggestion = result.output

    # Ensure each field has an 'id'
    import uuid

    def _ensure_ids(fields: list) -> list:
        for field in fields:
            if "id" not in field:
                field["id"] = str(uuid.uuid4())
            if field.get("fields"):
                _ensure_ids(field["fields"])
            if field.get("items", {}).get("fields"):
                _ensure_ids(field["items"]["fields"])
        return fields

    fields = suggestion.get("fields", [])
    _ensure_ids(fields)

    return {
        "name": suggestion.get("name", "Suggested Schema"),
        "description": suggestion.get("description", ""),
        "schema_definition": {"fields": fields},
    }


def flatten_json(data: Any, prefix: str = "") -> dict:
    """
    Flatten a nested dict/list into a flat dict with dot-notation keys.
    Useful for CSV export.
    """
    items: dict[str, Any] = {}

    if isinstance(data, dict):
        for key, value in data.items():
            new_key = f"{prefix}.{key}" if prefix else key
            if isinstance(value, (dict, list)):
                items.update(flatten_json(value, new_key))
            else:
                items[new_key] = value
    elif isinstance(data, list):
        for i, item in enumerate(data):
            new_key = f"{prefix}.{i}"
            if isinstance(item, (dict, list)):
                items.update(flatten_json(item, new_key))
            else:
                items[new_key] = item
    else:
        items[prefix] = data

    return items


def export_result_as_csv(result_data: dict) -> str:
    """
    Convert a structured JSON result into CSV text.
    Handles nested data by flattening with dot-notation keys.
    """
    flat = flatten_json(result_data)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Field", "Value"])
    for key, value in sorted(flat.items()):
        writer.writerow([key, value])
    return output.getvalue()


def get_available_providers() -> list[dict]:
    """Return list of configured LLM providers (those with API keys set)."""
    from django.conf import settings

    providers = []
    if settings.OPENAI_API_KEY:
        providers.append(
            {
                "value": "openai",
                "label": "OpenAI",
                "models": ["gpt-4o", "gpt-4o-mini", "gpt-5.2", "gpt-5-mini", "gpt-5-nano", "gpt-4-turbo", "gpt-3.5-turbo"],
            }
        )
    if settings.ANTHROPIC_API_KEY:
        providers.append(
            {
                "value": "anthropic",
                "label": "Anthropic",
                "models": [
                    "claude-sonnet-4-20250514",
                    "claude-3-5-haiku-20241022",
                    "claude-3-opus-20240229",
                ],
            }
        )
    if settings.GOOGLE_API_KEY:
        providers.append(
            {
                "value": "google",
                "label": "Google",
                "models": [
                    "gemini-2.0-flash",
                    "gemini-1.5-pro",
                    "gemini-1.5-flash",
                ],
            }
        )
    return providers


# ─── Built-in Schema Presets ─────────────────────────────────────────────

import uuid as _uuid


def _uid() -> str:
    return str(_uuid.uuid4())


def get_schema_presets() -> list[dict]:
    """
    Return built-in schema presets for common extraction patterns.
    These cover documents where the user doesn't know what structure to expect.
    """
    return [
        {
            "key": "toc",
            "label": "Table of Contents",
            "description": "Extract the hierarchical structure / headings of a document.",
            "schema": {
                "name": "Table of Contents",
                "description": "Extract the document's hierarchical heading structure.",
                "schema_definition": {
                    "fields": [
                        {
                            "id": _uid(),
                            "name": "title",
                            "type": "string",
                            "description": "The document title or main heading.",
                            "required": True,
                        },
                        {
                            "id": _uid(),
                            "name": "sections",
                            "type": "array",
                            "description": "Top-level sections/headings in order.",
                            "required": True,
                            "items": {
                                "type": "object",
                                "fields": [
                                    {
                                        "id": _uid(),
                                        "name": "heading",
                                        "type": "string",
                                        "description": "Section heading text.",
                                        "required": True,
                                    },
                                    {
                                        "id": _uid(),
                                        "name": "level",
                                        "type": "integer",
                                        "description": "Heading level (1=top, 2=sub, etc.).",
                                        "required": True,
                                    },
                                    {
                                        "id": _uid(),
                                        "name": "subsections",
                                        "type": "array",
                                        "description": "Child sections under this heading.",
                                        "required": False,
                                        "items": {
                                            "type": "object",
                                            "fields": [
                                                {
                                                    "id": _uid(),
                                                    "name": "heading",
                                                    "type": "string",
                                                    "description": "Subsection heading.",
                                                    "required": True,
                                                },
                                                {
                                                    "id": _uid(),
                                                    "name": "level",
                                                    "type": "integer",
                                                    "description": "Heading level.",
                                                    "required": True,
                                                },
                                            ],
                                        },
                                    },
                                ],
                            },
                        },
                    ]
                },
            },
        },
        {
            "key": "tables",
            "label": "Tables Extractor",
            "description": "Find and extract all tables embedded in unstructured text.",
            "schema": {
                "name": "Tables Extractor",
                "description": "Extract all tables found in the document, including headers and rows.",
                "schema_definition": {
                    "fields": [
                        {
                            "id": _uid(),
                            "name": "tables",
                            "type": "array",
                            "description": "All tables found in the document.",
                            "required": True,
                            "items": {
                                "type": "object",
                                "fields": [
                                    {
                                        "id": _uid(),
                                        "name": "table_title",
                                        "type": "string",
                                        "description": "Title or caption of the table, if any.",
                                        "required": False,
                                    },
                                    {
                                        "id": _uid(),
                                        "name": "headers",
                                        "type": "array",
                                        "description": "Column headers of the table.",
                                        "required": True,
                                        "items": {"type": "string"},
                                    },
                                    {
                                        "id": _uid(),
                                        "name": "rows",
                                        "type": "array",
                                        "description": "Data rows. Each row is an array of cell values.",
                                        "required": True,
                                        "items": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                    },
                                ],
                            },
                        },
                    ]
                },
            },
        },
        {
            "key": "key_values",
            "label": "Key-Value Pairs",
            "description": "Extract all key-value pairs, labels and their values from the document.",
            "schema": {
                "name": "Key-Value Extractor",
                "description": "Extract all identifiable key-value pairs from the document.",
                "schema_definition": {
                    "fields": [
                        {
                            "id": _uid(),
                            "name": "entries",
                            "type": "array",
                            "description": "All key-value pairs found in the document.",
                            "required": True,
                            "items": {
                                "type": "object",
                                "fields": [
                                    {
                                        "id": _uid(),
                                        "name": "key",
                                        "type": "string",
                                        "description": "The label, field name, or key.",
                                        "required": True,
                                    },
                                    {
                                        "id": _uid(),
                                        "name": "value",
                                        "type": "string",
                                        "description": "The corresponding value.",
                                        "required": True,
                                    },
                                    {
                                        "id": _uid(),
                                        "name": "category",
                                        "type": "string",
                                        "description": "Optional category or section this pair belongs to.",
                                        "required": False,
                                    },
                                ],
                            },
                        },
                    ]
                },
            },
        },
        {
            "key": "summary",
            "label": "Document Summary",
            "description": "Extract a structured summary with metadata, key points, and entities.",
            "schema": {
                "name": "Document Summary",
                "description": "Extract a structured summary of the document including metadata and key information.",
                "schema_definition": {
                    "fields": [
                        {
                            "id": _uid(),
                            "name": "title",
                            "type": "string",
                            "description": "Document title or subject.",
                            "required": True,
                        },
                        {
                            "id": _uid(),
                            "name": "document_type",
                            "type": "string",
                            "description": "Type of document (report, letter, invoice, contract, etc.).",
                            "required": True,
                        },
                        {
                            "id": _uid(),
                            "name": "language",
                            "type": "string",
                            "description": "Primary language of the document.",
                            "required": False,
                        },
                        {
                            "id": _uid(),
                            "name": "summary",
                            "type": "string",
                            "description": "A concise summary of the document content.",
                            "required": True,
                        },
                        {
                            "id": _uid(),
                            "name": "key_points",
                            "type": "array",
                            "description": "Main points or findings in the document.",
                            "required": True,
                            "items": {"type": "string"},
                        },
                        {
                            "id": _uid(),
                            "name": "entities",
                            "type": "array",
                            "description": "Named entities (people, organizations, dates, amounts) found.",
                            "required": False,
                            "items": {
                                "type": "object",
                                "fields": [
                                    {
                                        "id": _uid(),
                                        "name": "name",
                                        "type": "string",
                                        "description": "Entity name or value.",
                                        "required": True,
                                    },
                                    {
                                        "id": _uid(),
                                        "name": "type",
                                        "type": "string",
                                        "description": "Entity type (person, org, date, amount, location, etc.).",
                                        "required": True,
                                    },
                                ],
                            },
                        },
                    ]
                },
            },
        },
    ]
