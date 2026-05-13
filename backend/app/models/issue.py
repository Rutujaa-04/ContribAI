# ============================================================
# app/models/issue.py
# ============================================================
# Two models in this file:
#
# 1. Issue — caches GitHub issue data + AI analysis results
#    so we don't call GitHub/Gemini on every page load
#
# 2. UserIssue — the join table between users and issues.
#    Tracks which user saved which issue, and what their
#    current contribution status is.
# ============================================================

import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, BigInteger, DateTime, Text,
    ForeignKey, Float, Boolean
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base


# ── Issue ───────────────────────────────────────────────────
class Issue(Base):
    __tablename__ = "issues"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # ── GitHub identifiers ───────────────────────────────────
    github_issue_id = Column(BigInteger, unique=True, nullable=False, index=True)
    github_issue_number = Column(Integer, nullable=False)

    # Which repo this issue belongs to
    repo_owner = Column(String, nullable=False, index=True)   # e.g. "facebook"
    repo_name = Column(String, nullable=False, index=True)    # e.g. "react"

    # ── Issue content ────────────────────────────────────────
    title = Column(String, nullable=False)
    body = Column(Text, nullable=True)          # Issue description (can be long)

    # JSONB stores JSON natively in PostgreSQL — fast and queryable
    # Stores: [{"name": "good first issue", "color": "7057ff"}, ...]
    labels = Column(JSONB, default=list, nullable=False)

    # ── Scoring ──────────────────────────────────────────────
    # "beginner" | "intermediate" | "advanced" | "unknown"
    difficulty = Column(String, default="unknown", nullable=False)
    estimated_hours = Column(Float, nullable=True)   # e.g. 2.5
    comment_count = Column(Integer, default=0, nullable=False)

    # ── GitHub metadata ──────────────────────────────────────
    html_url = Column(String, nullable=False)    # Link to GitHub issue
    created_at = Column(DateTime, nullable=False)
    cached_at = Column(DateTime, default=datetime.utcnow)  # When WE cached it

    # ── AI Analysis cache ────────────────────────────────────
    # We store the full analysis as JSONB so we don't call
    # Gemini every time someone views the same issue.
    # Stores the full IssueAnalysis object as JSON.
    analysis_cache = Column(JSONB, nullable=True)
    analysis_generated_at = Column(DateTime, nullable=True)

    # ── Relationships ────────────────────────────────────────
    saved_by = relationship(
        "UserIssue",
        back_populates="issue",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<Issue #{self.github_issue_number} in {self.repo_owner}/{self.repo_name}>"


# ── UserIssue ───────────────────────────────────────────────
# This is the JOIN TABLE between User and Issue.
# It doesn't just link them — it also stores the user's
# contribution progress for that specific issue.
class UserIssue(Base):
    __tablename__ = "user_issues"

    # ── Composite-style primary key using UUID ───────────────
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign keys — link to users and issues tables
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    issue_id = Column(
        UUID(as_uuid=True),
        ForeignKey("issues.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Contribution tracking ────────────────────────────────
    # The user's current status on this issue
    # "saved" → "in_progress" → "submitted" → "merged" / "closed"
    status = Column(String, default="saved", nullable=False)

    # If they submitted a PR, store the URL here
    pr_url = Column(String, nullable=True)

    # User's personal notes on this issue
    notes = Column(Text, nullable=True)

    # ── Checklist progress ───────────────────────────────────
    # Stores which implementation steps the user has checked off
    # e.g. {"step_1": true, "step_2": false, "step_3": false}
    checklist_progress = Column(JSONB, default=dict, nullable=False)

    # ── Timestamps ───────────────────────────────────────────
    saved_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    # ── Relationships ────────────────────────────────────────
    # These let you do: user_issue.user.username
    # and: user_issue.issue.title
    user = relationship("User", back_populates="saved_issues")
    issue = relationship("Issue", back_populates="saved_by")

    def __repr__(self):
        return f"<UserIssue user={self.user_id} issue={self.issue_id} status={self.status}>"