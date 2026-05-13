// ============================================================
// src/app/(dashboard)/discover/page.tsx  (FULL REPLACEMENT)
// ============================================================
// The real discover page. What it does:
// 1. On load: fetches /users/me to check if user is onboarded
// 2. If not onboarded → shows OnboardingModal
// 3. After onboarding (or if already onboarded) → fetches issues
// 4. Renders issue cards with filter controls
// 5. Save button on each card calls POST /issues/{id}/save
// ============================================================

"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import OnboardingModal from "@/components/OnboardingModal";
import IssueCard from "@/components/IssueCard";
import { Search, SlidersHorizontal, RefreshCw, AlertCircle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────

interface Issue {
  id: string;
  github_issue_number: number;
  repo_owner: string;
  repo_name: string;
  full_name: string;
  title: string;
  body: string;
  labels: { name: string; color: string }[];
  difficulty: string;
  estimated_hours: number | null;
  comment_count: number;
  html_url: string;
  created_at: string;
  is_saved: boolean;
}

interface UserProfile {
  skill_tags: string[];
  experience_level: string;
  is_onboarded: boolean;
  username: string;
}

// ── Filter options ─────────────────────────────────────────────

const LEVEL_OPTIONS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const LANG_OPTIONS = [
  "python", "typescript", "javascript", "rust", "go",
  "java", "ruby", "cpp", "swift", "kotlin", "php", "vue",
];

// ── Component ─────────────────────────────────────────────────

export default function DiscoverPage() {
  // ── State ──────────────────────────────────────────────────
  const [user, setUser] = useState<UserProfile | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Active filters (start from user's profile values)
  const [filterLevel, setFilterLevel] = useState("beginner");
  const [filterLangs, setFilterLangs] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // ── Load user profile on mount ─────────────────────────────
  useEffect(() => {
    async function loadUser() {
      try {
        const res = await apiClient.get("/users/me");
        const profile: UserProfile = res.data;
        setUser(profile);

        if (!profile.is_onboarded) {
          // First login — show the onboarding modal
          setShowOnboarding(true);
        } else {
          // Already onboarded — seed filters from their profile
          setFilterLevel(profile.experience_level);
          setFilterLangs(profile.skill_tags);
        }
      } catch (e) {
        console.error("Failed to load user:", e);
      }
    }
    loadUser();
  }, []);

  // ── Fetch issues whenever filters or page change ───────────
  const fetchIssues = useCallback(
    async (currentPage = 1, replace = true) => {
      if (!user || showOnboarding) return;
      setLoading(true);
      setError(null);

      try {
        const params: Record<string, string | number> = {
          level: filterLevel,
          page: currentPage,
          per_page: 10,
        };

        // Pass language filter if set
        const langs = filterLangs.length > 0 ? filterLangs : user.skill_tags;
        if (langs.length > 0) {
          params.languages = langs.join(",");
        }

        const res = await apiClient.get("/issues/discover", { params });
        const data = res.data;

        setIssues((prev) =>
          replace ? data.items : [...prev, ...data.items]
        );
        setHasNext(data.has_next);
        setTotalCount(data.total);
        setPage(currentPage);
      } catch (e: any) {
        const msg =
          e?.response?.data?.detail ||
          "Failed to load issues. GitHub API may be rate-limited — try again in a minute.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [user, showOnboarding, filterLevel, filterLangs]
  );

  // Run whenever user loads or filters change
  useEffect(() => {
    if (user && !showOnboarding) {
      fetchIssues(1, true);
    }
  }, [user, showOnboarding, filterLevel, filterLangs]);

  // ── Handlers ───────────────────────────────────────────────

  // Called when OnboardingModal completes
  const handleOnboardingComplete = (skillTags: string[], level: string) => {
    setUser((prev) =>
      prev
        ? { ...prev, skill_tags: skillTags, experience_level: level, is_onboarded: true }
        : null
    );
    setFilterLevel(level);
    setFilterLangs(skillTags);
    setShowOnboarding(false);
    // fetchIssues will trigger via useEffect
  };

  // Called by IssueCard save button
  const handleSaveIssue = async (issueId: string) => {
    await apiClient.post(`/issues/${issueId}/save`);
    // Optimistic UI — IssueCard manages its own saved state
  };

  const toggleLangFilter = (lang: string) => {
    setFilterLangs((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  // ── Render ─────────────────────────────────────────────────

  return (
    <>
      {/* Onboarding modal — rendered over the page */}
      {showOnboarding && (
        <OnboardingModal onComplete={handleOnboardingComplete} />
      )}

      <div>
        {/* ── Page header ── */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Discover Issues
            </h1>
            <p className="mt-1 text-gray-500 text-sm">
              Open source issues matched to your skills
              {totalCount > 0 && !loading && (
                <span className="ml-2 text-gray-400">
                  — {totalCount.toLocaleString()} found
                </span>
              )}
            </p>
          </div>

          {/* Filter toggle + refresh */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchIssues(1, true)}
              disabled={loading}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Refresh results"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                showFilters
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
            </button>
          </div>
        </div>

        {/* ── Filter panel (collapsible) ── */}
        {showFilters && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5 space-y-4">
            {/* Experience level */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Difficulty
              </p>
              <div className="flex gap-2 flex-wrap">
                {LEVEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setFilterLevel(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      filterLevel === opt.value
                        ? "bg-gray-900 text-white border-gray-900"
                        : "border-gray-200 text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Language filter */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Languages
              </p>
              <div className="flex gap-2 flex-wrap">
                {LANG_OPTIONS.map((lang) => (
                  <button
                    key={lang}
                    onClick={() => toggleLangFilter(lang)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors capitalize ${
                      filterLangs.includes(lang)
                        ? "bg-gray-900 text-white border-gray-900"
                        : "border-gray-200 text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    {lang}
                  </button>
                ))}
                {filterLangs.length > 0 && (
                  <button
                    onClick={() => setFilterLangs([])}
                    className="px-3 py-1.5 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Error state ── */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Could not load issues</p>
              <p className="text-sm text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {loading && issues.length === 0 && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse"
              >
                <div className="flex justify-between mb-3">
                  <div className="h-4 bg-gray-100 rounded w-40" />
                  <div className="h-4 bg-gray-100 rounded w-20" />
                </div>
                <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-50 rounded w-full mb-1" />
                <div className="h-3 bg-gray-50 rounded w-2/3" />
              </div>
            ))}
          </div>
        )}

        {/* ── Issue list ── */}
        {!loading && issues.length === 0 && !error && (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Search className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm">No issues found for these filters.</p>
            <p className="text-gray-400 text-xs mt-1">Try adjusting your language or difficulty filters.</p>
          </div>
        )}

        <div className="space-y-3">
          {issues.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              onSave={handleSaveIssue}
            />
          ))}
        </div>

        {/* ── Load more ── */}
        {hasNext && !loading && (
          <div className="mt-6 text-center">
            <button
              onClick={() => fetchIssues(page + 1, false)}
              className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Load more issues
            </button>
          </div>
        )}

        {/* Loading indicator for "load more" */}
        {loading && issues.length > 0 && (
          <div className="mt-6 text-center">
            <div className="inline-flex items-center gap-2 text-sm text-gray-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading more...
            </div>
          </div>
        )}
      </div>
    </>
  );
}