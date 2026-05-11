# ============================================================
# app/models/__init__.py
# ============================================================
# This file does one critical job: imports all your models
# so that SQLAlchemy and Alembic can "see" them.
#
# When Alembic generates migrations, it scans Base.metadata
# to find all tables. But it can only find them if the model
# files have been imported first.
#
# Without this file, running `alembic revision --autogenerate`
# would generate an EMPTY migration — no tables created.
# ============================================================

from app.models.user import User
from app.models.issue import Issue, UserIssue

# If you add a new model file later (e.g. models/repository.py),
# import it here too:
# from app.models.repository import Repository

__all__ = ["User", "Issue", "UserIssue"]