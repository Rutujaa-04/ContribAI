# ============================================================
# app/routers/issues.py
# ============================================================
# Handles issue discovery and saving:
#
#   GET  /issues/discover        → fetch matching issues from GitHub
#   GET  /issues/{id}            → get a single cached issue
#   POST /issues/{id}/save       → save issue to user's dashboard
#
# How discovery works:
# 1. User sends their languages + experience level
# 2. We build a GitHub search query (e.g. "label:good first issue language:python")
# 3. We call GitHub's search/issues API
# 4. We cache the results in our DB (so repeat views are fast)
# 5. We return the issues to the frontend
#
# GitHub search API docs:
# https://docs.github.com/en/rest/search#search-issues-and-pull-requests
# ============================================================

import httpx
from datetime import datetime, timedelta
# from app.services.gemini import analyze_issue
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.issue import Issue, UserIssue
from app.config import settings  

router = APIRouter()

# ── GitHub search helper ──────────────────────────────────────

# Maps experience level → GitHub labels to search for
DIFFICULTY_LABELS = {
    "beginner": ["good first issue", "beginner", "easy", "starter"],
    "intermediate": ["help wanted", "intermediate", "medium"],
    "advanced": ["help wanted", "advanced", "hard", "complex"],
}

# Maps language name → GitHub language search value
# GitHub uses specific strings for language search
LANGUAGE_MAP = {
    "python": "python",
    "typescript": "typescript",
    "javascript": "javascript",
    "rust": "rust",
    "go": "go",
    "java": "java",
    "cpp": "c++",
    "c": "c",
    "ruby": "ruby",
    "swift": "swift",
    "kotlin": "kotlin",
    "php": "php",
    "html": "html",
    "css": "css",
    "shell": "shell",
    "vue": "vue",
    "react": "javascript",  # React issues are in JS/TS repos
}


async def search_github_issues(
    languages: List[str],
    level: str,
    time_available: Optional[int],
    page: int,
    per_page: int,
) -> dict:
    """
    Calls GitHub's search API to find matching open source issues.

    Builds a query like:
      is:open is:issue label:"good first issue" language:python no:assignee
    """
    # Build the label part — OR across difficulty labels
    difficulty_labels = DIFFICULTY_LABELS.get(level, DIFFICULTY_LABELS["beginner"])
    # Use the first two labels for the primary search to keep query short
    label_queries = " ".join(f'label:"{lab}"' for lab in difficulty_labels[:2])

    # Build language filters
    lang_queries = []
    for lang in languages[:3]:  # Cap at 3 languages to avoid too-complex queries
        mapped = LANGUAGE_MAP.get(lang.lower(), lang.lower())
        lang_queries.append(f"language:{mapped}")

    # Combine into final query
    # no:assignee = unassigned issues (more likely to be available)
    # is:open is:issue = only open issues (not PRs)
    lang_part = " ".join(lang_queries) if lang_queries else "language:python"
    query = f"is:open is:issue {label_queries} {lang_part} no:assignee"

    params = {
        "q": query,
        "sort": "updated",       # Most recently active first
        "order": "desc",
        "per_page": per_page,
        "page": page,
    }

    from app.config import settings  # make sure this import is at the top

    headers = {
        "Accept": "application/vnd.github.v3+json",
        # We use unauthenticated requests for now — 60 req/hr limit
        # Once you add a GitHub token to .env, uncomment this:
        "Authorization": f"Bearer {settings.github_token}",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            "https://api.github.com/search/issues",
            params=params,
            headers=headers,
        )

        if response.status_code == 403:
            raise HTTPException(
                status_code=429,
                detail="GitHub API rate limit reached. Try again in a minute.",
            )
        if response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"GitHub API error: {response.status_code}",
            )

        return response.json()


def parse_github_issue(item: dict, level: str) -> dict:
    """
    Converts a raw GitHub API issue object into our Issue shape.
    Extracts repo owner/name from the repository_url field.
    """
    # repository_url looks like: https://api.github.com/repos/facebook/react
    repo_url = item.get("repository_url", "")
    parts = repo_url.rstrip("/").split("/")
    repo_owner = parts[-2] if len(parts) >= 2 else "unknown"
    repo_name = parts[-1] if len(parts) >= 1 else "unknown"

    labels = [
        {"name": lbl["name"], "color": lbl["color"]}
        for lbl in item.get("labels", [])
    ]

    # Rough difficulty mapping based on labels present
    label_names = [l["name"].lower() for l in item.get("labels", [])]
    if any(l in label_names for l in ["good first issue", "beginner", "easy", "starter"]):
        difficulty = "beginner"
    elif any(l in label_names for l in ["intermediate", "medium"]):
        difficulty = "intermediate"
    elif any(l in label_names for l in ["advanced", "hard", "complex"]):
        difficulty = "advanced"
    else:
        difficulty = level  # Fall back to what the user requested

    return {
        "github_issue_id": item["id"],
        "github_issue_number": item["number"],
        "repo_owner": repo_owner,
        "repo_name": repo_name,
        "title": item["title"],
        "body": item.get("body") or "",
        "labels": labels,
        "difficulty": difficulty,
        "estimated_hours": None,  # Will be set by AI analysis later
        "comment_count": item.get("comments", 0),
        "html_url": item["html_url"],
        "created_at": item["created_at"],
    }


