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
from sqlalchemy import func
from pydantic import BaseModel

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.issue import Issue, UserIssue
from app.models.repository import Repository
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
    }
    if settings.github_token and settings.github_token.strip():
        headers["Authorization"] = f"Bearer {settings.github_token.strip()}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            "https://api.github.com/search/issues",
            params=params,
            headers=headers,
        )

        if response.status_code in [403, 429]:
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
        # Update difficulty and estimated_hours if they differ
        updated = False
        if existing.difficulty != issue_data["difficulty"]:
            existing.difficulty = issue_data["difficulty"]
            updated = True
        if existing.estimated_hours != issue_data["estimated_hours"]:
            existing.estimated_hours = issue_data["estimated_hours"]
            updated = True
        if updated:
            try:
                db.commit()
                db.refresh(existing)
            except Exception:
                db.rollback()
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


# ── Recommendation scoring ────────────────────────────────────

def compute_recommendation_score(
    issue_data: dict,
    user: User,
    user_repo_counts: dict,
    db: Session,
) -> float:
    """
    Compute 0–100 recommendation score for a user+issue pair.

    Factors (weights sum to 100):
      language_match   35  — repo language ∈ user's skill_tags
      difficulty_match  25  — issue difficulty ≈ user's experience_level
      repo_familiarity  20  — user has saved issues from this repo before
      recency_bonus     10  — issue was created/updated recently
      community_signal  10  — low comment count = less competition
    """
    score = 0.0

    repo_key = f"{issue_data['repo_owner']}/{issue_data['repo_name']}"

    # 1. Language match (35 pts)
    repo = db.query(Repository).filter(Repository.full_name == repo_key).first()
    user_tags = [t.lower() for t in (user.skill_tags or [])]
    if repo and repo.primary_language:
        lang = repo.primary_language.lower()
        if lang in user_tags:
            score += 35.0
        elif any(tag in lang or lang in tag for tag in user_tags):
            score += 15.0  # Partial match (e.g. user knows "react", repo is "javascript")

    # 2. Difficulty match (25 pts)
    difficulty = issue_data.get("difficulty", "unknown")
    user_level = user.experience_level or "beginner"
    LEVEL_ORDER = {"beginner": 0, "intermediate": 1, "advanced": 2}
    diff_distance = abs(LEVEL_ORDER.get(difficulty, 1) - LEVEL_ORDER.get(user_level, 0))
    score += {0: 25.0, 1: 12.0, 2: 0.0}.get(diff_distance, 0.0)

    # 3. Repo familiarity (20 pts)
    repo_count = user_repo_counts.get(repo_key, 0)
    score += min(repo_count / 3.0, 1.0) * 20.0

    # 4. Recency (10 pts)
    created_at = issue_data.get("created_at", "")
    if created_at:
        try:
            age_days = (datetime.utcnow() - datetime.fromisoformat(
                created_at.replace("Z", "+00:00")
            ).replace(tzinfo=None)).days
            if age_days < 7:
                score += 10.0
            elif age_days < 30:
                score += 6.0
            elif age_days < 90:
                score += 2.0
        except Exception:
            pass

    # 5. Community signal (10 pts) — fewer comments = less competition
    comments = issue_data.get("comment_count", 0)
    if comments <= 2:
        score += 10.0
    elif comments <= 5:
        score += 7.0
    elif comments <= 10:
        score += 4.0
    elif comments <= 20:
        score += 1.0

    return round(score, 1)


def _get_user_repo_counts(user_id, db: Session) -> dict:
    """
    Returns {"owner/repo": count} of how many issues the user has
    saved/interacted with in each repo. Used for repo_familiarity scoring.
    """
    rows = (
        db.query(
            Issue.repo_owner,
            Issue.repo_name,
            func.count(UserIssue.id),
        )
        .join(Issue, Issue.id == UserIssue.issue_id)
        .filter(UserIssue.user_id == user_id)
        .group_by(Issue.repo_owner, Issue.repo_name)
        .all()
    )
    return {f"{r[0]}/{r[1]}": r[2] for r in rows}


