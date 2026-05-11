# ============================================================
# app/main.py
# ============================================================
# This is the entry point for your entire FastAPI backend.
#
# What it does:
# 1. Creates the FastAPI application instance
# 2. Adds CORS middleware (allows your frontend to call it)
# 3. Creates database tables on startup (dev only)
# 4. Registers all your routers (auth, issues, repos, users)
# 5. Adds a health check endpoint so you can verify it's running
#
# To run: uvicorn app.main:app --reload --port 8000
# Then visit: http://localhost:8000/docs
# ============================================================

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.database import engine, Base

# ── Import all models before creating tables ─────────────────
# This ensures SQLAlchemy knows about all tables
# Must happen before Base.metadata.create_all()
from app.models import User, Issue, UserIssue  # noqa: F401

# ── Import routers ───────────────────────────────────────────
# We'll add these one by one as we build them.
# For now, only auth is imported. Uncomment others as you build.
from app.routers import auth
# from app.routers import issues   # uncomment in Week 2
# from app.routers import repos    # uncomment in Week 2
# from app.routers import users    # uncomment in Week 2


# ── Lifespan ─────────────────────────────────────────────────
# This runs on startup and shutdown.
# `asynccontextmanager` makes it work with FastAPI's lifespan.
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────
    print("🚀 Starting ContribAI backend...")

    # Create all tables that don't exist yet.
    # In production you'd use Alembic migrations instead,
    # but this is fine for development.
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables ready")

    yield  # App runs here

    # ── Shutdown ─────────────────────────────────────────────
    print("👋 Shutting down...")


# ── Create the FastAPI app ───────────────────────────────────
app = FastAPI(
    title="ContribAI API",
    description="AI-powered open source contribution guidance",
    version="0.1.0",
    lifespan=lifespan,
    # Only show docs in development
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)


# ── CORS Middleware ───────────────────────────────────────────
# CORS = Cross-Origin Resource Sharing.
# Without this, your browser will BLOCK requests from
# localhost:3000 to localhost:8000 because they're different
# "origins" (different ports = different origin).
#
# In production, replace allow_origins with your real domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,          # http://localhost:3000 in dev
        "http://localhost:3000",        # Always allow local dev
        "https://your-app.vercel.app",  # Add your Vercel URL later
    ],
    allow_credentials=True,   # Allow cookies + auth headers
    allow_methods=["*"],       # Allow GET, POST, PATCH, DELETE, etc.
    allow_headers=["*"],       # Allow Authorization header etc.
)


# ── Register routers ─────────────────────────────────────────
# Each router handles a group of related endpoints.
# The prefix is prepended to all routes in that router.
# e.g. prefix="/auth" means the router's "/github" becomes "/auth/github"
app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
# app.include_router(issues.router, prefix="/issues", tags=["Issues"])
# app.include_router(repos.router, prefix="/repos", tags=["Repositories"])
# app.include_router(users.router, prefix="/users", tags=["Users"])


# ── Health check ─────────────────────────────────────────────
# A simple endpoint to verify the server is running.
# Your frontend can ping this to check backend availability.
# Also useful for deployment health checks on Railway/Render.
@app.get("/", tags=["Health"])
def root():
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": "0.1.0",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy"}