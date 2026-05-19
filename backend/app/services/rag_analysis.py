# app/services/rag_analysis.py
# RAG-powered issue analysis.
# Replaces the simple single-LLM-call in gemini.py with:
# 1. Embed the issue
# 2. Retrieve top-k similar code chunks from pgvector
# 3. Build a richer context prompt
# 4. Call DeepSeek for structured JSON output

# ============================================================
# app/services/rag_analysis.py
# ============================================================
# RAG-powered issue analysis pipeline.
#
# Flow:
# 1. Embed the issue title + body using Ollama (local)
# 2. Run cosine similarity search against pgvector to retrieve
#    the top-k most relevant code chunks from the repo
# 3. Build a context-rich prompt with: issue details,
#    repo architecture summary, retrieved code chunks,
#    and CONTRIBUTING.md summary
# 4. Call OpenRouter (openrouter/free router) for structured JSON output
# 5. Normalize the response — free models sometimes return
#    malformed shapes (e.g. file_map as strings instead of objects)
# 6. Return the analysis dict with used_rag + chunks_retrieved fields
#
# The analysis is cached in the Issue.analysis_cache column
# for 7 days, so Gemini/OpenRouter is only called once per issue.
# ============================================================

import json
import re
import asyncio
from typing import Optional, List
from sqlalchemy.orm import Session
from openai import OpenAI

from app.config import settings
from app.models.repository import Repository, CodeChunk
from app.services.embeddings import get_query_embedding


# ── Vector similarity search ──────────────────────────────────

def retrieve_relevant_chunks(
    db: Session,
    repo_owner: str,
    repo_name: str,
    query_embedding: List[float],
    top_k: int = 6,
) -> List[CodeChunk]:
    """
    Runs a cosine similarity search against pgvector.
    Returns the top_k most relevant code chunks for this issue.

    Uses pgvector's <=> operator (cosine distance).
    Lower distance = more similar to the query.

    Falls back gracefully — if the repo hasn't been ingested yet,
    returns an empty list. The analysis will still run, just without
    RAG context (used_rag will be False in that case).
    """
    repo = db.query(Repository).filter(
        Repository.owner == repo_owner,
        Repository.name == repo_name,
    ).first()

    if not repo:
        return []

    results = (
        db.query(CodeChunk)
        .filter(CodeChunk.repo_id == repo.id)
        .filter(CodeChunk.embedding.is_not(None))
        .order_by(CodeChunk.embedding.cosine_distance(query_embedding))
        .limit(top_k)
        .all()
    )
    return results


# ── Response normalizers ──────────────────────────────────────
# Free models on OpenRouter don't always follow the JSON schema
# perfectly. These functions fix common malformed shapes so the
# frontend always receives the correct structure.

def normalize_file_map(file_map) -> list:
    """
    Normalizes file_map to always be a list of:
      {"path": str, "relevance": str, "reason": str}

    Free models sometimes return:
    - A plain list of strings: ["src/routes.php", "config/menu.php"]
    - Objects missing the "relevance" or "reason" keys
    - A single string instead of a list

    This function handles all cases.
    """
    if not file_map:
        return []

    # Handle case where model returned a single string
    if isinstance(file_map, str):
        return [{
            "path": file_map,
            "relevance": "primary",
            "reason": "Identified as relevant by AI analysis"
        }]

    normalized = []
    for item in file_map:
        if isinstance(item, str):
            # Plain string path — convert to expected object shape
            normalized.append({
                "path": item,
                "relevance": "primary",
                "reason": "Identified as relevant by AI analysis"
            })
        elif isinstance(item, dict):
            # Already an object — ensure all required keys exist
            normalized.append({
                "path": item.get("path", "unknown"),
                "relevance": item.get("relevance", "primary"),
                "reason": item.get("reason", "Identified as relevant by AI analysis")
            })
        # Skip anything else (None, numbers, etc.)

    return normalized


