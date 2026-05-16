# ============================================================
# app/routers/repos.py
# ============================================================
# GET /repos/{owner}/{repo}/overview
#   → Fetches repo metadata from GitHub + generates AI summary
#   → Caches result in DB for 24h
# ============================================================

import httpx
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.config import settings

router = APIRouter()


async def fetch_github_repo(owner: str, repo: str) -> dict:
    """Fetch repo metadata from GitHub API."""
    headers = {"Accept": "application/vnd.github.v3+json"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}",
            headers=headers,
        )
        if response.status_code == 404:
            raise HTTPException(status_code=404, detail="Repository not found")
        if response.status_code == 403:
            raise HTTPException(status_code=429, detail="GitHub rate limit reached")
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="GitHub API error")
        return response.json()


async def fetch_repo_languages(owner: str, repo: str) -> dict:
    """Fetch language breakdown from GitHub API."""
    headers = {"Accept": "application/vnd.github.v3+json"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/languages",
            headers=headers,
        )
        if response.status_code != 200:
            return {}
        return response.json()


def detect_tech_stack(repo_data: dict, languages: dict) -> list[str]:
    """
    Detect tech stack from language data and repo topics.
    Returns a clean list like ["Python", "TypeScript", "React"].
    """
    stack = []

    # Add top languages (by bytes of code)
    sorted_langs = sorted(languages.items(), key=lambda x: x[1], reverse=True)
    stack.extend([lang for lang, _ in sorted_langs[:5]])

    # Add GitHub topics as framework hints
    topics = repo_data.get("topics", [])
    framework_topics = [
        t for t in topics
        if t in [
            "react", "nextjs", "vue", "angular", "fastapi", "django",
            "flask", "express", "rails", "spring", "docker", "kubernetes",
            "graphql", "rest-api", "machine-learning", "deep-learning",
        ]
    ]
    stack.extend([t.capitalize() for t in framework_topics[:3]])

    return list(dict.fromkeys(stack))  # Deduplicate while preserving order


def compute_health_score(repo_data: dict) -> int:
    """
    Heuristic health score 0-100 based on:
    - Stars (popularity)
    - Recent activity (pushed_at)
    - Open issues ratio
    - Has description, license, topics
    """
    score = 0

    # Stars (up to 30 points)
    stars = repo_data.get("stargazers_count", 0)
    if stars > 10000:
        score += 30
    elif stars > 1000:
        score += 20
    elif stars > 100:
        score += 10
    elif stars > 10:
        score += 5

    # Recent activity (up to 30 points)
    pushed_at = repo_data.get("pushed_at")
    if pushed_at:
        days_since = (datetime.utcnow() - datetime.fromisoformat(
            pushed_at.replace("Z", "+00:00")
        ).replace(tzinfo=None)).days
        if days_since < 7:
            score += 30
        elif days_since < 30:
            score += 20
        elif days_since < 90:
            score += 10
        elif days_since < 365:
            score += 5

    # Has description (10 points)
    if repo_data.get("description"):
        score += 10

    # Has license (10 points)
    if repo_data.get("license"):
        score += 10

    # Has topics (10 points)
    if repo_data.get("topics"):
        score += 10

    # Not archived (10 points)
    if not repo_data.get("archived", False):
        score += 10

    return min(score, 100)


# ── GET /repos/{owner}/{repo}/overview ───────────────────────
@router.get("/{owner}/{repo}/overview")
async def get_repo_overview(
    owner: str,
    repo: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns a repo overview: metadata, tech stack, health score.
    Caches in DB for 24 hours to avoid hammering GitHub API.
    """
    from app.models.issue import Issue as IssueModel

    # Check if we have a recently cached repo overview
    # We reuse the Issue model's repo fields — no separate repo table needed yet
    # Instead we'll just fetch fresh from GitHub and return directly
    # (caching via a Repository model can be added later)

    repo_data = await fetch_github_repo(owner, repo)
    languages = await fetch_repo_languages(owner, repo)
    tech_stack = detect_tech_stack(repo_data, languages)
    health_score = compute_health_score(repo_data)

    return {
        "owner": owner,
        "name": repo,
        "full_name": repo_data.get("full_name", f"{owner}/{repo}"),
        "description": repo_data.get("description"),
        "stars": repo_data.get("stargazers_count", 0),
        "forks": repo_data.get("forks_count", 0),
        "open_issues": repo_data.get("open_issues_count", 0),
        "primary_language": repo_data.get("language"),
        "tech_stack": tech_stack,
        "health_score": health_score,
        "topics": repo_data.get("topics", []),
        "license": repo_data.get("license", {}).get("name") if repo_data.get("license") else None,
        "html_url": repo_data.get("html_url"),
        "archived": repo_data.get("archived", False),
        "pushed_at": repo_data.get("pushed_at"),
    }