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
import { Bookmark, BookmarkCheck, Clock, MessageSquare, ExternalLink, GitBranch, Sparkles } from "lucide-react";

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
    recommendation_score?: number;
    recommended?: boolean;
  };
  onSave: (issueId: string) => Promise<void>;
}

// ── Difficulty badge styling ──────────────────────────────────

const DIFFICULTY_STYLES: Record<string, string> = {
  beginner: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  intermediate: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  advanced: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  unknown: "bg-white/5 text-[#64748B] border border-white/[0.08]",
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
function labelStyle(hexColor: string): { backgroundColor: string; color: string; border: string } {
  // Simple approach: use the hex as a light background tint
  return {
    backgroundColor: `#${hexColor}18`,
    color: `#${hexColor}`,
    border: `1px solid #${hexColor}25`,
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
    <div className="tactile-card p-6 border border-white/[0.04] bg-gradient-to-br from-[#10141D]/90 to-[#0A0D14]/95 backdrop-blur-xl relative overflow-hidden group">
      
      {/* Dynamic hover-glow gradient ring inside card */}
      <span className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/[0.02] to-cyan-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-[1.25rem] pointer-events-none" />

      {/* ── Recommended badge ── */}
      {issue.recommended && (
        <div className="flex items-center gap-1.5 mb-3 relative z-10">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-gradient-to-r from-blue-500/15 to-cyan-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_12px_rgba(59,130,246,0.08)]">
            <Sparkles className="w-3 h-3" />
            Recommended for you
          </span>
          {issue.recommendation_score != null && (
            <span className="text-[10px] font-mono text-[#475569]">
              {issue.recommendation_score}% match
            </span>
          )}
        </div>
      )}

      {/* ── Top row: repo name + difficulty + save ── */}
      <div className="flex items-center justify-between gap-3 mb-4 relative z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Repo pill */}
          <div className="flex items-center gap-1.5 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-1.5 min-w-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.01)] group-hover:border-blue-500/20 transition-all duration-300">
            <GitBranch className="w-3.5 h-3.5 text-blue-400/80 flex-shrink-0" />
            <span className="text-xs font-mono text-slate-400 group-hover:text-slate-200 transition-colors truncate">
              {issue.full_name}
            </span>
          </div>
          {/* Issue number */}
          <span className="text-xs text-muted-foreground/70 font-mono flex-shrink-0">
            #{issue.github_issue_number}
          </span>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Difficulty badge */}
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm tracking-wide ${DIFFICULTY_STYLES[issue.difficulty] || DIFFICULTY_STYLES.unknown}`}>
            {DIFFICULTY_LABELS[issue.difficulty] || "Unknown"}
          </span>

          {/* Save button with scale pops and blue glow rings */}
          <button
            onClick={handleSave}
            disabled={saving}
            title={saved ? "Saved to dashboard" : "Save to dashboard"}
            className={`
              w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300 border
              ${saved
                ? "bg-blue-500/10 text-cyan-400 border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.15)] scale-105"
                : "text-slate-400 bg-white/[0.02] border-white/[0.06] hover:text-white hover:bg-white/[0.06] hover:border-white/[0.12] hover:scale-105 active:scale-95"
              }
              ${saving ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            `}
          >
            {saving ? (
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-current" />
            ) : saved ? (
              <BookmarkCheck className="w-4 h-4 text-cyan-400" />
            ) : (
              <Bookmark className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* ── Title ── */}
      <Link
        href={`/issues/${issue.id}`}
        className="block mb-3.5 relative z-10"
      >
        <h3 className="text-base font-bold text-slate-200 leading-snug group-hover:text-blue-400 transition-colors duration-300 line-clamp-2">
          {issue.title}
        </h3>
      </Link>

      {/* ── Body preview ── */}
      {issue.body && (
        <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2 mb-4 relative z-10">
          {issue.body.replace(/#{1,6}\s/g, "").replace(/\*\*/g, "").trim()}
        </p>
      )}

      {/* ── Labels ── */}
      {issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 relative z-10">
          {issue.labels.slice(0, 4).map((label) => (
            <span
              key={label.name}
              className="text-[10px] px-2.5 py-1 rounded-lg font-semibold tracking-wider uppercase border"
              style={labelStyle(label.color)}
            >
              {label.name}
            </span>
          ))}
          {issue.labels.length > 4 && (
            <span className="text-[10px] font-mono text-muted-foreground/60 px-2 py-1">
              +{issue.labels.length - 4} more
            </span>
          )}
        </div>
      )}

      {/* ── Footer: meta info + link ── */}
      <div className="flex items-center justify-between pt-4 border-t border-white/[0.04] relative z-10">
        <div className="flex items-center gap-4 text-xs text-muted-foreground/65 font-medium">
          {/* Time estimate if available */}
          {issue.estimated_hours && (
            <span className="flex items-center gap-1.5 text-blue-400/80">
              <Clock className="w-3.5 h-3.5" />
              <span>~{issue.estimated_hours}h est</span>
            </span>
          )}
          {/* Comment count */}
          <span className="flex items-center gap-1.5 hover:text-slate-300 transition-colors">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{issue.comment_count}</span>
          </span>
          {/* Age */}
          <span className="font-mono text-[10px] opacity-80">{timeAgo(issue.created_at)}</span>
        </div>

        {/* External link */}
        <a
          href={issue.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-cyan-400 font-medium transition-all duration-300 group/link"
        >
          <span>GitHub</span>
          <ExternalLink className="w-3.5 h-3.5 transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 text-muted-foreground/40 group-hover/link:text-cyan-400" />
        </a>
      </div>
    </div>
  );
}