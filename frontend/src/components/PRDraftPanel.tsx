// ============================================================
// src/components/PRDraftPanel.tsx
// ============================================================
// Shown below the AI analysis panel on the issue detail page.
// Only renders once an analysis exists (needs that context).
//
// Flow:
// 1. User writes a short summary of what they did
// 2. Clicks "Generate PR Draft"
// 3. Backend calls OpenRouter → returns { title, body }
// 4. Draft is shown in a copyable box, split into title + body
//
// Usage in issue_detail_page.tsx:
//   import PRDraftPanel from "@/components/PRDraftPanel";
//   ...
//   {analysis && (
//     <PRDraftPanel issueId={issue.id} issueNumber={issue.github_issue_number} />
//   )}
// Redesigned high-fidelity PR Draft Generator Console.
// Styled to resemble a modern premium developer workspace editor.
// Includes glassmorphic surfaces, tactile inputs, custom IDE output themes,
// and smooth interactive states.
// ============================================================

"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import {
  GitPullRequest, Loader2, Copy, Check, ChevronDown, ChevronUp, Sparkles, Terminal
} from "lucide-react";

interface PRDraft {
  title: string;
  body: string;
}

interface PRDraftPanelProps {
  issueId: string;
  issueNumber: number;
}

export default function PRDraftPanel({ issueId }: PRDraftPanelProps) {
  const [open, setOpen] = useState(false);           // Panel collapsed by default
  const [userSummary, setUserSummary] = useState(""); 
  const [draft, setDraft] = useState<PRDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedTitle, setCopiedTitle] = useState(false);
  const [copiedBody, setCopiedBody] = useState(false);

  const handleGenerate = async () => {
    if (!userSummary.trim()) return;
    setLoading(true);
    setError(null);
    setDraft(null);

    try {
      const res = await apiClient.post(`/issues/${issueId}/pr-draft`, {
        user_summary: userSummary,
      });
      setDraft(res.data);
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = e as any;
      const msg = err?.response?.data?.detail || "Failed to generate draft. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, which: "title" | "body") => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "title") {
        setCopiedTitle(true);
        setTimeout(() => setCopiedTitle(false), 2000);
      } else {
        setCopiedBody(true);
        setTimeout(() => setCopiedBody(false), 2000);
      }
    } catch {
      // Clipboard API not available — silently ignore
    }
  };

  return (
    <div className="tactile-card bg-card overflow-hidden">

      {/* ── Collapsible header ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-all duration-200 select-none cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.1)]">
            <GitPullRequest className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="text-left">
            <h2 className="text-sm font-bold text-[#E2E8F0] tracking-tight">PR Draft Generator</h2>
            <p className="text-[11px] text-[#475569] font-medium">Generate structured title and descriptions using AI analysis</p>
          </div>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-[#475569]" />
          : <ChevronDown className="w-4 h-4 text-[#475569]" />
        }
      </button>

      {/* ── Panel body ── */}
      {open && (
        <div className="px-6 pb-6 border-t border-white/[0.04] pt-5 space-y-5 animate-slide-up">

          {/* User summary input */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
              Describe your contribution changes
            </label>
            <textarea
              value={userSummary}
              onChange={(e) => setUserSummary(e.target.value)}
              placeholder={`e.g. "I added a null check in the handleSubmit function in src/form.ts and wrote a unit test covering when inputs are undefined."`}
              rows={4}
              className="w-full text-sm bg-[#080B10]/60 border border-white/[0.06] rounded-xl px-4 py-3 resize-none focus:outline-none focus:border-emerald-500/40 focus:ring-4 focus:ring-emerald-500/5 text-[#E2E8F0] placeholder:text-[#475569] leading-relaxed transition-all duration-200"
            />
            <p className="text-[11px] text-[#475569] font-medium">
              A brief sentence or two outlining files modified and core fixes is perfect.
            </p>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={loading || !userSummary.trim()}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-[#1E293B] disabled:to-[#1E293B] disabled:text-[#475569] text-white font-bold px-5 py-3 rounded-xl transition-all duration-200 text-xs uppercase tracking-wider shadow-[0_4px_20px_rgba(16,185,129,0.2)] select-none cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {loading ? "Generating pull request draft..." : "Generate PR Draft"}
          </button>

          {/* Error */}
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
              {error}
            </div>
          )}

          {/* Draft output */}
          {draft && (
            <div className="space-y-4 pt-4 border-t border-white/[0.04]">

              {/* PR Title */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">
                    PR Title
                  </span>
                  <button
                    onClick={() => copyToClipboard(draft.title, "title")}
                    className="flex items-center gap-1.5 text-xs text-[#475569] hover:text-[#E2E8F0] transition-colors duration-200 font-bold select-none cursor-pointer"
                  >
                    {copiedTitle ? (
                      <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide">
                        <Check className="w-3 h-3" /> Copied!
                      </span>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy Title
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-[#080B10]/60 border border-white/[0.06] rounded-xl px-4 py-3 text-xs font-mono font-bold text-[#3B82F6] select-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)]">
                  {draft.title}
                </div>
              </div>

              {/* PR Body */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 text-[#64748B]" />
                    <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">
                      PR Description Body (Markdown)
                    </span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(draft.body, "body")}
                    className="flex items-center gap-1.5 text-xs text-[#475569] hover:text-[#E2E8F0] transition-colors duration-200 font-bold select-none cursor-pointer"
                  >
                    {copiedBody ? (
                      <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide">
                        <Check className="w-3 h-3" /> Copied!
                      </span>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy Description
                      </>
                    )}
                  </button>
                </div>
                <pre className="bg-[#080B10]/60 border border-white/[0.06] rounded-xl px-4 py-3.5 text-xs text-[#94A3B8] whitespace-pre-wrap leading-relaxed font-mono overflow-x-auto max-h-80 overflow-y-auto shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] pr-2">
                  {draft.body}
                </pre>
              </div>

              {/* Regenerate hint */}
              <p className="text-[10px] text-[#475569] font-medium text-center">
                Need edits? Refine your summary above and regenerate the pull request draft anytime.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}