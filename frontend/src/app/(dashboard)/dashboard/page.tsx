"use client";

// ============================================================
// src/app/(dashboard)/page.tsx
// ============================================================
// My Dashboard page. Shows:
// - Stats: total saved, in progress, submitted, merged
// - List of saved issues grouped by status
// - Quick actions: update status, add PR url, view issue
// ============================================================

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import Link from "next/link";
import {
  GitBranch, Clock, CheckCircle2, GitPullRequest,
  Bookmark, TrendingUp, ExternalLink, ChevronRight,
  Loader2, AlertCircle, Trophy, Zap, Circle
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────

interface Issue {
  id: string;
  github_issue_number: number;
  repo_owner: string;
  repo_name: string;
  title: string;
  labels: { name: string; color: string }[];
  difficulty: string;
  estimated_hours: number | null;
  comment_count: number;
  html_url: string;
  created_at: string;
}

interface UserIssue {
  user_issue_id: string;
  status: string;
  pr_url: string | null;
  notes: string | null;
  saved_at: string;
  updated_at: string;
  checklist_progress: Record<string, boolean>;
  issue: Issue;
}

interface Stats {
  total_saved: number;
  in_progress: number;
  submitted: number;
  merged: number;
  current_streak: number;
  longest_streak: number;
}

// ── Constants ─────────────────────────────────────────────────

// ── Constants ─────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  glowColor: string;
  icon: React.ReactNode;
}> = {
  saved: {
    label: "Saved",
    color: "text-slate-400",
    bgColor: "bg-white/[0.02]",
    borderColor: "border-white/[0.06]",
    glowColor: "rgba(255, 255, 255, 0.05)",
    icon: <Bookmark className="w-3.5 h-3.5" />,
  },
  in_progress: {
    label: "In Progress",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    glowColor: "rgba(59, 130, 246, 0.15)",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  submitted: {
    label: "Submitted",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
    glowColor: "rgba(139, 92, 246, 0.15)",
    icon: <GitPullRequest className="w-3.5 h-3.5" />,
  },
  merged: {
    label: "Merged",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    glowColor: "rgba(16, 185, 129, 0.15)",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  closed: {
    label: "Closed",
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/20",
    glowColor: "rgba(244, 63, 94, 0.15)",
    icon: <Circle className="w-3.5 h-3.5" />,
  },
};

const VALID_STATUSES = ["saved", "in_progress", "submitted", "merged", "closed"];

const DIFFICULTY_STYLES: Record<string, string> = {
  beginner: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15",
  intermediate: "bg-blue-500/10 text-blue-400 border border-blue-500/15",
  advanced: "bg-purple-500/10 text-purple-400 border border-purple-500/15",
  unknown: "bg-white/5 text-[#64748B] border border-white/[0.08]",
};

function timeAgo(dateStr: string): string {
  const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

// ── PR URL Modal ───────────────────────────────────────────────

function PRModal({
  issueId,
  currentPrUrl,
  onClose,
  onSave,
}: {
  issueId: string;
  currentPrUrl: string | null;
  onClose: () => void;
  onSave: (prUrl: string) => void;
}) {
  const [prUrl, setPrUrl] = useState(currentPrUrl || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.patch(`/users/me/contributions/${issueId}`, {
        status: "submitted",
        pr_url: prUrl,
      });
      onSave(prUrl);
      onClose();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md px-4">
      <div className="w-full max-w-md bg-[#10141D] border border-white/[0.06] rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] p-6 relative overflow-hidden animate-popup">
        {/* Glow accent */}
        <div className="absolute -top-[30%] left-[20%] w-60 h-60 bg-blue-500/10 rounded-full blur-[50px] pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20">
              <GitPullRequest className="w-4 h-4 text-blue-400 animate-pulse" />
            </div>
            <h3 className="text-base font-bold text-slate-100">Add PR Link</h3>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">
            Link your GitHub Pull Request URL to update this issue&apos;s state to Submitted.
          </p>
          <input
            type="url"
            value={prUrl}
            onChange={(e) => setPrUrl(e.target.value)}
            placeholder="https://github.com/owner/repo/pull/123"
            className="w-full premium-input text-sm px-4 py-3 mb-5"
          />
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-white/[0.06] text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/[0.03] transition-all duration-300"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !prUrl}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-[0_4px_15px_rgba(59,130,246,0.3)] disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed transition-all duration-300"
            >
              {saving ? "Saving URL..." : "Save pull request"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Issue Row ──────────────────────────────────────────────────

function IssueRow({
  userIssue,
  onStatusChange,
  onPRAdded,
}: {
  userIssue: UserIssue;
  onStatusChange: (id: string, status: string) => void;
  onPRAdded: (id: string, prUrl: string) => void;
}) {
  const [showPRModal, setShowPRModal] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const { issue } = userIssue;
  const statusCfg = STATUS_CONFIG[userIssue.status] || STATUS_CONFIG.saved;

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === userIssue.status) return;
    if (newStatus === "submitted") {
      setShowPRModal(true);
      return;
    }
    setUpdatingStatus(true);
    try {
      await apiClient.patch(`/users/me/contributions/${issue.id}`, { status: newStatus });
      onStatusChange(userIssue.user_issue_id, newStatus);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Count completed checklist steps
  const completedSteps = Object.values(userIssue.checklist_progress).filter(Boolean).length;
  const totalSteps = Object.keys(userIssue.checklist_progress).length;

  return (
    <>
      {showPRModal && (
        <PRModal
          issueId={issue.id}
          currentPrUrl={userIssue.pr_url}
          onClose={() => setShowPRModal(false)}
          onSave={(prUrl) => {
            onPRAdded(userIssue.user_issue_id, prUrl);
            onStatusChange(userIssue.user_issue_id, "submitted");
          }}
        />
      )}

      <div className="tactile-card p-5 border border-white/[0.04] bg-gradient-to-br from-[#10141D]/90 to-[#0A0D14]/95 backdrop-blur-xl relative overflow-hidden group">
        {/* Glow glow on active card */}
        <span className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/[0.01] to-indigo-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none rounded-[1.25rem]" />

        {/* Top row */}
        <div className="flex items-center justify-between gap-3 mb-3.5 relative z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-1.5 bg-white/[0.03] border border-white/[0.06] rounded-xl px-2.5 py-1 flex-shrink-0 group-hover:border-blue-500/20 transition-all duration-300">
              <GitBranch className="w-3.5 h-3.5 text-blue-400/80" />
              <span className="text-xs font-mono text-slate-400 group-hover:text-slate-200 transition-colors">
                {issue.repo_owner}/{issue.repo_name}
              </span>
            </div>
            <span className="text-xs text-muted-foreground/60 font-mono">#{issue.github_issue_number}</span>
          </div>

          {/* Status selector */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {updatingStatus && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
            )}
            <select
              value={userIssue.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl border cursor-pointer focus:outline-none transition-all duration-300 bg-slate-900 shadow-sm ${statusCfg.color} ${statusCfg.bgColor} ${statusCfg.borderColor}`}
            >
              {VALID_STATUSES.map((s) => (
                <option key={s} value={s} className="bg-[#10141D] text-slate-200">
                  {STATUS_CONFIG[s]?.label || s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Title */}
        <Link href={`/issues/${issue.id}`} className="block mb-3 relative z-10">
          <h3 className="text-sm font-bold text-slate-200 leading-snug hover:text-blue-400 transition-colors duration-300 line-clamp-2">
            {issue.title}
          </h3>
        </Link>

        {/* Labels + difficulty */}
        <div className="flex items-center gap-2 flex-wrap mb-4 relative z-10">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${DIFFICULTY_STYLES[issue.difficulty] || DIFFICULTY_STYLES.unknown}`}>
            {issue.difficulty}
          </span>
          {issue.labels.slice(0, 3).map((label) => (
            <span
              key={label.name}
              className="text-[10px] px-2 py-0.5 rounded-md font-semibold border"
              style={{
                backgroundColor: `#${label.color}15`,
                color: `#${label.color}`,
                borderColor: `#${label.color}25`,
              }}
            >
              {label.name}
            </span>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-white/[0.04] relative z-10">
          <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground/65">
            <span className="font-medium">Saved {timeAgo(userIssue.saved_at)}</span>
            {totalSteps > 0 && (
              <span className="flex items-center gap-1.5 text-blue-400/80 bg-blue-500/5 px-2 py-0.5 border border-blue-500/10 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{completedSteps}/{totalSteps} steps completed</span>
              </span>
            )}
            {userIssue.pr_url && (
              <a
                href={userIssue.pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-purple-400 hover:text-purple-300 hover:underline transition-all duration-300"
              >
                <GitPullRequest className="w-3.5 h-3.5" />
                <span>PR Connected</span>
              </a>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Add PR URL button */}
            {(userIssue.status === "in_progress" || userIssue.status === "submitted") && (
              <button
                onClick={() => setShowPRModal(true)}
                className="text-xs font-bold text-slate-400 hover:text-blue-400 hover:underline transition-all duration-300"
              >
                {userIssue.pr_url ? "Update PR Link" : "+ Link PR"}
              </button>
            )}

            <Link
              href={`/issues/${issue.id}`}
              className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-cyan-400 transition-all duration-300 group/view"
            >
              <span>Guide</span>
              <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover/view:translate-x-0.5 text-muted-foreground/45 group-hover/view:text-cyan-400" />
            </Link>

            <a
              href={issue.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#334155] hover:text-slate-300 transition-colors duration-300"
              title="Open GitHub page"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main Component ─────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [savedIssues, setSavedIssues] = useState<UserIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");

  useEffect(() => {
    async function loadDashboard() {
      try {
        const res = await apiClient.get("/users/me/dashboard");
        setStats(res.data.stats);
        setSavedIssues(res.data.saved_issues);
      } catch {
        setError("Failed to load dashboard.");
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  const handleStatusChange = (userIssueId: string, newStatus: string) => {
    setSavedIssues((prev) =>
      prev.map((ui) =>
        ui.user_issue_id === userIssueId ? { ...ui, status: newStatus } : ui
      )
    );
    // Update stats
    setStats((prev) => {
      if (!prev) return prev;
      const issue = savedIssues.find((ui) => ui.user_issue_id === userIssueId);
      if (!issue) return prev;
      const updated = { ...prev };
      if (issue.status === "in_progress") updated.in_progress = Math.max(0, updated.in_progress - 1);
      if (issue.status === "submitted") updated.submitted = Math.max(0, updated.submitted - 1);
      if (issue.status === "merged") updated.merged = Math.max(0, updated.merged - 1);
      if (newStatus === "in_progress") updated.in_progress += 1;
      if (newStatus === "submitted") updated.submitted += 1;
      if (newStatus === "merged") updated.merged += 1;
      return updated;
    });
  };

  const handlePRAdded = (userIssueId: string, prUrl: string) => {
    setSavedIssues((prev) =>
      prev.map((ui) =>
        ui.user_issue_id === userIssueId ? { ...ui, pr_url: prUrl } : ui
      )
    );
  };

  // Filter issues by active tab
  const filteredIssues = activeTab === "all"
    ? savedIssues
    : savedIssues.filter((ui) => ui.status === activeTab);

  const tabs = [
    { key: "all", label: "All", count: savedIssues.length },
    { key: "saved", label: "Saved", count: savedIssues.filter((ui) => ui.status === "saved").length },
    { key: "in_progress", label: "In Progress", count: savedIssues.filter((ui) => ui.status === "in_progress").length },
    { key: "submitted", label: "Submitted", count: savedIssues.filter((ui) => ui.status === "submitted").length },
    { key: "merged", label: "Merged", count: savedIssues.filter((ui) => ui.status === "merged").length },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-500/5 border border-rose-500/15 rounded-2xl p-5 flex items-start gap-3.5 shadow-lg">
        <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-rose-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-slide-up relative">
      {/* Mesh blobs for page depth */}
      <div className="absolute top-0 left-1/4 w-80 h-80 mesh-blob-blue opacity-30 pointer-events-none" />
      <div className="absolute top-[30%] right-10 w-96 h-96 mesh-blob-purple opacity-20 pointer-events-none" />

      {/* ── Page header ── */}
      <div className="relative z-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-100 via-slate-200 to-slate-400">
          My Dashboard
        </h1>
        <p className="mt-1 text-muted-foreground text-sm font-medium">Track your open source contribution journey</p>
      </div>

      {/* ── Stats grid ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
          {/* Total Saved */}
          <div className="tactile-card p-5 border border-white/[0.04] bg-gradient-to-br from-[#10141D]/90 to-[#0A0D14]/95 flex flex-col justify-between hover:border-slate-500/20 transition-all duration-300">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Total Saved</span>
              <div className="w-8 h-8 bg-slate-500/10 border border-slate-500/20 rounded-xl flex items-center justify-center shadow-inner">
                <Bookmark className="w-4 h-4 text-slate-400" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-slate-100 tracking-tight font-sans">{stats.total_saved}</div>
          </div>

          {/* In Progress */}
          <div className="tactile-card p-5 border border-white/[0.04] bg-gradient-to-br from-[#10141D]/90 to-[#0A0D14]/95 flex flex-col justify-between hover:border-blue-500/20 transition-all duration-300 relative group overflow-hidden">
            <div className="absolute inset-0 bg-blue-500/[0.01] pointer-events-none" />
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">In Progress</span>
              <div className="w-8 h-8 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center shadow-[0_0_10px_rgba(59,130,246,0.1)]">
                <Zap className="w-4 h-4 text-blue-400 animate-pulse" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-blue-400 tracking-tight font-sans">{stats.in_progress}</div>
          </div>

          {/* Submitted */}
          <div className="tactile-card p-5 border border-white/[0.04] bg-gradient-to-br from-[#10141D]/90 to-[#0A0D14]/95 flex flex-col justify-between hover:border-purple-500/20 transition-all duration-300 relative overflow-hidden">
            <div className="absolute inset-0 bg-purple-500/[0.01] pointer-events-none" />
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Submitted</span>
              <div className="w-8 h-8 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-center shadow-[0_0_10px_rgba(139,92,246,0.1)]">
                <GitPullRequest className="w-4 h-4 text-purple-400" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-purple-400 tracking-tight font-sans">{stats.submitted}</div>
          </div>

          {/* Merged */}
          <div className="tactile-card p-5 border border-white/[0.04] bg-gradient-to-br from-[#10141D]/90 to-[#0A0D14]/95 flex flex-col justify-between hover:border-emerald-500/20 transition-all duration-300 relative overflow-hidden">
            <div className="absolute inset-0 bg-emerald-500/[0.01] pointer-events-none" />
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Merged</span>
              <div className="w-8 h-8 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center shadow-[0_0_10px_rgba(16,185,129,0.15)]">
                <Trophy className="w-4 h-4 text-emerald-400" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-emerald-400 tracking-tight font-sans">{stats.merged}</div>
          </div>
        </div>
      )}

      {/* ── Segmented Control Tabs ── */}
      <div className="relative z-10 flex items-center gap-1.5 bg-slate-900/50 backdrop-blur-md rounded-2xl p-1.5 w-fit border border-white/[0.04] shadow-inner">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 border ${
                isActive
                  ? "bg-[#161F30]/80 text-white border-blue-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.03),0_2px_8px_rgba(0,0,0,0.4)]"
                  : "text-muted-foreground hover:text-slate-200 border-transparent hover:bg-white/[0.02]"
              }`}
            >
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md font-mono ${
                  isActive ? "bg-blue-500/20 text-blue-400" : "bg-white/5 text-muted-foreground/60"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Issue list ── */}
      <div className="relative z-10">
        {filteredIssues.length === 0 ? (
          <div className="glass-panel p-16 text-center border border-white/[0.04] bg-slate-900/20 shadow-xl max-w-xl mx-auto animate-popup">
            <div className="w-12 h-12 bg-white/[0.02] border border-white/[0.06] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-5 h-5 text-muted-foreground/60" />
            </div>
            <p className="text-slate-200 font-bold text-base mb-1.5">
              {activeTab === "all" ? "No contributions tracked yet" : `No ${STATUS_CONFIG[activeTab]?.label.toLowerCase()} issues`}
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed max-w-sm mx-auto mb-6">
              {activeTab === "all"
                ? "Start searching or exploring repo structures inside the Discovery view to find your ideal issue matches."
                : "No issues under this filter. Update the task state drop-downs on your saved issues to categorise them."}
            </p>
            {activeTab === "all" && (
              <Link
                href="/discover"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold px-4.5 py-2.5 rounded-xl shadow-[0_4px_15px_rgba(59,130,246,0.3)] transition-all duration-300 hover:scale-102 active:scale-98"
              >
                <span>Explore curation stream</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4 animate-popup">
            {filteredIssues.map((ui) => (
              <IssueRow
                key={ui.user_issue_id}
                userIssue={ui}
                onStatusChange={handleStatusChange}
                onPRAdded={handlePRAdded}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}