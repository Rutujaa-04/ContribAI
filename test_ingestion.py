import asyncio
import sys
sys.path.insert(0, "backend")

from dotenv import load_dotenv
load_dotenv("backend/.env")

from app.database import SessionLocal, engine, Base
from app.config import settings

# Import ALL models so SQLAlchemy knows about all tables
from app.models.user import User
from app.models.issue import Issue, UserIssue
from app.models.repository import Repository, CodeChunk  # ← this is what's missing

from app.services.ingestion import ingest_repository

async def main():
    Base.metadata.create_all(bind=engine)
    print("✅ Tables created/verified")

    # Quick sanity check on GitHub token
    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.github.com/rate_limit",
            headers={"Authorization": f"Bearer {settings.github_token}"}
        )
        data = resp.json()
        core = data.get("resources", {}).get("core", {})
        print(f"GitHub rate limit: {core.get('remaining')}/{core.get('limit')} remaining")

    db = SessionLocal()
    try:
        result = await ingest_repository("pallets", "flask", db, force_refresh=False)
        print("Result:", result)
    finally:
        db.close()

asyncio.run(main())