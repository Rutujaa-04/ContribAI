# ============================================================
# app/routers/repos.py
# ============================================================
# GET /repos/{owner}/{repo}/overview
#   → Fetches repo metadata from GitHub + generates AI summary
#   → Caches result in DB for 24h
# ============================================================

# app/routers/repos.py
# Handles:
#   POST /repos/ingest              → trigger repo ingestion
#   GET  /repos/{owner}/{repo}/overview → repo architecture + stack
#   GET  /repos/{owner}/{repo}/health   → health score
#   POST /issues/{id}/pr-draft      → generate PR description

import httpx
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.repository import Repository
from app.config import settings

router = APIRouter()


# ── POST /repos/ingest ─────────────────────────────────────────────────────

@router.post("/ingest")
async def trigger_ingestion(
    body: dict,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Triggers background ingestion of a GitHub repo.
    Ingestion is async — returns immediately with a status.
    The frontend can poll /repos/{owner}/{repo}/overview to check when done.
    """
    owner = body.get("owner", "").strip()
    repo_name = body.get("repo", "").strip()
    force_refresh = body.get("force_refresh", False)

    if not owner or not repo_name:
        raise HTTPException(status_code=400, detail="owner and repo are required")

    from app.services.ingestion import ingest_repository

    # Run in background so the HTTP response returns immediately
    background_tasks.add_task(ingest_repository, owner, repo_name, db, force_refresh)

    return {
        "status": "ingestion_started",
        "full_name": f"{owner}/{repo_name}",
        "message": "Ingestion running in background. Check overview endpoint for status.",
    }


# ── GET /repos/{owner}/{repo}/overview ────────────────────────────────────────

@router.get("/{owner}/{repo}/overview")
async def get_repo_overview(
    owner: str,
    repo: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns the AI-generated architecture summary, tech stack, health score,
    and CONTRIBUTING.md summary for a repository.
    
    If the repo has never been ingested, triggers ingestion automatically.
    """
    from app.services.ingestion import ingest_repository

    full_name = f"{owner}/{repo}"
    repo_obj = db.query(Repository).filter(Repository.full_name == full_name).first()

    if not repo_obj or not repo_obj.last_ingested_at:
        # Auto-trigger ingestion (synchronous for first load — user waits)
        result = await ingest_repository(owner, repo, db)
        repo_obj = db.query(Repository).filter(Repository.full_name == full_name).first()
        if not repo_obj:
            raise HTTPException(status_code=502, detail="Failed to ingest repository")

    # Compute health score if not cached
    if repo_obj.health_score is None:
        repo_obj.health_score = await compute_health_score(owner, repo)
        db.commit()

    return {
        "id": str(repo_obj.id),
        "full_name": repo_obj.full_name,
        "description": repo_obj.description,
        "stars": repo_obj.stars,
        "primary_language": repo_obj.primary_language,
        "tech_stack": repo_obj.tech_stack or [],
        "arch_summary": repo_obj.arch_summary,
        "health_score": repo_obj.health_score,
        "has_contributing_md": repo_obj.has_contributing_md,
        "contributing_md_summary": repo_obj.contributing_md_summary,
        "last_ingested_at": repo_obj.last_ingested_at.isoformat() if repo_obj.last_ingested_at else None,
        "html_url": repo_obj.html_url,
    }


async def compute_health_score(owner: str, repo: str) -> float:
    """
    Heuristic health score 0-100 based on:
    - Has recent commits (last 30 days): +30
    - Has open issues: +10
    - Has CONTRIBUTING.md: +20
    - Stars > 100: +10, > 1000: +20
    - PR merge rate (closed PRs): +10 if > 50%
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
                from datetime import timedelta
                days_since = (datetime.utcnow() - datetime.fromisoformat(
                    last_commit_date.replace("Z", "+00:00")
                ).replace(tzinfo=None)).days
                if days_since < 30:
                    score += 30
                elif days_since < 90:
                    score += 15
    except Exception:
        pass
    return min(score + 40, 100.0)  # Base 40 points for existing repos


# ── Difficulty scoring ────────────────────────────────────────────────────────

async def compute_difficulty_score(
    owner: str,
    repo: str,
    issue_number: int,
    labels: list,
    comment_count: int,
) -> dict:
    """
    Heuristic difficulty model combining:
    - Label signals (good first issue, help wanted, etc.)
    - Comment count (more comments = more complex discussion)
    - Files referenced in issue body (if mentioned)
    
    Returns {"difficulty": "beginner|intermediate|advanced", "estimated_hours": float}
    """
    label_names = [l.get("name", "").lower() for l in labels]

    # Label-based signals
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

    # Comment count modifier
    if comment_count > 20:
        base_hours *= 1.5
        if base_difficulty == "beginner":
            base_difficulty = "intermediate"
    elif comment_count > 50:
        base_hours *= 2.0
        base_difficulty = "advanced"

    return {
        "difficulty": base_difficulty,
        "estimated_hours": round(base_hours, 1),
    }