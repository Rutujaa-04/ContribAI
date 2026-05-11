# ============================================================
# app/routers/auth.py
# ============================================================
# This router handles authentication from the backend side.
#
# Flow:
# 1. User clicks "Sign in with GitHub" on your frontend
# 2. NextAuth redirects them to GitHub
# 3. GitHub redirects back to NextAuth with an access token
# 4. NextAuth's jwt() callback calls POST /auth/github (THIS FILE)
#    with that GitHub access token
# 5. We verify the token by calling GitHub's /user API
# 6. We create or update the user in our database
# 7. We return our OWN JWT token to NextAuth
# 8. NextAuth stores our JWT in the session cookie
# 9. Every subsequent API call from the frontend includes our JWT
# ============================================================

import httpx
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from jose import jwt
from pydantic import BaseModel

from app.database import get_db
from app.config import settings
from app.models.user import User


router = APIRouter()


# ── Request/Response schemas ──────────────────────────────────
# These are inline Pydantic models for this router.
# Simple ones like these don't need their own schemas/ file.

class GitHubAuthRequest(BaseModel):
    access_token: str   # The GitHub OAuth token NextAuth sends us

class AuthResponse(BaseModel):
    access_token: str   # Our own JWT we return to NextAuth
    user_id: str
    username: str


# ── JWT helper ────────────────────────────────────────────────
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """
    Creates a signed JWT token.
    `data` is what we embed in the token (user ID, username).
    The token is signed with SECRET_KEY so we can verify it later.
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


# ── GitHub user fetcher ───────────────────────────────────────
async def get_github_user(access_token: str) -> dict:
    """
    Calls GitHub's /user API to get the user's profile.
    This verifies the token is real and gets us the user data.
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github.v3+json",
            },
        )
        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid GitHub access token",
            )
        return response.json()


# ── POST /auth/github ─────────────────────────────────────────
@router.post("/github", response_model=AuthResponse)
async def github_auth(request: GitHubAuthRequest, db: Session = Depends(get_db)):
    """
    Called by NextAuth's jwt() callback after GitHub login.

    Steps:
    1. Verify the GitHub token by calling GitHub API
    2. Find existing user OR create new user in our DB
    3. Return our own JWT token
    """

    # Step 1: Verify token + get GitHub profile
    github_user = await get_github_user(request.access_token)

    github_id = github_user["id"]
    username = github_user["login"]
    email = github_user.get("email")          # May be None
    avatar_url = github_user.get("avatar_url", "")

    # Step 2: Find or create user in our database
    # .first() returns the user if found, None if not
    user = db.query(User).filter(User.github_id == github_id).first()

    if user is None:
        # New user — create them
        user = User(
            github_id=github_id,
            username=username,
            email=email,
            avatar_url=avatar_url,
            skill_tags=[],
            experience_level="beginner",
        )
        db.add(user)
        print(f"✅ New user created: {username}")
    else:
        # Returning user — update their profile in case it changed
        user.username = username
        user.email = email
        user.avatar_url = avatar_url
        user.updated_at = datetime.utcnow()
        print(f"👋 Returning user: {username}")

    db.commit()
    db.refresh(user)  # Reload from DB to get the generated UUID

    # Step 3: Create and return our own JWT
    # We embed the user's ID and username in the token.
    # The frontend stores this and sends it with every request.
    our_token = create_access_token(
        data={
            "sub": str(user.id),        # "sub" = subject (standard JWT claim)
            "username": user.username,
        }
    )

    return AuthResponse(
        access_token=our_token,
        user_id=str(user.id),
        username=user.username,
    )


# ── GET /auth/me ──────────────────────────────────────────────
# A simple endpoint to verify a token and return the current user.
# Useful for debugging — call it from /docs to test your JWT.
@router.get("/me")
async def get_me(db: Session = Depends(get_db)):
    """
    Placeholder — in the next step we'll add JWT verification
    as a FastAPI dependency and use it here.
    For now, this just confirms the router is working.
    """
    return {"message": "Auth router is working!"}