# ============================================================
# app/models/user.py
# ============================================================
# This defines the `users` table in your database.
#
# SQLAlchemy ORM works like this:
# - Each class = one database table
# - Each class attribute = one column in that table
# - You never write SQL — you work with Python objects
#
# When you call `alembic revision --autogenerate`, Alembic
# reads this class and generates the SQL to create the table.
# ============================================================

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, ARRAY, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    # ── Table name ───────────────────────────────────────────
    __tablename__ = "users"

    # ── Primary key ──────────────────────────────────────────
    # We use UUID instead of integer IDs.
    # Why? UUIDs are globally unique — no collision risk if you
    # ever merge data from multiple sources.
    # default= means SQLAlchemy generates this automatically.
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    # ── GitHub identity ──────────────────────────────────────
    # github_id is the permanent numeric ID GitHub assigns.
    # Even if someone changes their username, github_id stays
    # the same — so we use it to identify returning users.
    github_id = Column(Integer, unique=True, nullable=False, index=True)
    username = Column(String, nullable=False)          # e.g. "rutuja"
    email = Column(String, nullable=True)              # GitHub may hide this
    avatar_url = Column(String, nullable=True)         # Profile picture URL

    # ── Skill profile ────────────────────────────────────────
    # ARRAY(String) stores a list of strings in one column.
    # e.g. ["python", "typescript", "react"]
    # PostgreSQL supports this natively — no join table needed.
    skill_tags = Column(ARRAY(String), default=list, nullable=False)

    # Experience level — validated at the API layer (Pydantic)
    experience_level = Column(
        String,
        default="beginner",
        nullable=False,
    )  # "beginner" | "intermediate" | "advanced"

    # ── Flags ────────────────────────────────────────────────
    is_active = Column(Boolean, default=True, nullable=False)

    # ── Timestamps ───────────────────────────────────────────
    # default=datetime.utcnow runs once when the row is created
    # onupdate=datetime.utcnow runs every time the row is updated
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    # ── Relationships ────────────────────────────────────────
    # This creates a Python shortcut: user.saved_issues
    # SQLAlchemy handles the JOIN automatically.
    # "UserIssue" refers to the model in issue.py
    saved_issues = relationship(
        "UserIssue",
        back_populates="user",
        cascade="all, delete-orphan",  # Delete UserIssues when User is deleted
    )

    def __repr__(self):
        return f"<User {self.username} (github_id={self.github_id})>"