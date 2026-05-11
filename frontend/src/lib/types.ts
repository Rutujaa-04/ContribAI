// ============================================================
// src/lib/types.ts
// ============================================================
// This file defines the "shape" of every piece of data in
// your app. TypeScript uses these to catch errors at compile
// time — if the backend returns { titl: "..." } instead of
// { title: "..." }, TypeScript will warn you immediately.
//
// Rule: Every object you pass around the app should have a
// type defined here. Never use `any`.
// ============================================================

// ------------------------------------------------------------
// USER
// ------------------------------------------------------------

export interface User {
  id: string;
  github_id: number;
  username: string;           // GitHub username e.g. "rutuja"
  email: string | null;       // GitHub may not expose email
  avatar_url: string;         // GitHub profile picture URL
  skill_tags: string[];       // e.g. ["python", "typescript"]
  experience_level: ExperienceLevel;
  created_at: string;         // ISO date string
}

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

// ------------------------------------------------------------
// REPOSITORY
// ------------------------------------------------------------

export interface Repository {
  id: string;
  github_repo_id: number;
  owner: string;              // e.g. "facebook"
  name: string;               // e.g. "react"
  full_name: string;          // e.g. "facebook/react"
  description: string | null;
  stars: number;
  primary_language: string | null;
  tech_stack: string[];       // detected stack e.g. ["React", "TypeScript", "Jest"]
  arch_summary: string | null; // AI-generated plain English summary
  health_score: number | null; // 0-100, based on activity + responsiveness
  last_ingested_at: string | null;
  html_url: string;           // GitHub repo URL
}

// ------------------------------------------------------------
// ISSUE
// ------------------------------------------------------------

export interface Issue {
  id: string;
  github_issue_id: number;
  github_issue_number: number;
  repo_owner: string;
  repo_name: string;
  title: string;
  body: string;
  labels: IssueLabel[];
  difficulty: IssueDifficulty;
  estimated_hours: number | null;  // e.g. 2.5 hours
  comment_count: number;
  created_at: string;
  html_url: string;           // Link to GitHub issue
  analysis?: IssueAnalysis;  // Present after AI analysis is run
}

export interface IssueLabel {
  name: string;               // e.g. "good first issue"
  color: string;              // hex color e.g. "7057ff"
}

export type IssueDifficulty = "beginner" | "intermediate" | "advanced" | "unknown";

// ------------------------------------------------------------
// AI ANALYSIS
// ------------------------------------------------------------

export interface IssueAnalysis {
  issue_id: string;
  plain_explanation: string;  // What actually needs to be done, in simple terms
  background: string;         // Why this issue exists, what problem it solves
  file_map: FileMapItem[];    // Which files to look at / edit
  implementation_steps: ImplementationStep[];
  edge_cases: string[];       // Things to watch out for
  test_hints: string;         // What to test and where tests live
  generated_at: string;
}

export interface FileMapItem {
  path: string;               // e.g. "src/components/Button.tsx"
  relevance: "primary" | "secondary" | "reference";
  reason: string;             // Why this file is relevant
  snippet?: string;           // Optional: relevant code snippet
}

export interface ImplementationStep {
  order: number;
  title: string;              // e.g. "Add the new prop to the Button component"
  description: string;
  completed?: boolean;        // Tracked client-side in dashboard
}

// ------------------------------------------------------------
// USER-ISSUE TRACKING
// ------------------------------------------------------------

export interface UserIssue {
  user_id: string;
  issue_id: string;
  issue: Issue;
  status: ContributionStatus;
  pr_url: string | null;
  notes: string | null;
  saved_at: string;
  updated_at: string;
}

export type ContributionStatus =
  | "saved"        // User bookmarked it
  | "in_progress"  // User is actively working on it
  | "submitted"    // User opened a PR
  | "merged"       // PR was merged (success!)
  | "closed";      // Issue closed without their PR

// ------------------------------------------------------------
// API REQUEST / RESPONSE SHAPES
// ------------------------------------------------------------

// What the discover endpoint accepts as query params
export interface DiscoverParams {
  languages?: string[];       // e.g. ["python", "typescript"]
  level?: ExperienceLevel;
  time_available?: number;    // hours available e.g. 2
  page?: number;
  per_page?: number;
}

// Standard API response wrapper — all your endpoints return this shape
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

// Standard paginated response
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}

// Dashboard stats
export interface DashboardStats {
  total_saved: number;
  in_progress: number;
  submitted: number;
  merged: number;
  current_streak: number;     // days
  longest_streak: number;
}

// ------------------------------------------------------------
// AUTH
// ------------------------------------------------------------

// Shape of the session object NextAuth puts in the browser
// We extend the default NextAuth session to include our extra fields
export interface ExtendedSession {
  user: {
    id: string;
    name: string;
    email: string;
    image: string;
    username: string;
    accessToken: string;      // GitHub access token (for API calls)
    backendToken: string;     // JWT from your FastAPI backend
  };
  expires: string;
}