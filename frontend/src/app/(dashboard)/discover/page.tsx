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
import { Search, SlidersHorizontal, RefreshCw, AlertCircle, ArrowUpDown } from "lucide-react";

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
  recommendation_score?: number;
  recommended?: boolean;
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
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSort, setFilterSort] = useState("recommended");

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
        params.sort = filterSort;

        const res = await apiClient.get("/issues/discover", { params });
        const data = res.data;

        setIssues((prev) =>
          replace ? data.items : [...prev, ...data.items]
        );
        setHasNext(data.has_next);
        setTotalCount(data.total);
        setPage(currentPage);
      } catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = err as any;
        const msg =
          e?.response?.data?.detail ||
          "Failed to load issues. GitHub API may be rate-limited — try again in a minute.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [user, showOnboarding, filterLevel, filterLangs, filterSort]
  );

  // Run whenever user loads or filters change
  useEffect(() => {
    if (user && !showOnboarding) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchIssues(1, true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, showOnboarding, filterLevel, filterLangs, filterSort]);

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
  };

  // Called by IssueCard save button
  const handleSaveIssue = async (issueId: string) => {
    await apiClient.post(`/issues/${issueId}/save`);
  };

  const toggleLangFilter = (lang: string) => {
    setFilterLangs((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  // ── Local filtering for instant results ────────────────────
  const filteredIssues = issues.filter((issue) => {
    const query = searchQuery.toLowerCase();
    return (
      issue.title.toLowerCase().includes(query) ||
      issue.full_name.toLowerCase().includes(query) ||
      (issue.body && issue.body.toLowerCase().includes(query))
    );
  });

  // Calculate active filter count
  const activeFiltersCount = (filterLangs.length > 0 ? filterLangs.length : 0) + (filterLevel ? 1 : 0);

  // ── Render ─────────────────────────────────────────────────
  return (
    <>
      {/* Onboarding modal — rendered over the page */}
      {showOnboarding && (
        <OnboardingModal onComplete={handleOnboardingComplete} />
      )}

      {/* Decorative meshes for background depth */}
      <div className="absolute top-0 right-1/4 w-96 h-96 mesh-blob-blue opacity-50 pointer-events-none" />
      <div className="absolute top-[20%] right-[10%] w-80 h-80 mesh-blob-purple opacity-30 pointer-events-none" />

      <div className="max-w-5xl mx-auto space-y-6 relative z-10 animate-slide-up">
        {/* ── Page Header ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-100 via-slate-200 to-slate-400">
              Discover Issues
            </h1>
            <p className="mt-1 text-muted-foreground text-sm font-medium flex items-center gap-2">
              <span>Open source issues curated for your skills</span>
              {totalCount > 0 && !loading && (
                <>
                  <span className="text-white/10">•</span>
                  <span className="text-blue-400/90 font-semibold bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/15 font-mono text-xs">
                    {totalCount.toLocaleString()} matches
                  </span>
                </>
              )}
            </p>
          </div>

          {/* Quick Toolbar */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchIssues(1, true)}
              disabled={loading}
              className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-muted-foreground hover:text-white hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-300 disabled:opacity-50"
              title="Refresh matches"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-400" : ""}`} />
            </button>

            {/* Sort toggle */}
            <div className="flex items-center bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
              {[
                { value: "recommended", label: "Best Match" },
                { value: "newest", label: "Newest" },
                { value: "updated", label: "Active" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFilterSort(opt.value)}
                  className={`px-3 py-2 text-xs font-semibold transition-all duration-200 ${
                    filterSort === opt.value
                      ? "bg-blue-600/20 text-blue-400 border-r border-blue-500/20"
                      : "text-[#64748B] hover:text-[#94A3B8] hover:bg-white/[0.03] border-r border-white/[0.06] last:border-r-0"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 border ${
                showFilters
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-500/50 shadow-[0_4px_20px_rgba(59,130,246,0.3),inset_0_1px_1px_rgba(255,255,255,0.2)]"
                  : "text-slate-300 bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12]"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Filters</span>
              {activeFiltersCount > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${showFilters ? "bg-white text-blue-600" : "bg-blue-500/20 text-blue-400"}`}>
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── Modern Search Bar & Collapsible Filters ── */}
        <div className="glass-panel p-2 shadow-2xl relative border border-white/[0.04] bg-slate-900/40 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-3 py-1">
            <Search className="w-5 h-5 text-muted-foreground/60 flex-shrink-0" />
            <input
              type="text"
              placeholder="Filter by repository name, issue title, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border-0 text-slate-100 placeholder-muted-foreground/50 text-sm focus:ring-0 focus:outline-none py-2"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="text-xs text-muted-foreground hover:text-white px-2 py-1 rounded bg-white/5 border border-white/[0.06] transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* ── Segmented Filters Section (Collapsible) ── */}
          {showFilters && (
            <div className="border-t border-white/[0.04] mt-2 pt-4 pb-2 px-3 space-y-4 animate-popup">
              {/* Experience level */}
              <div>
                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-2 font-mono">
                  Difficulty Level
                </p>
                <div className="flex gap-2 flex-wrap">
                  {LEVEL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFilterLevel(opt.value)}
                      className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all duration-300 ${
                        filterLevel === opt.value
                          ? "bg-blue-600/15 text-blue-400 border-blue-500/35 shadow-[0_0_15px_rgba(59,130,246,0.12)]"
                          : "border-white/[0.06] text-slate-400 hover:border-white/[0.12] hover:text-white bg-white/[0.01]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Language filter */}
              <div>
                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-2 font-mono">
                  Languages
                </p>
                <div className="flex gap-2 flex-wrap">
                  {LANG_OPTIONS.map((lang) => (
                    <button
                      key={lang}
                      onClick={() => toggleLangFilter(lang)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-300 capitalize ${
                        filterLangs.includes(lang)
                          ? "bg-blue-600/15 text-blue-400 border-blue-500/35 shadow-[0_0_15px_rgba(59,130,246,0.12)]"
                          : "border-white/[0.06] text-slate-400 hover:border-white/[0.12] hover:text-white bg-white/[0.01]"
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                  {filterLangs.length > 0 && (
                    <button
                      onClick={() => setFilterLangs([])}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all duration-300"
                    >
                      Reset Languages
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Error state ── */}
        {error && (
          <div className="bg-rose-500/5 border border-rose-500/15 rounded-2xl p-5 flex items-start gap-3.5 shadow-lg">
            <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-rose-400">Could not fetch matches</p>
              <p className="text-xs text-rose-300/80 mt-1 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* ── Loading state (Shimmer-Dark Skeletons) ── */}
        {loading && filteredIssues.length === 0 && (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="tactile-card p-6 border border-white/[0.04] bg-[#10141D]/90 h-[190px] flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="h-5 shimmer-dark rounded-lg w-48" />
                    <div className="h-5 shimmer-dark rounded-full w-20" />
                  </div>
                  <div className="h-6 shimmer-dark rounded-lg w-3/4" />
                  <div className="h-4 shimmer-dark rounded-lg w-full" />
                </div>
                <div className="flex justify-between items-center pt-4 border-t border-white/[0.03]">
                  <div className="h-4 shimmer-dark rounded w-32" />
                  <div className="h-4 shimmer-dark rounded w-20" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && filteredIssues.length === 0 && !error && (
          <div className="glass-panel p-16 text-center border border-white/[0.04] bg-slate-900/20 shadow-xl">
            <div className="w-12 h-12 bg-white/[0.02] border border-white/[0.06] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.01)]">
              <Search className="w-5 h-5 text-muted-foreground/60" />
            </div>
            <p className="text-slate-200 font-bold text-base">No open source issues found</p>
            <p className="text-muted-foreground text-xs mt-1.5 max-w-sm mx-auto leading-relaxed">
              We couldn&apos;t find matching issues. Try refining your local search query or expanding the repository languages in the filters panel.
            </p>
          </div>
        )}

        {/* ── Issue list ── */}
        <div className="space-y-4">
          {filteredIssues.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              onSave={handleSaveIssue}
            />
          ))}
        </div>

        {/* ── Load more ── */}
        {hasNext && !loading && (
          <div className="mt-8 text-center">
            <button
              onClick={() => fetchIssues(page + 1, false)}
              className="px-6 py-3 rounded-xl border border-white/[0.06] bg-white/[0.01] text-sm font-semibold text-slate-300 hover:bg-white/[0.04] hover:text-white hover:border-white/[0.12] transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.15)] hover:scale-102 active:scale-98"
            >
              Load more issues
            </button>
          </div>
        )}

        {/* Loading indicator for "load more" */}
        {loading && filteredIssues.length > 0 && (
          <div className="mt-8 text-center flex items-center justify-center gap-2.5 text-xs text-muted-foreground/80 font-mono tracking-wider uppercase">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
            <span>Scanning repositories...</span>
          </div>
        )}
      </div>
    </>
  );
}