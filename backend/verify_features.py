import asyncio
from app.database import SessionLocal
from app.models.user import User
from app.models.issue import Issue
from app.routers.issues import compute_recommendation_score, _get_user_repo_counts, check_github_prs

async def test_verify():
    print("🧪 Starting Programmatic Feature Verification...")
    db = SessionLocal()
    try:
        # Load user
        user = db.query(User).filter(User.username == "Rutujaa-04").first()
        if not user:
            print("❌ User 'Rutujaa-04' not found in database!")
            return
        
        print(f"👤 Found User: {user.username}")
        print(f"   Skills: {user.skill_tags}")
        print(f"   Experience level: {user.experience_level}")

        # Get repo counts
        user_repo_counts = _get_user_repo_counts(user.id, db)
        print(f"📈 User's Repo Interactions: {user_repo_counts}")

        # Load all cached issues
        issues = db.query(Issue).limit(5).all()
        print(f"\n📋 Computing Recommendation Scores for {len(issues)} cached issues:")
        for issue in issues:
            issue_data = {
                "repo_owner": issue.repo_owner,
                "repo_name": issue.repo_name,
                "difficulty": issue.difficulty,
                "created_at": issue.created_at.isoformat(),
                "comment_count": issue.comment_count,
            }
            score = compute_recommendation_score(issue_data, user, user_repo_counts, db)
            recommended = score >= 70
            print(f"   🔹 [{issue.repo_owner}/{issue.repo_name}] {issue.title}")
            print(f"      Score: {score} | Recommended: {'✨ Yes' if recommended else 'No'} | Difficulty: {issue.difficulty}")

        # Let's test checking GitHub PR competition for an issue
        if issues:
            target_issue = issues[0]
            print(f"\n🔍 Testing PR Competition check on: #{target_issue.github_issue_number} in {target_issue.repo_owner}/{target_issue.repo_name}")
            result = await check_github_prs(target_issue.repo_owner, target_issue.repo_name, target_issue.github_issue_number)
            print(f"✅ PR Competition Results: {result}")
            
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(test_verify())