# ── GET /issues/discover ──────────────────────────────────────
@router.get("/discover")
async def discover_issues(
    # Query parameters from the frontend filters
    languages: Optional[str] = Query(None, description="Comma-separated: python,typescript"),
    level: Optional[str] = Query("beginner"),
    time_available: Optional[int] = Query(None),
    sort: Optional[str] = Query("recommended", description="recommended|newest|updated"),
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=30),
    refresh: bool = Query(False),
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

    # 1. Database-First Cache Lookup (Fast Path)
    if not refresh:
        from app.models.repository import Repository
        from sqlalchemy import or_

        # Build local DB query matching effective difficulty
        query_db = db.query(Issue).filter(Issue.difficulty == effective_level)

        # Join with Repository case-insensitively to match language
        query_db = query_db.join(
            Repository,
            (func.lower(Repository.owner) == func.lower(Issue.repo_owner)) &
            (func.lower(Repository.name) == func.lower(Issue.repo_name))
        )

        lang_filters = [Repository.primary_language.ilike(f"%{lang}%") for lang in lang_list]
        if lang_filters:
            query_db = query_db.filter(or_(*lang_filters))

        total_count = query_db.count()

        # If cache has a healthy amount of matching issues, return them instantly!
        if total_count >= 10:
            db_issues = query_db.offset((page - 1) * per_page).limit(per_page).all()

            # Build saved_issue_ids for checking saved state
            saved_issue_ids = set()
            if db_issues:
                db_issue_ids = [db_iss.id for db_iss in db_issues]
                saved = (
                    db.query(UserIssue.issue_id)
                    .filter(
                        UserIssue.user_id == current_user.id,
                        UserIssue.issue_id.in_(db_issue_ids)
                    )
                    .all()
                )
                saved_issue_ids = {str(row[0]) for row in saved}

            # Pre-fetch user's repo interaction counts for recommendation scoring
            user_repo_counts = _get_user_repo_counts(current_user.id, db)

            result_issues = []
            for db_issue in db_issues:
                rec_score = compute_recommendation_score(
                    issue_data={
                        "repo_owner": db_issue.repo_owner,
                        "repo_name": db_issue.repo_name,
                        "difficulty": db_issue.difficulty,
                        "created_at": db_issue.created_at.isoformat(),
                        "comment_count": db_issue.comment_count,
                    },
                    user=current_user,
                    user_repo_counts=user_repo_counts,
                    db=db,
                )
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
                    "recommendation_score": rec_score,
                    "recommended": rec_score >= 70,
                })

            # Sort
            effective_sort = sort or "recommended"
            if effective_sort == "recommended":
                result_issues.sort(key=lambda x: x.get("recommendation_score", 0), reverse=True)
            elif effective_sort == "newest":
                result_issues.sort(key=lambda x: x.get("created_at", ""), reverse=True)

            return {
                "items": result_issues,
                "total": total_count,
                "page": page,
                "per_page": per_page,
                "has_next": page * per_page < total_count,
                "query_languages": lang_list,
                "query_level": effective_level,
                "sort": effective_sort,
                "using_cache": True,
            }

    # 2. Live GitHub Fetch (Cache Miss or Forced Refresh)
    use_fallback = False
    try:
        github_data = await search_github_issues(
            languages=lang_list,
            level=effective_level,
            time_available=time_available,
            page=page,
            per_page=per_page,
        )
        items = github_data.get("items", [])
        total_count = github_data.get("total_count", 0)
    except HTTPException as e:
        if e.status_code == 429:
            use_fallback = True
        else:
            raise e

    result_issues = []

    if use_fallback:
        from app.models.repository import Repository
        from sqlalchemy import or_

        # Build local DB query
        query_db = db.query(Issue).filter(Issue.difficulty == effective_level)

        # Join with Repository case-insensitively to match language
        query_db = query_db.join(
            Repository,
            (func.lower(Repository.owner) == func.lower(Issue.repo_owner)) &
            (func.lower(Repository.name) == func.lower(Issue.repo_name))
        )

        lang_filters = [Repository.primary_language.ilike(f"%{lang}%") for lang in lang_list]
        if lang_filters:
            query_db = query_db.filter(or_(*lang_filters))

        # Get total count and paginate
        total_count = query_db.count()
        db_issues = query_db.offset((page - 1) * per_page).limit(per_page).all()

        # Build saved_issue_ids for checking saved state
        saved_issue_ids = set()
        if db_issues:
            db_issue_ids = [db_iss.id for db_iss in db_issues]
            saved = (
                db.query(UserIssue.issue_id)
                .filter(
                    UserIssue.user_id == current_user.id,
                    UserIssue.issue_id.in_(db_issue_ids)
                )
                .all()
            )
            saved_issue_ids = {str(row[0]) for row in saved}

        # Pre-fetch user's repo interaction counts for recommendation scoring
        user_repo_counts = _get_user_repo_counts(current_user.id, db)

        # Build result_issues directly from DB issues
        for db_issue in db_issues:
            rec_score = compute_recommendation_score(
                issue_data={
                    "repo_owner": db_issue.repo_owner,
                    "repo_name": db_issue.repo_name,
                    "difficulty": db_issue.difficulty,
                    "created_at": db_issue.created_at.isoformat(),
                    "comment_count": db_issue.comment_count,
                },
                user=current_user,
                user_repo_counts=user_repo_counts,
                db=db,
            )
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
                "recommendation_score": rec_score,
                "recommended": rec_score >= 70,
            })

        # Sort by recommendation score in fallback mode too
        effective_sort = sort or "recommended"
        if effective_sort == "recommended":
            result_issues.sort(key=lambda x: x.get("recommendation_score", 0), reverse=True)
        elif effective_sort == "newest":
            result_issues.sort(key=lambda x: x.get("created_at", ""), reverse=True)

        return {
            "items": result_issues,
            "total": total_count,
            "page": page,
            "per_page": per_page,
            "using_fallback": True,
            "sort": effective_sort,
        }

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

    # Pre-fetch user's repo interaction counts for recommendation scoring
    user_repo_counts = _get_user_repo_counts(current_user.id, db)

    from app.routers.repos import compute_difficulty_score

    for item in items:
        parsed = parse_github_issue(item, effective_level)
        try:
            diff_res = await compute_difficulty_score(
                owner=parsed["repo_owner"],
                repo=parsed["repo_name"],
                issue_number=parsed["github_issue_number"],
                labels=parsed["labels"],
                comment_count=parsed["comment_count"],
            )
            parsed["difficulty"] = diff_res["difficulty"]
            parsed["estimated_hours"] = diff_res["estimated_hours"]
        except Exception as e:
            print(f"⚠️ Failed to compute dynamic difficulty: {e}")

        db_issue = get_or_cache_issue(db, parsed)
        if db_issue is None:
            continue

        # Compute recommendation score for this issue
        rec_score = compute_recommendation_score(
            issue_data={
                "repo_owner": db_issue.repo_owner,
                "repo_name": db_issue.repo_name,
                "difficulty": db_issue.difficulty,
                "created_at": db_issue.created_at.isoformat(),
                "comment_count": db_issue.comment_count,
            },
            user=current_user,
            user_repo_counts=user_repo_counts,
            db=db,
        )

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
            "recommendation_score": rec_score,
            "recommended": rec_score >= 70,
        })

    # Sort by recommendation score if requested
    effective_sort = sort or "recommended"
    if effective_sort == "recommended":
        result_issues.sort(key=lambda x: x.get("recommendation_score", 0), reverse=True)
    elif effective_sort == "newest":
        result_issues.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    # "updated" keeps GitHub's default sort order

    return {
        "items": result_issues,
        "total": min(total_count, 1000),  # GitHub caps at 1000
        "page": page,
        "per_page": per_page,
        "has_next": page * per_page < min(total_count, 1000),
        "query_languages": lang_list,
        "query_level": effective_level,
        "sort": effective_sort,
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
        "pr_competition": issue.pr_competition,  # None if never checked
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


# ── PR Competition Detection ──────────────────────────────────

async def check_github_prs(
    owner: str, repo: str, issue_number: int
) -> dict:
    """
    Searches GitHub for PRs that reference this issue number.
    Uses the search API: is:pr repo:owner/repo "#N" in:title,body
    Returns {total_prs, open_prs, prs: [{number, title, state, user, html_url, created_at}]}
    """
    headers = {"Accept": "application/vnd.github.v3+json"}
    if settings.github_token and settings.github_token.strip():
        headers["Authorization"] = f"Bearer {settings.github_token.strip()}"

    query = f'is:pr repo:{owner}/{repo} "#{issue_number}" in:title,body'

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.github.com/search/issues",
                params={"q": query, "per_page": 5},
                headers=headers,
            )

            if resp.status_code != 200:
                return {"total_prs": 0, "open_prs": 0, "prs": [], "checked": True}

            data = resp.json()
            items = data.get("items", [])

            # Filter to only PRs that actually reference this issue number
            ref = f"#{issue_number}"
            prs = []
            for item in items:
                body = (item.get("body") or "").lower()
                title = (item.get("title") or "").lower()
                if ref.lower() in body or ref.lower() in title:
                    prs.append({
                        "number": item["number"],
                        "title": item["title"],
                        "state": item["state"],
                        "user": item["user"]["login"],
                        "html_url": item["html_url"],
                        "created_at": item["created_at"],
                    })

            return {
                "total_prs": len(prs),
                "open_prs": sum(1 for p in prs if p["state"] == "open"),
                "prs": prs,
                "checked": True,
            }
    except Exception as e:
        print(f"⚠️ PR competition check failed: {e}")
        return {"total_prs": 0, "open_prs": 0, "prs": [], "checked": False}


