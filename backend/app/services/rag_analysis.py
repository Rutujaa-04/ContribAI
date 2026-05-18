# app/services/rag_analysis.py
# RAG-powered issue analysis.
# Replaces the simple single-LLM-call in gemini.py with:
# 1. Embed the issue
# 2. Retrieve top-k similar code chunks from pgvector
# 3. Build a richer context prompt
# 4. Call DeepSeek for structured JSON output

import json
import re
import asyncio
from typing import Optional, List
from sqlalchemy.orm import Session
from openai import OpenAI

from app.config import settings
from app.models.repository import Repository, CodeChunk
from app.services.embeddings import get_query_embedding


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
    """
    repo = db.query(Repository).filter(
        Repository.owner == repo_owner,
        Repository.name == repo_name,
    ).first()

    if not repo:
        return []

    # pgvector cosine distance operator: <=>
    # Lower distance = more similar
    results = (
        db.query(CodeChunk)
        .filter(CodeChunk.repo_id == repo.id)
        .filter(CodeChunk.embedding.is_not(None))
        .order_by(CodeChunk.embedding.cosine_distance(query_embedding))
        .limit(top_k)
        .all()
    )
    return results


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
- file_map: 2-5 files. Use ONLY paths that appear in the code chunks above.
- implementation_steps: 3-6 steps. Reference real function names from the chunks.
- edge_cases: 2-4 items.
- Return ONLY the JSON."""


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
    1. Embed the issue query
    2. Retrieve relevant code chunks from pgvector
    3. Build context-rich prompt
    4. Call DeepSeek for structured analysis
    """
    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=settings.openrouter_api_key)

    # Step 1: Embed the issue
    query_text = f"{title}\n\n{(body or '')[:1000]}"
    query_embedding = get_query_embedding(query_text)

    # Step 2: Retrieve relevant chunks (falls back gracefully if no ingestion yet)
    chunks = []
    if query_embedding:
        chunks = retrieve_relevant_chunks(db, repo_owner, repo_name, query_embedding, top_k=6)

    # Step 3: Build context
    repo = db.query(Repository).filter(
        Repository.owner == repo_owner,
        Repository.name == repo_name,
    ).first()

    arch_summary = repo.arch_summary if repo else "Repository not yet ingested."
    contributing_summary = repo.contributing_md_summary if repo and repo.contributing_md_summary else "No CONTRIBUTING.md found."

    if chunks:
        code_chunks_text = "\n\n---\n\n".join(
            f"File: {c.file_path}\nFunction: {c.function_name or 'module level'}\n\n{c.chunk_text[:600]}"
            for c in chunks
        )
    else:
        code_chunks_text = "No code chunks available — repository has not been ingested yet. Make general recommendations based on the issue text."

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

    # Step 4: Call DeepSeek
    raw_text = ""
    for attempt in range(1, max_retries + 1):
        try:
            print(f"🤖 RAG analysis attempt {attempt}/{max_retries} (chunks: {len(chunks)})...")
            resp = client.chat.completions.create(
                model="openrouter/free",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
            )
            raw_text = resp.choices[0].message.content.strip()

            if raw_text.startswith("```"):
                raw_text = re.sub(r"^```(?:json)?\n?", "", raw_text)
                raw_text = re.sub(r"\n?```$", "", raw_text)
                raw_text = raw_text.strip()

            analysis = json.loads(raw_text)

            required = ["plain_explanation", "background", "file_map",
                        "implementation_steps", "edge_cases", "test_hints"]
            for field in required:
                if field not in analysis:
                    analysis[field] = "" if field in ("plain_explanation", "background", "test_hints") else []

            analysis["used_rag"] = len(chunks) > 0
            analysis["chunks_retrieved"] = len(chunks)
            print(f"✅ RAG analysis complete (used {len(chunks)} chunks)")
            return analysis

        except json.JSONDecodeError as e:
            print(f"❌ JSON parse error: {e}\nRaw: {raw_text[:400]}")
            return None
        except Exception as e:
            error_str = str(e)
            print(f"❌ Attempt {attempt} failed: {error_str}")
            if "429" in error_str or "rate limit" in error_str.lower():
                await asyncio.sleep(30 * attempt)
                continue
            return None

    return None