def normalize_implementation_steps(steps) -> list:
    """
    Normalizes implementation_steps to always be a list of:
      {"order": int, "title": str, "description": str}

    Free models sometimes return:
    - Plain strings: ["Step 1: Do this", "Step 2: Do that"]
    - Objects missing the "order" or "description" keys
    """
    if not steps:
        return []

    normalized = []
    for i, step in enumerate(steps):
        if isinstance(step, str):
            # Plain string — use it as the title
            normalized.append({
                "order": i + 1,
                "title": step,
                "description": step
            })
        elif isinstance(step, dict):
            normalized.append({
                "order": step.get("order", i + 1),
                "title": step.get("title", f"Step {i + 1}"),
                "description": step.get("description", step.get("title", ""))
            })

    return normalized


def normalize_list_field(value) -> list:
    """
    Normalizes a field that should be a list of strings.
    Handles cases where the model returns a single string
    or a list containing non-string items.
    """
    if not value:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [str(item) for item in value if item]
    return []


# ── Prompt ────────────────────────────────────────────────────

RAG_ANALYSIS_PROMPT = """You are an expert software engineer helping a developer understand and contribute to an open source issue.

You have access to the actual source code of the repository. Use it to give precise, grounded guidance.

ISSUE DETAILS:
Title: {title}
Repository: {repo_owner}/{repo_name}
Labels: {labels}
Issue body:
{body}

REPOSITORY ARCHITECTURE:
{arch_summary}

RELEVANT CODE CHUNKS (retrieved via semantic search):
{code_chunks}

CONTRIBUTING GUIDELINES:
{contributing_summary}

Based on the above, respond with ONLY a valid JSON object in this exact format:
{{
  "plain_explanation": "2-3 sentences explaining what actually needs to be done. Reference specific functions or files from the code above.",
  "background": "1-2 sentences explaining why this issue exists and what problem it solves.",
  "file_map": [
    {{
      "path": "exact/file/path/from/code/above.ext",
      "relevance": "primary",
      "reason": "Specific reason referencing the actual code"
    }}
  ],
  "implementation_steps": [
    {{
      "order": 1,
      "title": "Short step title",
      "description": "Detailed description referencing actual functions or patterns from the retrieved code"
    }}
  ],
  "edge_cases": ["Edge case referencing specific code patterns"],
  "test_hints": "Specific test file paths or patterns visible in the retrieved code."
}}

Rules:
- file_map: 2-5 files. Use ONLY paths that appear in the code chunks above. relevance must be "primary", "secondary", or "reference".
- implementation_steps: 3-6 steps. Reference real function names from the chunks.
- edge_cases: 2-4 items as a JSON array of strings.
- test_hints: a single string.
- Return ONLY the JSON. No explanation before or after. No markdown fences."""


# ── Main analysis function ────────────────────────────────────

