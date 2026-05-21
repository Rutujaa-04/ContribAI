# app/services/ingestion.py
# Fetches a GitHub repo's file tree, chunks source files by function/class
# boundaries (Tree-sitter style but using simple heuristics — no native
# Tree-sitter binary needed), embeds the chunks, and stores them in pgvector.

# app/services/ingestion.py
# Fetches a GitHub repo's file tree, chunks source files by function/class
# boundaries, embeds the chunks via Ollama (local, no rate limits),
# and stores them in pgvector.

import httpx
import re
import asyncio
from datetime import datetime, timedelta
from typing import List, Optional
from sqlalchemy.orm import Session

from app.config import settings
from app.models.repository import Repository, CodeChunk
from app.services.embeddings import get_embeddings_batch, get_embedding


# ── GitHub API helpers ────────────────────────────────────────────────────────

GITHUB_HEADERS = {
    "Accept": "application/vnd.github.v3+json",
    "Authorization": f"Bearer {settings.github_token}",
}

# Files we care about chunking — ignore assets, lock files, etc.
SUPPORTED_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".java",
    ".rb", ".swift", ".kt", ".php", ".cs", ".cpp", ".c", ".h",
    ".vue", ".svelte",
}

# Files to check for tech stack detection
MANIFEST_FILES = {
    "package.json", "requirements.txt", "go.mod", "Cargo.toml",
    "pom.xml", "build.gradle", "Gemfile", "composer.json",
    "pyproject.toml", "setup.py",
}

# Max file size to embed (skip huge generated files)
MAX_FILE_CHARS = 8000


async def fetch_repo_tree(owner: str, repo: str) -> List[dict]:
    """
    Fetches the full file tree of a GitHub repo using the Git Trees API.
    Returns flat list of file objects: [{path, type, size, url}, ...]
    """
    async with httpx.AsyncClient(timeout=20.0) as client:
        repo_resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}",
            headers=GITHUB_HEADERS,
        )
        if repo_resp.status_code != 200:
            return []
        default_branch = repo_resp.json().get("default_branch", "main")

        tree_resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1",
            headers=GITHUB_HEADERS,
        )
        if tree_resp.status_code != 200:
            return []
        return tree_resp.json().get("tree", [])


async def fetch_file_content(owner: str, repo: str, path: str) -> Optional[str]:
    """
    Fetches raw content of a single file via GitHub Contents API.
    Returns decoded text or None if it fails/is too large.
    """
    import base64
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/contents/{path}",
            headers=GITHUB_HEADERS,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        if data.get("encoding") == "base64" and data.get("content"):
            try:
                return base64.b64decode(data["content"]).decode("utf-8", errors="ignore")
            except Exception:
                return None
        return None


async def fetch_contributing_md(owner: str, repo: str) -> Optional[str]:
    """Tries to fetch CONTRIBUTING.md from repo root."""
    for path in ["CONTRIBUTING.md", "CONTRIBUTING", ".github/CONTRIBUTING.md"]:
        content = await fetch_file_content(owner, repo, path)
        if content:
            return content
    return None


# ── Tech stack detection ──────────────────────────────────────────────────────

async def detect_tech_stack(owner: str, repo: str, file_paths: List[str]) -> dict:
    """
    Reads manifest files to detect the tech stack.
    Returns {"languages": [...], "frameworks": [...], "has_tests": bool}
    """
    manifest_names = {p.split("/")[-1] for p in file_paths}
    found_manifests = MANIFEST_FILES & manifest_names

    stack = {"languages": [], "frameworks": [], "has_tests": False}

    # Detect languages from file extensions in tree
    ext_counts: dict = {}
    for path in file_paths:
        ext = "." + path.rsplit(".", 1)[-1] if "." in path else ""
        if ext in SUPPORTED_EXTENSIONS:
            ext_counts[ext] = ext_counts.get(ext, 0) + 1

    # Top 3 languages by file count
    top_exts = sorted(ext_counts.items(), key=lambda x: -x[1])[:3]
    EXT_TO_LANG = {
        ".py": "Python", ".ts": "TypeScript", ".tsx": "TypeScript",
        ".js": "JavaScript", ".jsx": "JavaScript", ".go": "Go",
        ".rs": "Rust", ".java": "Java", ".rb": "Ruby",
        ".swift": "Swift", ".kt": "Kotlin", ".php": "PHP",
        ".vue": "Vue", ".svelte": "Svelte",
    }
    stack["languages"] = [EXT_TO_LANG.get(e, e) for e, _ in top_exts]

    # Check for test files
    test_indicators = ["test", "spec", "__tests__", "tests/"]
    stack["has_tests"] = any(
        any(ind in p for ind in test_indicators) for p in file_paths
    )

    # Read package.json for JS/TS frameworks
    if "package.json" in found_manifests:
        content = await fetch_file_content(owner, repo, "package.json")
        if content:
            import json
            try:
                pkg = json.loads(content)
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                FRAMEWORK_MAP = {
                    "react": "React", "next": "Next.js", "vue": "Vue",
                    "svelte": "Svelte", "angular": "@angular", "express": "Express",
                    "fastify": "Fastify", "prisma": "Prisma", "tailwindcss": "Tailwind",
                }
                stack["frameworks"] = [
                    label for key, label in FRAMEWORK_MAP.items()
                    if any(key in d for d in deps)
                ]
            except Exception:
                pass

    return stack


