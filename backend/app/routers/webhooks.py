# ============================================================
# app/routers/webhooks.py
# ============================================================
# Handles GitHub webhooks to automatically track pull requests:
#
#   POST /webhooks/github       → handles webhook payloads from GitHub
#
# Flow:
# 1. GitHub sends a pull_request event (e.g. opened, closed, merged)
# 2. We extract the PR URL, state, title, and body
# 3. We match the PR to saved user issues:
#    - Direct Match: By exact `pr_url`
#    - Implicit Match: By closing keywords in the PR (e.g. "Fixes #12")
#      and matching the PR sender's GitHub username to our User record
# 4. We transition status: open -> submitted, closed + merged -> merged,
#    closed + unmerged -> closed.
# ============================================================

import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.issue import Issue, UserIssue

router = APIRouter()


def extract_issue_numbers(text: str, repo_owner: str, repo_name: str) -> list[int]:
    """
    Extracts referenced GitHub issue numbers from PR description or title.
    Matches standard keywords (e.g. "Fixes #45") or direct issue URLs.
    """
    issue_nums = set()

    # 1. Standard GitHub closing keywords: "Fixes #12", "Closes #123", "Resolves #1"
    # Case-insensitive matching
    pattern_keyword = r"(?:fixes|closes|resolves|fixed|closed|resolved)\s+#(\d+)"
    for num in re.findall(pattern_keyword, text, re.IGNORECASE):
        issue_nums.add(int(num))

    # 2. Absolute URL links: https://github.com/owner/repo/issues/123
    pattern_url = rf"github\.com/{re.escape(repo_owner)}/{re.escape(repo_name)}/issues/(\d+)"
    for num in re.findall(pattern_url, text, re.IGNORECASE):
        issue_nums.add(int(num))

    return list(issue_nums)


@router.post("/github")
async def github_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Main webhook receiver endpoint.
    Configured under POST /webhooks/github.
    """
    event_type = request.headers.get("X-GitHub-Event", "ping")

    if event_type == "ping":
        return {"message": "pong"}

    if event_type != "pull_request":
        return {"message": f"Event type '{event_type}' ignored"}

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    action = payload.get("action")
    pr = payload.get("pull_request")
    if not pr:
        raise HTTPException(status_code=400, detail="Missing pull_request payload")

    html_url = pr.get("html_url")
    state = pr.get("state")
    merged = pr.get("merged", False)
    title = pr.get("title", "") or ""
    body = pr.get("body", "") or ""

    sender = payload.get("sender", {})
    sender_username = sender.get("login")

    repository = payload.get("repository", {})
    repo_name = repository.get("name")
    repo_owner = repository.get("owner", {}).get("login")

    if not repo_name or not repo_owner:
        return {"status": "ignored", "message": "Missing repository information"}

    updated_count = 0

    # ── Path 1: Direct URL Match ──────────────────────────────
    # Any saved issues that already have this PR URL configured
    user_issues = db.query(UserIssue).filter(UserIssue.pr_url == html_url).all()

    for ui in user_issues:
        old_status = ui.status
        if action == "closed" and merged:
            ui.status = "merged"
        elif action == "closed" and not merged:
            ui.status = "closed"
        elif action in ["opened", "reopened", "synchronize"]:
            ui.status = "submitted"
        
        if ui.status != old_status:
            ui.updated_at = datetime.utcnow()
            updated_count += 1

    # ── Path 2: Implicit Regex Match ──────────────────────────
    # If no direct match exists yet, check PR text for "Fixes #12"
    search_text = f"{title}\n\n{body}"
    referenced_numbers = extract_issue_numbers(search_text, repo_owner, repo_name)

    if referenced_numbers and sender_username:
        # Find user in our system matching the PR author
        user = db.query(User).filter(User.username == sender_username).first()
        if user:
            for num in referenced_numbers:
                # Find matching cached issue
                issue = db.query(Issue).filter(
                    Issue.repo_owner == repo_owner,
                    Issue.repo_name == repo_name,
                    Issue.github_issue_number == num
                ).first()

                if issue:
                    # Look up UserIssue record for that user
                    ui = db.query(UserIssue).filter(
                        UserIssue.user_id == user.id,
                        UserIssue.issue_id == issue.id
                    ).first()

                    if ui:
                        # Automatically link PR URL if empty
                        if not ui.pr_url:
                            ui.pr_url = html_url

                        old_status = ui.status
                        if action == "closed" and merged:
                            ui.status = "merged"
                        elif action == "closed" and not merged:
                            ui.status = "closed"
                        elif action in ["opened", "reopened", "synchronize"]:
                            ui.status = "submitted"
                        
                        if ui.status != old_status or ui.pr_url == html_url:
                            ui.updated_at = datetime.utcnow()
                            updated_count += 1

    if updated_count > 0:
        db.commit()
        return {
            "status": "success",
            "message": f"Successfully updated {updated_count} issue tracking status(es)",
            "updated_count": updated_count
        }

    return {
        "status": "ignored",
        "message": "No matching user contributions or linked issue keywords found"
    }