async def analyze_issue_with_rag(
    title: str,
    body: str,
    repo_owner: str,
    repo_name: str,
    labels: list,
    db: Session,
    max_retries: int = 3,
) -> Optional[dict]:
    """
    Full RAG pipeline:
    1. Embed the issue query using Ollama
    2. Retrieve relevant code chunks from pgvector
    3. Build a context-rich prompt
    4. Call OpenRouter (openrouter/free) for structured analysis
    5. Normalize the response to ensure correct shape
    6. Return the analysis dict, or None if all retries fail

    The returned dict always includes:
    - used_rag: bool — True if code chunks were retrieved
    - chunks_retrieved: int — number of chunks used
    """

    # Create OpenRouter client
    # Uses openrouter/free which automatically picks from available
    # free models — this avoids 404s when specific models go offline
    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=settings.openrouter_api_key,
    )

    # ── Step 1: Embed the issue ───────────────────────────────
    # Combine title + first 1000 chars of body for the query
    query_text = f"{title}\n\n{(body or '')[:1000]}"
    query_embedding = get_query_embedding(query_text)

    # ── Step 2: Retrieve relevant chunks ─────────────────────
    # Falls back to empty list if repo not ingested yet
    chunks = []
    if query_embedding:
        chunks = retrieve_relevant_chunks(
            db, repo_owner, repo_name, query_embedding, top_k=6
        )

    # ── Step 3: Build context ─────────────────────────────────
    repo = db.query(Repository).filter(
        Repository.owner == repo_owner,
        Repository.name == repo_name,
    ).first()

    arch_summary = (
        repo.arch_summary
        if repo and repo.arch_summary
        else "Repository not yet ingested — no architecture summary available."
    )
    contributing_summary = (
        repo.contributing_md_summary
        if repo and repo.contributing_md_summary
        else "No CONTRIBUTING.md found."
    )

    if chunks:
        # Format each chunk with its file path and function name
        code_chunks_text = "\n\n---\n\n".join(
            f"File: {c.file_path}\n"
            f"Function: {c.function_name or 'module level'}\n\n"
            f"{c.chunk_text[:600]}"
            for c in chunks
        )
    else:
        code_chunks_text = (
            "No code chunks available — repository has not been ingested yet. "
            "Make general recommendations based on the issue text."
        )

    label_str = ", ".join([l.get("name", "") for l in labels]) if labels else "none"
    truncated_body = (body or "")[:2000]

    prompt = RAG_ANALYSIS_PROMPT.format(
        title=title,
        repo_owner=repo_owner,
        repo_name=repo_name,
        labels=label_str,
        body=truncated_body,
        arch_summary=arch_summary,
        code_chunks=code_chunks_text,
        contributing_summary=contributing_summary,
    )

    # ── Step 4: Call OpenRouter with retries ──────────────────
    raw_text = ""
    for attempt in range(1, max_retries + 1):
        try:
            print(f"🤖 RAG analysis attempt {attempt}/{max_retries} "
                  f"(chunks: {len(chunks)})...")

            resp = client.chat.completions.create(
                model="openrouter/free",  # Auto-selects from available free models
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
            )
            raw_text = resp.choices[0].message.content.strip()

            # Strip markdown fences if model adds them despite instructions
            if raw_text.startswith("```"):
                raw_text = re.sub(r"^```(?:json)?\n?", "", raw_text)
                raw_text = re.sub(r"\n?```$", "", raw_text)
                raw_text = raw_text.strip()

            # Parse JSON
            analysis = json.loads(raw_text)

            # ── Step 5: Normalize response ────────────────────
            # Ensure all required fields exist with correct shapes
            # regardless of which free model responded

            analysis["plain_explanation"] = analysis.get(
                "plain_explanation", ""
            ) or ""

            analysis["background"] = analysis.get("background", "") or ""

            analysis["file_map"] = normalize_file_map(
                analysis.get("file_map", [])
            )

            analysis["implementation_steps"] = normalize_implementation_steps(
                analysis.get("implementation_steps", [])
            )

            analysis["edge_cases"] = normalize_list_field(
                analysis.get("edge_cases", [])
            )

            analysis["test_hints"] = analysis.get("test_hints", "") or ""

            # Add RAG metadata so the frontend can show a badge
            analysis["used_rag"] = len(chunks) > 0
            analysis["chunks_retrieved"] = len(chunks)

            print(f"✅ RAG analysis complete — used {len(chunks)} chunks, "
                  f"used_rag={analysis['used_rag']}")
            return analysis

        except json.JSONDecodeError as e:
            # JSON errors won't be fixed by retrying — give up immediately
            print(f"❌ JSON parse error on attempt {attempt}: {e}")
            print(f"Raw response preview: {raw_text[:400]}")
            return None

        except Exception as e:
            error_str = str(e)
            print(f"❌ Attempt {attempt} failed: {error_str}")

            # Rate limit — wait with exponential backoff and retry
            if "429" in error_str or "rate limit" in error_str.lower():
                wait_seconds = 30 * attempt
                print(f"⏳ Rate limited — waiting {wait_seconds}s before retry...")
                await asyncio.sleep(wait_seconds)
                continue

            # Any other error (auth, network, etc.) — don't retry
            return None

    print(f"❌ RAG analysis failed after {max_retries} attempts")
    return None