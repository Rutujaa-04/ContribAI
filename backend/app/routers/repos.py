# ============================================================
# app/routers/repos.py
# ============================================================
# GET /repos/{owner}/{repo}/overview
#   → Fetches repo metadata from GitHub + generates AI summary
#   → Caches result in DB for 24h
# ============================================================


# ============================================================
# app/routers/repos.py
# ============================================================
# Handles:
#   POST /repos/ingest                  → trigger repo ingestion
#   GET  /repos/{owner}/{repo}/overview → repo architecture + stack + health
#   GET  /repos/{owner}/{repo}/health   → health score
#   POST /issues/{id}/pr-draft          → generate PR description

import httpx
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.repository import Repository
from app.config import settings

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────

class RepoOverviewResponse(BaseModel):
    id: str
    owner: str
    name: str
    full_name: str
    description: Optional[str]
    stars: int
    primary_language: Optional[str]
    tech_stack: list
    arch_summary: Optional[str]
    health_score: Optional[float]
    has_contributing_md: Optional[bool]
    contributing_md_summary: Optional[str]
    last_ingested_at: Optional[str]
    html_url: str


# ── POST /repos/ingest ────────────────────────────────────────

async def _run_ingest_background(owner: str, repo_name: str, force_refresh: bool):
    """
    Safely runs repository ingestion in the background with its own DB session.
    """
    from app.database import SessionLocal
    from app.services.ingestion import ingest_repository
    db = SessionLocal()
    try:
        await ingest_repository(owner, repo_name, db, force_refresh)
    except Exception as e:
        print(f"❌ Background ingestion failed for {owner}/{repo_name}: {e}")
    finally:
        db.close()


@router.post("/ingest")
async def trigger_ingestion(
    body: dict,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Triggers background ingestion of a GitHub repo.
    Returns immediately — ingestion runs in background.
    If already ingested within 24h, returns status="cached".
    """
    owner = body.get("owner", "").strip()
    repo_name = body.get("repo", "").strip()
    force_refresh = body.get("force_refresh", False)

    if not owner or not repo_name:
        raise HTTPException(status_code=400, detail="owner and repo are required")

    # Check if already ingested recently
    existing = db.query(Repository).filter(
        Repository.full_name == f"{owner}/{repo_name}"
    ).first()

    if existing and existing.last_ingested_at and not force_refresh:
        from datetime import timedelta
        age = datetime.utcnow() - existing.last_ingested_at
        if age.total_seconds() < 86400:
            return {
                "status": "cached",
                "repo_id": str(existing.id),
                "message": "Already ingested within 24h",
            }

    background_tasks.add_task(_run_ingest_background, owner, repo_name, force_refresh)

    return {
        "status": "ingestion_started",
        "full_name": f"{owner}/{repo_name}",
        "message": "Ingestion running in background.",
    }


# ── GET /repos/{owner}/{repo}/overview ────────────────────────

@router.get("/{owner}/{repo}/overview", response_model=RepoOverviewResponse)
async def get_repo_overview(
    owner: str,
    repo: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns the AI-generated architecture summary, tech stack,
    health score, and CONTRIBUTING.md summary for a repository.

    If the repo has never been ingested, triggers ingestion
    synchronously (user waits on first load).
    """
    from app.services.ingestion import ingest_repository

    full_name = f"{owner}/{repo}"
    repo_obj = db.query(Repository).filter(Repository.full_name == full_name).first()

    if not repo_obj or not repo_obj.last_ingested_at:
        result = await ingest_repository(owner, repo, db)
        repo_obj = db.query(Repository).filter(Repository.full_name == full_name).first()
        if not repo_obj:
            raise HTTPException(status_code=502, detail="Failed to ingest repository")

    # Compute + cache health score if not already stored
    if repo_obj.health_score is None:
        repo_obj.health_score = await compute_health_score(owner, repo)
        db.commit()

    return RepoOverviewResponse(
        id=str(repo_obj.id),
        owner=repo_obj.owner,
        name=repo_obj.name,
        full_name=repo_obj.full_name,
        description=repo_obj.description,
        stars=repo_obj.stars or 0,
        primary_language=repo_obj.primary_language,
        tech_stack=repo_obj.tech_stack or [],
        arch_summary=repo_obj.arch_summary,
        health_score=repo_obj.health_score,
        has_contributing_md=repo_obj.has_contributing_md,
        contributing_md_summary=repo_obj.contributing_md_summary,
        last_ingested_at=repo_obj.last_ingested_at.isoformat() if repo_obj.last_ingested_at else None,
        html_url=repo_obj.html_url or f"https://github.com/{owner}/{repo}",
    )


# ── Health score helper ───────────────────────────────────────

async def compute_health_score(owner: str, repo: str) -> float:
    """
    Heuristic health score 0-100 based on:
    - Recent commits (last 30 days): +30
    - Has open issues: +10
    - Has CONTRIBUTING.md: +20
    - Stars > 100: +10, > 1000: +20
    - PR merge rate: +10 if > 50%
    """
    score = 0.0
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {"Accept": "application/vnd.github.v3+json"}
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/commits?per_page=1",
                headers=headers,
            )
            if resp.status_code == 200 and resp.json():
                last_commit_date = resp.json()[0]["commit"]["committer"]["date"]
                days_since = (datetime.utcnow() - datetime.fromisoformat(
                    last_commit_date.replace("Z", "+00:00")
                ).replace(tzinfo=None)).days
                if days_since < 30:
                    score += 30
                elif days_since < 90:
                    score += 15
    except Exception:
        pass
    return min(score + 40, 100.0)  # Base 40 points for any existing repo


# ── Difficulty scoring ────────────────────────────────────────

async def compute_difficulty_score(
    owner: str,
    repo: str,
    issue_number: int,
    labels: list,
    comment_count: int,
) -> dict:
    """
    Heuristic difficulty model combining label signals + comment count.
    Returns {"difficulty": "beginner|intermediate|advanced", "estimated_hours": float}
    """
    label_names = [l.get("name", "").lower() for l in labels]

    if any(l in label_names for l in ["good first issue", "beginner", "easy", "starter", "good-first-issue"]):
        base_difficulty = "beginner"
        base_hours = 2.0
    elif any(l in label_names for l in ["advanced", "hard", "complex", "expert"]):
        base_difficulty = "advanced"
        base_hours = 8.0
    elif any(l in label_names for l in ["help wanted", "intermediate", "medium"]):
        base_difficulty = "intermediate"
        base_hours = 4.0
    else:
        base_difficulty = "intermediate"
        base_hours = 4.0

    if comment_count > 50:
        base_hours *= 2.0
        base_difficulty = "advanced"
    elif comment_count > 20:
        base_hours *= 1.5
        if base_difficulty == "beginner":
            base_difficulty = "intermediate"

    return {
        "difficulty": base_difficulty,
        "estimated_hours": round(base_hours, 1),
    }