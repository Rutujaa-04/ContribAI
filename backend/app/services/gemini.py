# ============================================================
# app/services/gemini.py
# ============================================================
# Handles all Gemini AI calls for issue analysis.
#
# What it does:
# 1. Takes a GitHub issue (title + body + labels)
# 2. Sends it to Gemini with a structured prompt
# 3. Returns a parsed analysis object with:
#    - plain_explanation: what actually needs to be done
#    - background: why this issue exists
#    - file_map: which files to look at
#    - implementation_steps: ordered checklist
#    - edge_cases: things to watch out for
#    - test_hints: what to test
#
# Uses google-generativeai (free tier — no credit card needed)
# Install: pip install google-generativeai
# Get key: https://aistudio.google.com (free)
# ============================================================

# ============================================================
# app/services/gemini.py
# ============================================================

import os
import json
import re
import asyncio
from typing import Optional
from openai import OpenAI
from app.config import settings


ANALYSIS_PROMPT = """You are an expert software engineer helping a developer understand and contribute to an open source issue.

Analyze this GitHub issue and provide a structured breakdown that will help a developer contribute to it.

ISSUE DETAILS:
Title: {title}
Repository: {repo_owner}/{repo_name}
Labels: {labels}
Body:
{body}

Respond with ONLY a valid JSON object (no markdown, no code blocks, just raw JSON) in this exact format:
{{
  "plain_explanation": "2-3 sentences explaining what actually needs to be done in simple terms. No jargon.",
  "background": "1-2 sentences explaining why this issue exists and what problem it solves.",
  "file_map": [
    {{
      "path": "likely/file/path.ext",
      "relevance": "primary",
      "reason": "Why this file is relevant to the fix"
    }}
  ],
  "implementation_steps": [
    {{
      "order": 1,
      "title": "Short step title",
      "description": "Detailed description of what to do in this step"
    }}
  ],
  "edge_cases": [
    "Edge case or gotcha to watch out for"
  ],
  "test_hints": "What to test and where test files likely live in this type of project."
}}

Rules:
- file_map: 2-5 files max. Use realistic paths based on the repo and issue context. relevance must be "primary", "secondary", or "reference"
- implementation_steps: 3-6 steps max. Be concrete and actionable.
- edge_cases: 2-4 items max.
- Keep language simple — the reader may be a beginner.
- If the issue body is vague, make reasonable assumptions based on the title and labels.
- Return ONLY the JSON. No explanation before or after."""


async def analyze_issue(
    title: str,
    body: str,
    repo_owner: str,
    repo_name: str,
    labels: list,
    max_retries: int = 3,
) -> Optional[dict]:
    """
    Calls OpenRouter (DeepSeek free model) to analyze a GitHub issue.
    Automatically retries on rate limit errors with backoff.
    Returns a structured dict or None if all retries fail.
    """
    # Create client here (not at module level) so the API key is
    # already loaded from .env when this function is called
    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=settings.openrouter_api_key,
    )

    label_str = ", ".join([l.get("name", "") for l in labels]) if labels else "none"

    truncated_body = (body or "")[:2000]
    if len(body or "") > 2000:
        truncated_body += "\n... (truncated)"

    prompt = ANALYSIS_PROMPT.format(
        title=title,
        repo_owner=repo_owner,
        repo_name=repo_name,
        labels=label_str,
        body=truncated_body,
    )

    raw_text = ""

    for attempt in range(1, max_retries + 1):
        try:
            print(f"🤖 OpenRouter attempt {attempt}/{max_retries}...")

            response = client.chat.completions.create(
                model="minimax/minimax-m2.5:free",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
            )

            raw_text = response.choices[0].message.content
            if not raw_text:
                print(f"❌ Empty response from model on attempt {attempt}")
                continue
            raw_text = raw_text.strip()

            # Clean up markdown fences if model adds them
            if raw_text.startswith("```"):
                raw_text = re.sub(r"^```(?:json)?\n?", "", raw_text)
                raw_text = re.sub(r"\n?```$", "", raw_text)
                raw_text = raw_text.strip()

            analysis = json.loads(raw_text)

            # Ensure all required fields exist
            required_fields = [
                "plain_explanation", "background", "file_map",
                "implementation_steps", "edge_cases", "test_hints"
            ]
            for field in required_fields:
                if field not in analysis:
                    analysis[field] = "" if field in ("plain_explanation", "background", "test_hints") else []

            print(f"✅ Analysis succeeded on attempt {attempt}")
            return analysis

        except json.JSONDecodeError as e:
            print(f"❌ Invalid JSON on attempt {attempt}: {e}")
            print(f"Raw response: {raw_text[:500]}")
            return None  # JSON errors won't be fixed by retrying

        except Exception as e:
            error_str = str(e)
            print(f"❌ Attempt {attempt} failed: {error_str}")

            if "429" in error_str or "rate limit" in error_str.lower():
                # Extract retry_after from error if available
                import re as re_mod
                match = re_mod.search(r"retry_after_seconds': (\d+)", error_str)
                wait_seconds = int(match.group(1)) + 5 if match else 30 * attempt
                print(f"⏳ Rate limited — waiting {wait_seconds}s...")
                await asyncio.sleep(wait_seconds)
                continue

            return None  # Non-retryable error

    print("❌ All retries failed")
    return None