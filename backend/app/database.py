# ============================================================
# app/database.py
# ============================================================
# This file sets up everything SQLAlchemy needs to talk to
# your PostgreSQL database.
#
# Three things it creates:
# 1. `engine`       — the actual connection to PostgreSQL
# 2. `SessionLocal` — a factory that creates DB sessions
# 3. `Base`         — the parent class all your models inherit
#
# And one helper:
# 4. `get_db()`     — a FastAPI dependency that gives each
#                     request its own DB session, then closes
#                     it when the request is done
# ============================================================

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

# ── Engine ──────────────────────────────────────────────────
# The engine manages the pool of connections to PostgreSQL.
# `check_same_thread=False` is only needed for SQLite.
# For PostgreSQL we set pool_pre_ping=True which tests the
# connection before using it (handles dropped connections).
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,      # Test connection before using from pool
    pool_size=5,             # Keep 5 connections open
    max_overflow=10,         # Allow 10 extra connections when busy
    echo=settings.debug,     # Log all SQL queries in development
)

# ── Session factory ─────────────────────────────────────────
# SessionLocal is a class. Calling SessionLocal() creates a
# new database session. Each request gets its own session.
#
# autocommit=False — we manually commit (more control)
# autoflush=False  — we manually flush (prevents surprise queries)
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# ── Base class ──────────────────────────────────────────────
# All your ORM models (User, Issue, Repository) will inherit
# from this Base. SQLAlchemy uses it to track all your tables.
Base = declarative_base()


# ── get_db dependency ───────────────────────────────────────
# This is a FastAPI "dependency" — a function that runs before
# your route handler and provides it with a DB session.
#
# The `yield` makes it a generator:
# - Code before yield runs BEFORE the route handler
# - Code after yield runs AFTER (cleanup)
#
# Usage in a router:
#   from app.database import get_db
#   from sqlalchemy.orm import Session
#
#   @router.get("/something")
#   def my_route(db: Session = Depends(get_db)):
#       users = db.query(User).all()
#       return users
def get_db():
    db = SessionLocal()
    try:
        yield db          # Give the session to the route handler
    finally:
        db.close()        # Always close, even if an error occurred