# ── Code chunking ─────────────────────────────────────────────────────────────

def chunk_source_file(path: str, content: str, language: str) -> List[dict]:
    """
    Splits a source file into chunks at function/class boundaries.
    Uses regex-based heuristics — no native Tree-sitter binary needed.
    Returns list of {text, function_name, chunk_index}
    """
    # Patterns that signal a new top-level declaration
    PATTERNS = {
        "python": re.compile(r"^(def |class |async def )", re.MULTILINE),
        "typescript": re.compile(r"^(export |function |class |const \w+ = (?:async )?(?:function|\())", re.MULTILINE),
        "javascript": re.compile(r"^(export |function |class |const \w+ = (?:async )?(?:function|\())", re.MULTILINE),
        "go": re.compile(r"^func ", re.MULTILINE),
        "rust": re.compile(r"^(pub fn |fn |pub struct |struct |impl )", re.MULTILINE),
        "java": re.compile(r"^\s*(public|private|protected|static).*\(", re.MULTILINE),
        "ruby": re.compile(r"^(def |class |module )", re.MULTILINE),
    }

    pattern = PATTERNS.get(language)

    if pattern is None or len(content) < 300:
        name = path.split("/")[-1]
        return [{"text": content[:MAX_FILE_CHARS], "function_name": name, "chunk_index": 0}]

    split_points = [m.start() for m in pattern.finditer(content)]

    if not split_points:
        return [{"text": content[:MAX_FILE_CHARS], "function_name": None, "chunk_index": 0}]

    split_points = [0] + split_points + [len(content)]

    chunks = []
    for i, (start, end) in enumerate(zip(split_points, split_points[1:])):
        chunk_text = content[start:end].strip()
        if len(chunk_text) < 30:
            continue

        first_line = chunk_text.split("\n")[0]
        func_match = re.search(r"(?:def |func |function |class |struct )(\w+)", first_line)
        function_name = func_match.group(1) if func_match else None

        chunks.append({
            "text": chunk_text[:MAX_FILE_CHARS],
            "function_name": function_name,
            "chunk_index": i,
        })

    return chunks if chunks else [{"text": content[:MAX_FILE_CHARS], "function_name": None, "chunk_index": 0}]


EXT_TO_LANG_SIMPLE = {
    ".py": "python", ".ts": "typescript", ".tsx": "typescript",
    ".js": "javascript", ".jsx": "javascript", ".go": "go",
    ".rs": "rust", ".java": "java", ".rb": "ruby",
    ".vue": "vue", ".swift": "swift", ".kt": "kotlin",
}


# ── Main ingestion function ───────────────────────────────────────────────────

# Global dictionary to serialize ingestion per repository (avoids concurrent ingestion duplicate keys)
_repo_ingest_locks = {}
_repo_ingest_locks_lock = asyncio.Lock()

async def get_repo_ingest_lock(full_name: str) -> asyncio.Lock:
    async with _repo_ingest_locks_lock:
        if full_name not in _repo_ingest_locks:
            _repo_ingest_locks[full_name] = asyncio.Lock()
        return _repo_ingest_locks[full_name]


