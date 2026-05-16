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

const STATUS_CONFIG: Record<string, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
}> = {
  saved: {
    label: "Saved",
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
    icon: <Bookmark className="w-3.5 h-3.5" />,
  },
  in_progress: {
    label: "In Progress",
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  submitted: {
    label: "Submitted",
    color: "text-purple-700",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    icon: <GitPullRequest className="w-3.5 h-3.5" />,
  },
  merged: {
    label: "Merged",
    color: "text-green-700",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  closed: {
    label: "Closed",
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    icon: <Circle className="w-3.5 h-3.5" />,
  },
};

const VALID_STATUSES = ["saved", "in_progress", "submitted", "merged", "closed"];

const DIFFICULTY_STYLES: Record<string, string> = {
  beginner: "bg-green-100 text-green-800",
  intermediate: "bg-blue-100 text-blue-800",
  advanced: "bg-purple-100 text-purple-800",
  unknown: "bg-gray-100 text-gray-600",
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
  userIssueId,
  issueId,
  currentPrUrl,
  onClose,
  onSave,
}: {
  userIssueId: string;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Add PR URL</h3>
        <p className="text-xs text-gray-500 mb-4">Paste the GitHub pull request URL to mark as submitted.</p>
        <input
          type="url"
          value={prUrl}
          onChange={(e) => setPrUrl(e.target.value)}
          placeholder="https://github.com/owner/repo/pull/123"
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 mb-4 focus:outline-none focus:border-gray-400"
        />
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !prUrl}
            className="flex-1 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:bg-gray-300 transition-colors"
          >
            {saving ? "Saving..." : "Save PR"}
          </button>
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
          userIssueId={userIssue.user_issue_id}
          issueId={issue.id}
          currentPrUrl={userIssue.pr_url}
          onClose={() => setShowPRModal(false)}
          onSave={(prUrl) => {
            onPRAdded(userIssue.user_issue_id, prUrl);
            onStatusChange(userIssue.user_issue_id, "submitted");
          }}
        />
      )}

      <div className="bg-white rounded-xl border border-gray-100 p-4 hover:border-gray-200 transition-all">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-0.5 flex-shrink-0">
              <GitBranch className="w-3 h-3 text-gray-400" />
              <span className="text-xs font-mono text-gray-600">
                {issue.repo_owner}/{issue.repo_name}
              </span>
            </div>
            <span className="text-xs text-gray-400">#{issue.github_issue_number}</span>
          </div>

          {/* Status selector */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {updatingStatus ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
            ) : null}
            <select
              value={userIssue.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className={`text-xs font-medium px-2 py-1 rounded-lg border cursor-pointer focus:outline-none ${statusCfg.color} ${statusCfg.bgColor} ${statusCfg.borderColor}`}
            >
              {VALID_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_CONFIG[s]?.label || s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Title */}
        <Link href={`/issues/${issue.id}`} className="block mb-2">
          <h3 className="text-sm font-semibold text-gray-900 leading-snug hover:text-blue-600 transition-colors line-clamp-2">
            {issue.title}
          </h3>
        </Link>

        {/* Labels + difficulty */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${DIFFICULTY_STYLES[issue.difficulty] || DIFFICULTY_STYLES.unknown}`}>
            {issue.difficulty.charAt(0).toUpperCase() + issue.difficulty.slice(1)}
          </span>
          {issue.labels.slice(0, 3).map((label) => (
            <span
              key={label.name}
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: `#${label.color}22`,
                color: `#${label.color}`,
              }}
            >
              {label.name}
            </span>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-50">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>Saved {timeAgo(userIssue.saved_at)}</span>
            {totalSteps > 0 && (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {completedSteps}/{totalSteps} steps
              </span>
            )}
            {userIssue.pr_url && (
              <a
                href={userIssue.pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-purple-600 hover:text-purple-800 transition-colors"
              >
                <GitPullRequest className="w-3 h-3" />
                PR
              </a>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Add PR URL button */}
            {(userIssue.status === "in_progress" || userIssue.status === "submitted") && (
              <button
                onClick={() => setShowPRModal(true)}
                className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
              >
                {userIssue.pr_url ? "Edit PR" : "+ Add PR"}
              </button>
            )}

            <Link
              href={`/issues/${issue.id}`}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors"
            >
              View
              <ChevronRight className="w-3 h-3" />
            </Link>

            <a
              href={issue.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-300 hover:text-gray-600 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
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
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div>
      {/* ── Page header ── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">My Dashboard</h1>
        <p className="mt-1 text-gray-500 text-sm">Track your open source contribution journey</p>
      </div>

      {/* ── Stats grid ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center">
                <Bookmark className="w-3.5 h-3.5 text-gray-600" />
              </div>
              <span className="text-xs text-gray-500 font-medium">Total Saved</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.total_saved}</div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <span className="text-xs text-gray-500 font-medium">In Progress</span>
            </div>
            <div className="text-2xl font-bold text-blue-600">{stats.in_progress}</div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 bg-purple-50 rounded-lg flex items-center justify-center">
                <GitPullRequest className="w-3.5 h-3.5 text-purple-600" />
              </div>
              <span className="text-xs text-gray-500 font-medium">Submitted</span>
            </div>
            <div className="text-2xl font-bold text-purple-600">{stats.submitted}</div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 bg-green-50 rounded-lg flex items-center justify-center">
                <Trophy className="w-3.5 h-3.5 text-green-600" />
              </div>
              <span className="text-xs text-gray-500 font-medium">Merged</span>
            </div>
            <div className="text-2xl font-bold text-green-600">{stats.merged}</div>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key ? "bg-gray-100 text-gray-600" : "bg-gray-200 text-gray-500"
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Issue list ── */}
      {filteredIssues.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <TrendingUp className="w-6 h-6 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-900 mb-1">
            {activeTab === "all" ? "No saved issues yet" : `No ${STATUS_CONFIG[activeTab]?.label.toLowerCase()} issues`}
          </p>
          <p className="text-xs text-gray-400 mb-4">
            {activeTab === "all"
              ? "Head to Discover to find issues that match your skills."
              : "Change the status of an issue to see it here."}
          </p>
          {activeTab === "all" && (
            <Link
              href="/discover"
              className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-gray-700 transition-colors"
            >
              Discover Issues
              <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
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
  );
}