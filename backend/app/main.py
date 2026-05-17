# ============================================================
# app/main.py  (UPDATED — uncommented issues + users routers)
# ============================================================

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.database import engine, Base

from app.models import User, Issue, UserIssue  # noqa: F401

from app.routers import auth, issues, users, repos


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting ContribAI backend...")
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables ready")
    yield
    print("👋 Shutting down...")


app = FastAPI(
    title="ContribAI API",
    description="AI-powered open source contribution guidance",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:3000",
        "https://your-app.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(issues.router, prefix="/issues", tags=["Issues"])
app.include_router(users.router, prefix="/users", tags=["Users"])
app.include_router(repos.router, prefix="/repos", tags=["Repositories"])


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