async def ingest_repository(
    owner: str,
    repo_name: str,
    db: Session,
    force_refresh: bool = False,
) -> dict:
    full_name = f"{owner}/{repo_name}"
    full_name_lower = full_name.lower()
    lock = await get_repo_ingest_lock(full_name_lower)
    async with lock:
        return await _ingest_repository_unlocked(owner, repo_name, db, force_refresh)


async def _ingest_repository_unlocked(
    owner: str,
    repo_name: str,
    db: Session,
    force_refresh: bool = False,
) -> dict:
    """
    Full ingestion pipeline for a GitHub repo (unlocked core).
    """
    full_name = f"{owner}/{repo_name}"

    # Check if already ingested recently (cache for 24h)
    existing = db.query(Repository).filter(Repository.full_name == full_name).first()
    if existing and not force_refresh and existing.last_ingested_at:
        age = datetime.utcnow() - existing.last_ingested_at
        if age < timedelta(hours=24):
            return {
                "status": "cached",
                "repo_id": str(existing.id),
                "message": "Using cached ingestion",
            }

    print(f"🔍 Starting ingestion for {full_name}...")

    # Step 1: Fetch repo metadata + file tree
    async with httpx.AsyncClient(timeout=20.0) as client:
        meta_resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo_name}",
            headers=GITHUB_HEADERS,
        )
        if meta_resp.status_code != 200:
            return {"status": "error", "message": "GitHub API returned non-200 for repo metadata"}
        meta = meta_resp.json()

    tree = await fetch_repo_tree(owner, repo_name)
    all_paths = [item["path"] for item in tree if item["type"] == "blob"]

    # Step 2: Detect tech stack
    stack_info = await detect_tech_stack(owner, repo_name, all_paths)

    # Step 3: Select files to chunk
    source_files = [
        p for p in all_paths
        if any(p.endswith(ext) for ext in SUPPORTED_EXTENSIONS)
        and not any(skip in p for skip in [
            "node_modules", ".min.", "dist/", "build/", "__pycache__",
            "vendor/", ".test.", ".spec.", "migrations/", "generated/",
        ])
    ]

    # Cap at 40 files — prioritise shallow paths (top-level and src/)
    source_files.sort(key=lambda p: (p.count("/"), len(p)))
    source_files = source_files[:40]

    print(f"📁 Found {len(source_files)} source files to chunk")

    # Step 4: Fetch files and build chunks
    all_chunks = []
    for path in source_files:
        content = await fetch_file_content(owner, repo_name, path)
        if not content or len(content.strip()) < 50:
            continue
        ext = "." + path.rsplit(".", 1)[-1] if "." in path else ""
        language = EXT_TO_LANG_SIMPLE.get(ext, "unknown")
        file_chunks = chunk_source_file(path, content, language)
        for chunk in file_chunks:
            all_chunks.append({**chunk, "file_path": path, "language": language})

    print(f"✂️  Generated {len(all_chunks)} chunks from source files")

    # Step 5: Embed chunks in batches — Ollama is local so no rate limits
    BATCH_SIZE = 20
    embedded_chunks = []
    total_batches = (len(all_chunks) - 1) // BATCH_SIZE + 1 if all_chunks else 0
    for i in range(0, len(all_chunks), BATCH_SIZE):
        batch = all_chunks[i:i + BATCH_SIZE]
        texts = [c["text"] for c in batch]
        embeddings = get_embeddings_batch(texts)
        for chunk, emb in zip(batch, embeddings):
            embedded_chunks.append({**chunk, "embedding": emb})
        print(f"  Embedded batch {i // BATCH_SIZE + 1}/{total_batches}")

    # Step 6: Fetch and summarise CONTRIBUTING.md
    contributing_content = await fetch_contributing_md(owner, repo_name)
    contributing_summary = None
    if contributing_content:
        contributing_summary = await summarise_contributing_md(contributing_content)

    # Step 7: Generate arch summary via LLM
    top_level_files = [p for p in all_paths if p.count("/") == 0]
    top_level_dirs = list(set(
        p.split("/")[0] for p in all_paths if "/" in p
    ))[:10]
    arch_summary = await generate_arch_summary(
        owner=owner,
        repo_name=repo_name,
        description=meta.get("description", ""),
        top_files=top_level_files[:20],
        top_dirs=top_level_dirs,
        stack=stack_info,
        language=meta.get("language", ""),
    )

    # Step 8: Upsert Repository record
    # Query again in case the repository was renamed, or ingested concurrently
    existing_by_id = db.query(Repository).filter(Repository.github_repo_id == meta["id"]).first()
    if existing_by_id:
        repo_obj = existing_by_id
        # Update details in case of rename
        repo_obj.full_name = full_name
        repo_obj.owner = owner
        repo_obj.name = repo_name
    elif existing:
        repo_obj = existing
    else:
        repo_obj = Repository(
            github_repo_id=meta["id"],
            owner=owner,
            name=repo_name,
            full_name=full_name,
            html_url=meta.get("html_url", ""),
        )
        db.add(repo_obj)
        db.flush()

    repo_obj.description = meta.get("description")
    repo_obj.stars = meta.get("stargazers_count", 0)
    repo_obj.primary_language = meta.get("language")
    
    # Unique values preserving order
    raw_stack = stack_info.get("frameworks", []) + stack_info.get("languages", [])
    seen_tech = set()
    repo_obj.tech_stack = [x for x in raw_stack if not (x in seen_tech or seen_tech.add(x))]
    
    repo_obj.arch_summary = arch_summary
    repo_obj.has_contributing_md = bool(contributing_content)
    repo_obj.contributing_md_summary = contributing_summary
    repo_obj.last_ingested_at = datetime.utcnow()

    # Step 9: Delete old chunks, insert new ones
    db.query(CodeChunk).filter(CodeChunk.repo_id == repo_obj.id).delete()
    chunks_saved = 0
    for chunk in embedded_chunks:
        if chunk.get("embedding") is None:
            continue
        db.add(CodeChunk(
            repo_id=repo_obj.id,
            file_path=chunk["file_path"],
            chunk_text=chunk["text"],
            function_name=chunk.get("function_name"),
            language=chunk["language"],
            chunk_index=chunk["chunk_index"],
            embedding=chunk["embedding"],
        ))
        chunks_saved += 1

    db.commit()
    print(f"✅ Ingestion complete: {chunks_saved} chunks stored for {full_name}")

    return {
        "status": "ingested",
        "repo_id": str(repo_obj.id),
        "chunks_stored": chunks_saved,
        "files_processed": len(source_files),
        "tech_stack": repo_obj.tech_stack,
    }


