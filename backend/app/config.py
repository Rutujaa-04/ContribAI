# ============================================================
# app/config.py
# ============================================================
# This file reads ALL your .env variables into a single
# typed Python object called `settings`.
#
# Why do this instead of os.getenv() everywhere?
# 1. Type safety — if DATABASE_URL is missing, it crashes
#    immediately with a clear error instead of failing later
# 2. One import — every file does `from app.config import settings`
# 3. Validation — pydantic checks types on startup
#
# Usage in any other file:
#   from app.config import settings
#   print(settings.database_url)
# ============================================================

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────
    # Full PostgreSQL connection string
    # Format: postgresql://user:password@host:port/dbname
    database_url: str

    # ── AI APIs ───────────────────────────────────────────────
    # Google Gemini API key — get from aistudio.google.com
    # Used for both LLM calls and embeddings (free tier)
    google_api_key: str = ""          # Optional until Week 2

    # ── GitHub OAuth ──────────────────────────────────────────
    # Same values as your frontend .env.local
    github_client_id: str
    github_client_secret: str
    github_token: str = ""   # Optional — increases rate limit from 60 to 5000/hr

    # ── JWT (your own tokens) ─────────────────────────────────
    # Used to sign the tokens you give to your frontend
    # Generate with: openssl rand -base64 32
    secret_key: str
    algorithm: str = "HS256"           # JWT signing algorithm
    access_token_expire_minutes: int = 60 * 24 * 30  # 30 days

    # ── CORS ──────────────────────────────────────────────────
    # Your frontend URL — needed to allow cross-origin requests
    frontend_url: str = "http://localhost:3000"

    # ── App ───────────────────────────────────────────────────
    app_name: str = "ContribAI"
    debug: bool = True                 # Set False in production

    class Config:
        # Tell pydantic-settings to read from .env file
        env_file = ".env"
        env_file_encoding = "utf-8"
        # Allow extra fields in .env without crashing
        extra = "ignore"


# ── Singleton pattern ───────────────────────────────────────
# @lru_cache means this function only runs ONCE.
# Every subsequent call returns the same Settings object.
# This is important — you don't want to re-read the .env
# file on every single request.
@lru_cache()
def get_settings() -> Settings:
    return Settings()


# Convenience export — import this directly in other files
# Usage: from app.config import settings
settings = get_settings()