# ── GET /issues/{issue_id}/pr-status ──────────────────────────
@router.get("/{issue_id}/pr-status")
async def get_pr_competition(
    issue_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Checks if any existing PRs reference this issue on GitHub.
    Caches result for 1 hour to avoid rate limits.
    Shows users if an issue is already being worked on.
    """
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    # Return cache if fresh (1 hour)
    if issue.pr_competition and issue.pr_competition_checked_at:
        age = datetime.utcnow() - issue.pr_competition_checked_at
        if age.total_seconds() < 3600:
            return issue.pr_competition

    # Query GitHub for PRs referencing this issue
    result = await check_github_prs(
        issue.repo_owner, issue.repo_name, issue.github_issue_number
    )

    # Cache the result
    issue.pr_competition = result
    issue.pr_competition_checked_at = datetime.utcnow()
    try:
        db.commit()
    except Exception:
        db.rollback()

    return result


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
    from app.services.rag_analysis import analyze_issue_with_rag
    from datetime import timedelta

    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    # Return cache if fresh (7 days)
    if not force_refresh and issue.analysis_cache and issue.analysis_generated_at:
        age = datetime.utcnow() - issue.analysis_generated_at
        if age.days < 7:
            return {
                "issue_id": issue_id,
                "cached": True,
                "generated_at": issue.analysis_generated_at.isoformat(),
                **issue.analysis_cache,
            }

    analysis = await analyze_issue_with_rag(
        title=issue.title,
        body=issue.body or "",
        repo_owner=issue.repo_owner,
        repo_name=issue.repo_name,
        labels=issue.labels or [],
        db=db,
    )

    if not analysis:
        raise HTTPException(status_code=502, detail="AI analysis failed. Please try again.")

    issue.analysis_cache = analysis
    issue.analysis_generated_at = datetime.utcnow()
    db.commit()

    return {
        "issue_id": issue_id,
        "cached": False,
        "generated_at": issue.analysis_generated_at.isoformat(),
        **analysis,
    }

# ============================================================
# ADD THIS TO THE BOTTOM OF app/routers/issues.py
# ============================================================
# Also ensure this import is at the top of issues.py:
#   from pydantic import BaseModel
# ============================================================


class PRDraftRequest(BaseModel):
    user_summary: str  # What the user describes they did


class PRDraftResponse(BaseModel):
    title: str
    body: str


# ── POST /issues/{issue_id}/pr-draft ──────────────────────────
@router.post("/{issue_id}/pr-draft", response_model=PRDraftResponse)
async def generate_pr_draft(
    issue_id: str,
    request: PRDraftRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generates a PR title and description body for a given issue.

    Uses:
    - The issue title + body for context
    - The cached AI analysis (if available) for implementation details
    - The user's own summary of what they did

    Calls OpenRouter to produce a professional PR draft following
    standard open source conventions.
    """
    from openai import OpenAI

    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    if not request.user_summary.strip():
        raise HTTPException(status_code=400, detail="user_summary cannot be empty")

    # Pull cached analysis for extra context (optional — works without it)
    analysis_context = ""
    if issue.analysis_cache:
        cache = issue.analysis_cache
        explanation = cache.get("plain_explanation", "")
        steps = cache.get("implementation_steps", [])
        steps_text = "\n".join(
            f"- {s.get('title', '')}" for s in steps if isinstance(s, dict)
        )
        if explanation:
            analysis_context = f"\nAI breakdown of the issue:\n{explanation}"
        if steps_text:
            analysis_context += f"\nImplementation steps:\n{steps_text}"

    prompt = f"""You are helping a developer write a professional pull request for an open source project.

GITHUB ISSUE:
Title: {issue.title}
Repo: {issue.repo_owner}/{issue.repo_name}
Body: {(issue.body or '')[:1000]}
{analysis_context}

DEVELOPER'S DESCRIPTION OF WHAT THEY DID:
{request.user_summary}

Write a pull request title and description body following standard open source conventions.

Rules:
- Title: concise, imperative mood, under 72 characters (e.g. "Fix cache invalidation in user session handler")
- Body: use markdown. Include sections: ## Summary, ## Changes Made, ## Testing. Be specific but concise.
- Reference the issue number using "Fixes #{issue.github_issue_number}" in the Summary section.
- Do not invent code or details not mentioned by the developer — use their summary as the source of truth.
- Keep a professional but approachable tone.

Respond with ONLY a valid JSON object, no markdown fences:
{{
  "title": "PR title here",
  "body": "Full markdown PR body here"
}}"""

    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=settings.openrouter_api_key,
    )

    import json, re

    try:
        response = client.chat.completions.create(
            model="openrouter/auto",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
        )
        raw = response.choices[0].message.content.strip()

        # Strip markdown fences if model adds them
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
            raw = raw.strip()

        data = json.loads(raw)
        return PRDraftResponse(
            title=data.get("title", f"Fix: {issue.title[:60]}"),
            body=data.get("body", ""),
        )

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502,
            detail="AI returned an unexpected format. Please try again.",
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"PR draft generation failed: {str(e)}",
        )