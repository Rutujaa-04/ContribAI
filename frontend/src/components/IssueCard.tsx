// ============================================================
// src/components/IssueCard.tsx
// ============================================================
// Renders a single issue in the discovery list.
// Shows: title, repo, difficulty badge, labels, save button.
//
// Props:
//   issue    — the issue data object
//   onSave   — callback when user clicks bookmark
//   isSaved  — whether this issue is already on their dashboard
// ============================================================

"use client";

import Link from "next/link";
import { useState } from "react";
import { Bookmark, BookmarkCheck, Clock, MessageSquare, ExternalLink, GitBranch } from "lucide-react";

// ── Types (inline — mirrors backend response shape) ───────────

interface IssueLabel {
  name: string;
  color: string;
}

export interface IssueCardProps {
  issue: {
    id: string;
    github_issue_number: number;
    repo_owner: string;
    repo_name: string;
    full_name: string;
    title: string;
    body: string;
    labels: IssueLabel[];
    difficulty: string;
    estimated_hours: number | null;
    comment_count: number;
    html_url: string;
    created_at: string;
    is_saved: boolean;
  };
  onSave: (issueId: string) => Promise<void>;
}

// ── Difficulty badge styling ──────────────────────────────────

const DIFFICULTY_STYLES: Record<string, string> = {
  beginner: "bg-green-100 text-green-800 border border-green-200",
  intermediate: "bg-blue-100 text-blue-800 border border-blue-200",
  advanced: "bg-purple-100 text-purple-800 border border-purple-200",
  unknown: "bg-gray-100 text-gray-600 border border-gray-200",
};

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  unknown: "Unknown",
};

// ── Helpers ───────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

// Converts a hex label color to a readable pill style
// GitHub label colors can be very dark or very light, so we
// always render them with a light background tint instead.
function labelStyle(hexColor: string): { backgroundColor: string; color: string } {
  // Simple approach: use the hex as a light background tint
  return {
    backgroundColor: `#${hexColor}22`, // 13% opacity
    color: `#${hexColor}`,
  };
}

// ── Component ─────────────────────────────────────────────────

export default function IssueCard({ issue, onSave }: IssueCardProps) {
  const [saved, setSaved] = useState(issue.is_saved);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.MouseEvent) => {
    e.preventDefault(); // Don't navigate if card is wrapped in a link
    if (saved || saving) return;
    setSaving(true);
    try {
      await onSave(issue.id);
      setSaved(true);
    } catch {
      // Keep it not-saved on error
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 hover:border-gray-300 hover:shadow-sm transition-all duration-200 group">

      {/* ── Top row: repo name + difficulty + save ── */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {/* Repo pill */}
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 min-w-0">
            <GitBranch className="w-3 h-3 text-gray-400 flex-shrink-0" />
            <span className="text-xs font-mono text-gray-600 truncate">
              {issue.full_name}
            </span>
          </div>
          {/* Issue number */}
          <span className="text-xs text-gray-400 flex-shrink-0">
            #{issue.github_issue_number}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Difficulty badge */}
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${DIFFICULTY_STYLES[issue.difficulty] || DIFFICULTY_STYLES.unknown}`}>
            {DIFFICULTY_LABELS[issue.difficulty] || "Unknown"}
          </span>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            title={saved ? "Saved to dashboard" : "Save to dashboard"}
            className={`
              w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200
              ${saved
                ? "bg-blue-50 text-blue-600"
                : "text-gray-300 hover:text-gray-600 hover:bg-gray-50"
              }
              ${saving ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            `}
          >
            {saving ? (
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-b border-current" />
            ) : saved ? (
              <BookmarkCheck className="w-4 h-4" />
            ) : (
              <Bookmark className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* ── Title ── */}
      <Link
        href={`/issues/${issue.id}`}
        className="block mb-3"
      >
        <h3 className="text-sm font-semibold text-gray-900 leading-snug group-hover:text-blue-600 transition-colors line-clamp-2">
          {issue.title}
        </h3>
      </Link>

      {/* ── Body preview ── */}
      {issue.body && (
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-3">
          {issue.body.replace(/#{1,6}\s/g, "").replace(/\*\*/g, "").trim()}
        </p>
      )}

      {/* ── Labels ── */}
      {issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {issue.labels.slice(0, 4).map((label) => (
            <span
              key={label.name}
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={labelStyle(label.color)}
            >
              {label.name}
            </span>
          ))}
          {issue.labels.length > 4 && (
            <span className="text-xs text-gray-400 px-2 py-0.5">
              +{issue.labels.length - 4} more
            </span>
          )}
        </div>
      )}

      {/* ── Footer: meta info + link ── */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-50">
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {/* Time estimate if available */}
          {issue.estimated_hours && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              ~{issue.estimated_hours}h
            </span>
          )}
          {/* Comment count */}
          <span className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            {issue.comment_count}
          </span>
          {/* Age */}
          <span>{timeAgo(issue.created_at)}</span>
        </div>

        {/* External link */}
        <a
          href={issue.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors"
        >
          View on GitHub
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}