# ── LLM helpers ───────────────────────────────────────────────────────────────

async def generate_arch_summary(
    owner: str,
    repo_name: str,
    description: str,
    top_files: List[str],
    top_dirs: List[str],
    stack: dict,
    language: str,
) -> str:
    """Calls OpenRouter/DeepSeek to generate a plain-English architecture summary."""
    from openai import OpenAI
    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=settings.openrouter_api_key,
    )

    prompt = f"""You are a senior engineer explaining a codebase to a newcomer.

Repo: {owner}/{repo_name}
Description: {description or 'None provided'}
Primary language: {language}
Detected stack: {', '.join(stack.get('languages', []) + stack.get('frameworks', []))}
Top-level files: {', '.join(top_files[:15])}
Top-level directories: {', '.join(top_dirs[:10])}

Write a 3-5 sentence plain English summary of:
1. What this project does
2. How it is structured at a high level (main directories and their purpose)
3. What patterns it uses (MVC, event-driven, microservices, etc. if inferable)

Be concrete. Avoid marketing language. Write for a developer who will contribute code."""

    try:
        resp = client.chat.completions.create(
            model="openrouter/free",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        print(f"❌ Arch summary failed: {e}")
        return f"A {language} project: {description or repo_name}"


async def summarise_contributing_md(content: str) -> str:
    """Summarises CONTRIBUTING.md to extract setup steps and conventions."""
    from openai import OpenAI
    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=settings.openrouter_api_key,
    )

    prompt = f"""Extract the key information from this CONTRIBUTING.md for a new contributor.

Return a JSON object with these fields:
{{
  "setup_steps": ["step 1", "step 2"],
  "coding_conventions": ["convention 1"],
  "pr_requirements": ["requirement 1"],
  "testing_instructions": "how to run tests"
}}

CONTRIBUTING.md content:
{content[:3000]}

Return ONLY the JSON, no markdown."""

    try:
        resp = client.chat.completions.create(
            model="openrouter/free",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        print(f"❌ CONTRIBUTING.md summarisation failed: {e}")
        return ""