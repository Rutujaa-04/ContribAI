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
// ============================================================

"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import {
  GitPullRequest, Loader2, Copy, Check, ChevronDown, ChevronUp,
} from "lucide-react";

interface PRDraft {
  title: string;
  body: string;
}

interface PRDraftPanelProps {
  issueId: string;
  issueNumber: number;
}

export default function PRDraftPanel({ issueId, issueNumber }: PRDraftPanelProps) {
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
    } catch (e: any) {
      const msg = e?.response?.data?.detail || "Failed to generate draft. Please try again.";
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
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">

      {/* ── Collapsible header ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
            <GitPullRequest className="w-4 h-4 text-green-600" />
          </div>
          <div className="text-left">
            <h2 className="text-sm font-semibold text-gray-900">PR Draft Generator</h2>
            <p className="text-xs text-gray-400">Generate a pull request title and description</p>
          </div>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-gray-400" />
          : <ChevronDown className="w-4 h-4 text-gray-400" />
        }
      </button>

      {/* ── Panel body ── */}
      {open && (
        <div className="px-6 pb-6 border-t border-gray-50 pt-5 space-y-4">

          {/* User summary input */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              What did you do to fix this issue?
            </label>
            <textarea
              value={userSummary}
              onChange={(e) => setUserSummary(e.target.value)}
              placeholder={`e.g. "I added a null check in the handleSubmit function in src/form.ts and added a unit test covering the edge case where the input is undefined."`}
              rows={4}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-gray-400 placeholder:text-gray-300 leading-relaxed"
            />
            <p className="text-xs text-gray-400 mt-1">
              A sentence or two is enough — be specific about what you changed.
            </p>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={loading || !userSummary.trim()}
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium px-4 py-2.5 rounded-xl transition-colors text-sm"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <GitPullRequest className="w-4 h-4" />
            )}
            {loading ? "Generating..." : "Generate PR Draft"}
          </button>

          {/* Error */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          {/* Draft output */}
          {draft && (
            <div className="space-y-3">

              {/* PR Title */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    PR Title
                  </span>
                  <button
                    onClick={() => copyToClipboard(draft.title, "title")}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    {copiedTitle
                      ? <><Check className="w-3 h-3 text-green-500" /> Copied</>
                      : <><Copy className="w-3 h-3" /> Copy</>
                    }
                  </button>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-900">
                  {draft.title}
                </div>
              </div>

              {/* PR Body */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    PR Description
                  </span>
                  <button
                    onClick={() => copyToClipboard(draft.body, "body")}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    {copiedBody
                      ? <><Check className="w-3 h-3 text-green-500" /> Copied</>
                      : <><Copy className="w-3 h-3" /> Copy</>
                    }
                  </button>
                </div>
                <pre className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed font-mono overflow-x-auto max-h-72 overflow-y-auto">
                  {draft.body}
                </pre>
              </div>

              {/* Regenerate hint */}
              <p className="text-xs text-gray-400">
                Not quite right? Edit your description above and generate again.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}