def get_or_cache_issue(db: Session, issue_data: dict) -> Issue:
    existing = db.query(Issue).filter(
        Issue.github_issue_id == issue_data["github_issue_id"]
    ).first()

    if existing:
        return existing

    try:
        issue = Issue(
            github_issue_id=issue_data["github_issue_id"],
            github_issue_number=issue_data["github_issue_number"],
            repo_owner=issue_data["repo_owner"],
            repo_name=issue_data["repo_name"],
            title=issue_data["title"],
            body=issue_data["body"],
            labels=issue_data["labels"],
            difficulty=issue_data["difficulty"],
            estimated_hours=issue_data["estimated_hours"],
            comment_count=issue_data["comment_count"],
            html_url=issue_data["html_url"],
            created_at=datetime.fromisoformat(
                issue_data["created_at"].replace("Z", "+00:00")
            ).replace(tzinfo=None),
        )
        db.add(issue)
        db.commit()
        db.refresh(issue)
        return issue
    except Exception as e:
        db.rollback()
        print(f"❌ Failed to cache issue {issue_data['github_issue_id']}: {e}")
        # Re-fetch in case of race condition
        existing = db.query(Issue).filter(
            Issue.github_issue_id == issue_data["github_issue_id"]
        ).first()
        return existing


# ── GET /issues/discover ──────────────────────────────────────
@router.get("/discover")
async def discover_issues(
    # Query parameters from the frontend filters
    languages: Optional[str] = Query(None, description="Comma-separated: python,typescript"),
    level: Optional[str] = Query("beginner"),
    time_available: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=30),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Main discovery endpoint. Called by the Discover page.

    If the user has skill_tags on their profile, we use those.
    The frontend can also pass ?languages=python,typescript to override.
    """
    # Resolve which languages to search
    # Frontend filter overrides profile, profile overrides default
    if languages:
        lang_list = [l.strip() for l in languages.split(",") if l.strip()]
    elif current_user.skill_tags:
        lang_list = current_user.skill_tags
    else:
        lang_list = ["python"]  # Sensible default

    # Use profile's experience level if not overridden by query param
    effective_level = level or current_user.experience_level or "beginner"

    # Fetch from GitHub
    github_data = await search_github_issues(
        languages=lang_list,
        level=effective_level,
        time_available=time_available,
        page=page,
        per_page=per_page,
    )

    items = github_data.get("items", [])
    total_count = github_data.get("total_count", 0)

    # Cache issues in our DB + build response
    result_issues = []
    # Get the set of issue IDs the user has already saved
    saved_issue_ids = set()
    if items:
        github_ids = [item["id"] for item in items]
        # Find which ones this user has already saved
        saved = (
            db.query(UserIssue.issue_id)
            .join(Issue, Issue.id == UserIssue.issue_id)
            .filter(
                UserIssue.user_id == current_user.id,
                Issue.github_issue_id.in_(github_ids),
            )
            .all()
        )
        saved_issue_ids = {str(row[0]) for row in saved}

    for item in items:
        parsed = parse_github_issue(item, effective_level)
        db_issue = get_or_cache_issue(db, parsed)
        if db_issue is None:
            continue

        result_issues.append({
            "id": str(db_issue.id),
            "github_issue_number": db_issue.github_issue_number,
            "repo_owner": db_issue.repo_owner,
            "repo_name": db_issue.repo_name,
            "title": db_issue.title,
            "body": (db_issue.body or "")[:500],  # Truncate for list view
            "labels": db_issue.labels,
            "difficulty": db_issue.difficulty,
            "estimated_hours": db_issue.estimated_hours,
            "comment_count": db_issue.comment_count,
            "html_url": db_issue.html_url,
            "created_at": db_issue.created_at.isoformat(),
            "is_saved": str(db_issue.id) in saved_issue_ids,
            "full_name": f"{db_issue.repo_owner}/{db_issue.repo_name}",
        })

    return {
        "items": result_issues,
        "total": min(total_count, 1000),  # GitHub caps at 1000
        "page": page,
        "per_page": per_page,
        "has_next": page * per_page < min(total_count, 1000),
        "query_languages": lang_list,
        "query_level": effective_level,
    }


# ── GET /issues/{issue_id} ────────────────────────────────────
@router.get("/{issue_id}")
def get_issue(
    issue_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns a single issue by our internal UUID.
    Used by the issue detail page.
    """
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    # Check if user has saved this issue
    user_issue = (
        db.query(UserIssue)
        .filter(
            UserIssue.user_id == current_user.id,
            UserIssue.issue_id == issue.id,
        )
        .first()
    )

    return {
        "id": str(issue.id),
        "github_issue_number": issue.github_issue_number,
        "repo_owner": issue.repo_owner,
        "repo_name": issue.repo_name,
        "title": issue.title,
        "body": issue.body,
        "labels": issue.labels,
        "difficulty": issue.difficulty,
        "estimated_hours": issue.estimated_hours,
        "comment_count": issue.comment_count,
        "html_url": issue.html_url,
        "created_at": issue.created_at.isoformat(),
        "full_name": f"{issue.repo_owner}/{issue.repo_name}",
        "analysis": issue.analysis_cache,  # None until AI runs
        "user_issue": {
            "status": user_issue.status,
            "pr_url": user_issue.pr_url,
            "notes": user_issue.notes,
            "checklist_progress": user_issue.checklist_progress,
        } if user_issue else None,
    }


