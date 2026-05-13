# ============================================================
# app/dependencies.py
# ============================================================
# Reusable FastAPI dependencies.
#
# The key one here is `get_current_user` — it:
# 1. Reads the Authorization: Bearer <token> header
# 2. Decodes and verifies the JWT we issued at login
# 3. Fetches the user from the DB
# 4. Returns the User object to the route handler
#
# Usage in any protected route:
#   from app.dependencies import get_current_user
#   from app.models.user import User
#
#   @router.get("/something")
#   def my_route(current_user: User = Depends(get_current_user)):
#       return {"hello": current_user.username}
#
# If the token is missing or invalid → automatically returns 401.
# ============================================================

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import jwt, JWTError

from app.database import get_db
from app.config import settings
from app.models.user import User

# HTTPBearer reads the "Authorization: Bearer <token>" header
# auto_error=True means it raises 401 automatically if header is missing
bearer_scheme = HTTPBearer(auto_error=True)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Decodes the JWT from the Authorization header and returns the User.
    Raises HTTP 401 if token is missing, expired, or invalid.
    """
    token = credentials.credentials  # The raw JWT string

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # Decode the JWT using our secret key
        # This also verifies the signature and expiry automatically
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )

        # "sub" is the standard JWT claim for subject (our user ID)
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception

    except JWTError:
        # Token is malformed, expired, or signature is wrong
        raise credentials_exception

    # Fetch the user from the database using the ID from the token
    user = db.query(User).filter(User.id == user_id).first()

    if user is None:
        # Token was valid but user was deleted from DB
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    return user