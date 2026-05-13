# ============================================================
# app/routers/users.py
# ============================================================
# Handles all user-related endpoints:
#
#   GET  /users/me              → return logged-in user's profile
#   PATCH /users/me             → update skill_tags + experience_level
#   GET  /users/me/dashboard    → saved issues + stats
#
# All routes are protected — they require a valid JWT.
# ============================================================

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.issue import UserIssue

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────

class UpdateProfileRequest(BaseModel):
    skill_tags: Optional[List[str]] = None       # e.g. ["python", "typescript"]
    experience_level: Optional[str] = None        # "beginner" | "intermediate" | "advanced"

class UserResponse(BaseModel):
    id: str
    username: str
    email: Optional[str]
    avatar_url: Optional[str]
    skill_tags: List[str]
    experience_level: str
    created_at: str
    is_onboarded: bool  # True if they've set at least one skill

    class Config:
        from_attributes = True


# ── GET /users/me ─────────────────────────────────────────────
@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """
    Returns the currently logged-in user's profile.
    The frontend uses this to:
    - Show the user's name/avatar in the sidebar
    - Check if they've completed onboarding (skill_tags is empty → show modal)
    """
    return UserResponse(
        id=str(current_user.id),
        username=current_user.username,
        email=current_user.email,
        avatar_url=current_user.avatar_url,
        skill_tags=current_user.skill_tags or [],
        experience_level=current_user.experience_level,
        created_at=current_user.created_at.isoformat(),
        # is_onboarded = True if they have set at least one skill tag
        is_onboarded=bool(current_user.skill_tags),
    )


# ── PATCH /users/me ───────────────────────────────────────────
@router.patch("/me", response_model=UserResponse)
def update_profile(
    body: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Updates the user's skill profile.
    Called by the onboarding modal and profile settings page.

    Only updates fields that are provided — if skill_tags is None,
    we don't touch the existing value.
    """
    VALID_LEVELS = {"beginner", "intermediate", "advanced"}

    if body.experience_level is not None:
        if body.experience_level not in VALID_LEVELS:
            raise HTTPException(
                status_code=400,
                detail=f"experience_level must be one of {VALID_LEVELS}",
            )
        current_user.experience_level = body.experience_level

    if body.skill_tags is not None:
        # Lowercase and deduplicate tags
        current_user.skill_tags = list(set(tag.lower().strip() for tag in body.skill_tags))

    current_user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(current_user)

    return UserResponse(
        id=str(current_user.id),
        username=current_user.username,
        email=current_user.email,
        avatar_url=current_user.avatar_url,
        skill_tags=current_user.skill_tags or [],
        experience_level=current_user.experience_level,
        created_at=current_user.created_at.isoformat(),
        is_onboarded=bool(current_user.skill_tags),
    )


# ── GET /users/me/dashboard ───────────────────────────────────
@router.get("/me/dashboard")
def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns the user's dashboard data:
    - All their saved/tracked issues with full issue data
    - Stats (counts per status, streak)

    The frontend renders this as the "My Dashboard" page.
    """
    # Load all UserIssue rows for this user, with the related Issue eagerly loaded
    # joinedload avoids N+1 queries — fetches issues in one SQL JOIN
    user_issues = (
        db.query(UserIssue)
        .filter(UserIssue.user_id == current_user.id)
        .options(joinedload(UserIssue.issue))
        .order_by(UserIssue.updated_at.desc())
        .all()
    )

    # Build stats from the loaded data (no extra queries)
    stats = {
        "total_saved": len(user_issues),
        "in_progress": sum(1 for ui in user_issues if ui.status == "in_progress"),
        "submitted": sum(1 for ui in user_issues if ui.status == "submitted"),
        "merged": sum(1 for ui in user_issues if ui.status == "merged"),
        # Streak calculation is simplified for now — we'll enhance later
        "current_streak": 0,
        "longest_streak": 0,
    }

    # Serialize each UserIssue
    saved_issues = []
    for ui in user_issues:
        issue = ui.issue
        saved_issues.append({
            "user_issue_id": str(ui.id),
            "status": ui.status,
            "pr_url": ui.pr_url,
            "notes": ui.notes,
            "saved_at": ui.saved_at.isoformat(),
            "updated_at": ui.updated_at.isoformat(),
            "checklist_progress": ui.checklist_progress or {},
            "issue": {
                "id": str(issue.id),
                "github_issue_number": issue.github_issue_number,
                "repo_owner": issue.repo_owner,
                "repo_name": issue.repo_name,
                "title": issue.title,
                "labels": issue.labels,
                "difficulty": issue.difficulty,
                "estimated_hours": issue.estimated_hours,
                "comment_count": issue.comment_count,
                "html_url": issue.html_url,
                "created_at": issue.created_at.isoformat(),
            },
        })

    return {
        "stats": stats,
        "saved_issues": saved_issues,
    }


# ── PATCH /users/me/contributions/{issue_id} ──────────────────
@router.patch("/me/contributions/{issue_id}")
def update_contribution_status(
    issue_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Updates the status of a saved issue (e.g. saved → in_progress → submitted).
    Also optionally stores the PR URL.
    """
    VALID_STATUSES = {"saved", "in_progress", "submitted", "merged", "closed"}

    user_issue = (
        db.query(UserIssue)
        .filter(
            UserIssue.user_id == current_user.id,
            UserIssue.issue_id == issue_id,
        )
        .first()
    )

    if not user_issue:
        raise HTTPException(status_code=404, detail="Contribution not found")

    new_status = body.get("status")
    if new_status and new_status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {new_status}")

    if new_status:
        user_issue.status = new_status
    if "pr_url" in body:
        user_issue.pr_url = body["pr_url"]
    if "notes" in body:
        user_issue.notes = body["notes"]
    if "checklist_progress" in body:
        user_issue.checklist_progress = body["checklist_progress"]

    user_issue.updated_at = datetime.utcnow()
    db.commit()

    return {"message": "Updated", "status": user_issue.status}