# ── POST /issues/{issue_id}/save ──────────────────────────────
@router.post("/{issue_id}/save")
def save_issue(
    issue_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Saves an issue to the user's dashboard.
    If already saved, returns the existing record (idempotent).
    """
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    # Check if already saved
    existing = (
        db.query(UserIssue)
        .filter(
            UserIssue.user_id == current_user.id,
            UserIssue.issue_id == issue.id,
        )
        .first()
    )

    if existing:
        return {
            "message": "Already saved",
            "status": existing.status,
            "user_issue_id": str(existing.id),
        }

    user_issue = UserIssue(
        user_id=current_user.id,
        issue_id=issue.id,
        status="saved",
    )
    db.add(user_issue)
    db.commit()

    return {
        "message": "Issue saved",
        "status": "saved",
        "user_issue_id": str(user_issue.id),
    }


# ── DELETE /issues/{issue_id}/save ────────────────────────────
@router.delete("/{issue_id}/save")
def unsave_issue(
    issue_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Removes an issue from the user's dashboard.
    """
    user_issue = (
        db.query(UserIssue)
        .filter(
            UserIssue.user_id == current_user.id,
            UserIssue.issue_id == issue_id,
        )
        .first()
    )

    if not user_issue:
        raise HTTPException(status_code=404, detail="Issue not found in saved list")

    db.delete(user_issue)
    db.commit()

    return {"message": "Issue removed"}


# ============================================================
# ADD THESE TO THE BOTTOM OF app/routers/issues.py
# ============================================================
# Also add this import at the TOP of issues.py:
#   from datetime import datetime  (already there)
#   from app.services.gemini import analyze_issue  (ADD THIS)
# ============================================================


# ── GET /issues/{issue_id}/analysis ───────────────────────────
@router.get("/{issue_id}/analysis")
async def get_issue_analysis(
    issue_id: str,
    force_refresh: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns AI analysis for an issue.
    
    If analysis is cached in the DB and less than 7 days old,
    returns the cached version (fast, no API call).
    
    If not cached or force_refresh=True, calls Gemini to generate
    a fresh analysis and caches it.
    """
    from app.services.gemini import analyze_issue

    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    # Check if we have a fresh cached analysis
    if (
        not force_refresh
        and issue.analysis_cache
        and issue.analysis_generated_at
    ):
        from datetime import timedelta
        age = datetime.utcnow() - issue.analysis_generated_at
        if age.days < 7:
            return {
                "issue_id": issue_id,
                "cached": True,
                "generated_at": issue.analysis_generated_at.isoformat(),
                **issue.analysis_cache,
            }

    # No cache or stale — call Gemini
    if not settings.google_api_key:
        raise HTTPException(
            status_code=503,
            detail="AI analysis not configured. Add GOOGLE_API_KEY to .env",
        )

    analysis = await analyze_issue(
        title=issue.title,
        body=issue.body or "",
        repo_owner=issue.repo_owner,
        repo_name=issue.repo_name,
        labels=issue.labels or [],
    )

    if not analysis:
        raise HTTPException(
            status_code=502,
            detail="AI analysis failed. Please try again.",
        )

    # Cache the result in DB
    issue.analysis_cache = analysis
    issue.analysis_generated_at = datetime.utcnow()
    db.commit()

    return {
        "issue_id": issue_id,
        "cached": False,
        "generated_at": issue.analysis_generated_at.isoformat(),
        **analysis,
    }