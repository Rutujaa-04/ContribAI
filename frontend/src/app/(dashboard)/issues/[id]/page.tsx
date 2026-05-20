"use client";

// ============================================================
// src/app/(dashboard)/issues/[id]/page.tsx
// ============================================================
// Issue detail page. Shows:
// - Full issue title, body, labels, metadata
// - "Analyze with AI" button → calls Gemini
// - Analysis panel: plain explanation, file map,
//   implementation checklist, edge cases, test hints
// - Save / unsave button
// - Link to GitHub
// On load: fires POST /repos/ingest in background so the repo's
// code chunks are ready in pgvector when the user clicks Analyze.
// A small status pill shows "Indexing repo..." while it runs.
// ============================================================

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import {
  ArrowLeft, ExternalLink, Bookmark, BookmarkCheck,
  Brain, GitBranch, Clock, MessageSquare, ChevronRight,
  FileCode, CheckSquare, Square, AlertTriangle, TestTube,
  Loader2, RefreshCw, Info, Cpu, CheckCircle2
} from "lucide-react";
import PRDraftPanel from "@/components/PRDraftPanel";
import RepoOverview from "@/components/RepoOverview";

// ── Types ─────────────────────────────────────────────────────

interface FileMapItem {
  path: string;
  relevance: "primary" | "secondary" | "reference";
  reason: string;
}

interface ImplementationStep {
  order: number;
  title: string;
  description: string;
  completed?: boolean;
}

interface Analysis {
  plain_explanation: string;
  background: string;
  file_map: FileMapItem[];
  implementation_steps: ImplementationStep[];
  edge_cases: string[];
  test_hints: string;
  generated_at: string;
  cached: boolean;
  used_rag?: boolean;
  chunks_retrieved?: number;
}

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
  analysis: Analysis | null;
  user_issue: {
    status: string;
    pr_url: string | null;
    checklist_progress: Record<string, boolean>;
  } | null;
}

type IngestStatus = "idle" | "indexing" | "ready" | "cached" | "failed";

// ── Helpers ───────────────────────────────────────────────────

const DIFFICULTY_STYLES: Record<string, string> = {
  beginner: "bg-green-100 text-green-800 border border-green-200",
  intermediate: "bg-blue-100 text-blue-800 border border-blue-200",
  advanced: "bg-purple-100 text-purple-800 border border-purple-200",
  unknown: "bg-gray-100 text-gray-600 border border-gray-200",
};

const RELEVANCE_STYLES: Record<string, string> = {
  primary: "bg-blue-50 text-blue-700 border-blue-200",
  secondary: "bg-gray-50 text-gray-600 border-gray-200",
  reference: "bg-yellow-50 text-yellow-700 border-yellow-200",
};

function labelStyle(hexColor: string) {
  return {
    backgroundColor: `#${hexColor}22`,
    color: `#${hexColor}`,
  };
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function renderBody(body: string): string {
  return body
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .trim();
}

// ── Ingest status pill ────────────────────────────────────────

function IngestPill({ status }: { status: IngestStatus }) {
  if (status === "idle") return null;

  const config = {
    indexing: {
      text: "Indexing repo...",
      className: "bg-amber-50 text-amber-700 border-amber-200",
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    ready: {
      text: "Repo indexed",
      className: "bg-green-50 text-green-700 border-green-200",
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    cached: {
      text: "Repo index cached",
      className: "bg-gray-50 text-gray-500 border-gray-200",
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    failed: {
      text: "Index unavailable",
      className: "bg-red-50 text-red-600 border-red-200",
      icon: <Info className="w-3 h-3" />,
    },
  }[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${config.className}`}
    >
      {config.icon}
      {config.text}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────

export default function IssueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const issueId = params.id as string;

  const [issue, setIssue] = useState<Issue | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loadingIssue, setLoadingIssue] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingIssue, setSavingIssue] = useState(false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [ingestStatus, setIngestStatus] = useState<IngestStatus>("idle");

  // Prevent double-firing ingestion in React strict mode
  const ingestFiredRef = useRef(false);

  // ── Load issue on mount ────────────────────────────────────
  useEffect(() => {
    async function loadIssue() {
      try {
        const res = await apiClient.get(`/issues/${issueId}`);
        const data: Issue = res.data;
        setIssue(data);
        setSaved(!!data.user_issue);

        if (data.analysis) {
          setAnalysis(data.analysis as Analysis);
        }

        if (data.user_issue?.checklist_progress) {
          setChecklist(data.user_issue.checklist_progress);
        }
      } catch (e) {
        setError("Could not load issue.");
      } finally {
        setLoadingIssue(false);
      }
    }
    loadIssue();
  }, [issueId]);

  // ── Background ingestion trigger ───────────────────────────
  useEffect(() => {
    if (!issue || ingestFiredRef.current) return;
    ingestFiredRef.current = true;

    async function triggerIngestion() {
      setIngestStatus("indexing");
      try {
        const res = await apiClient.post("/repos/ingest", {
          owner: issue!.repo_owner,
          repo: issue!.repo_name,
        });
        const status = res.data?.status;
        setIngestStatus(status === "cached" ? "cached" : "ready");

        if (status === "cached") {
          setTimeout(() => setIngestStatus("idle"), 3000);
        }
      } catch (e) {
        setIngestStatus("failed");
        setTimeout(() => setIngestStatus("idle"), 4000);
      }
    }

    triggerIngestion();
  }, [issue]);

  // ── Run AI analysis ────────────────────────────────────────
  const handleAnalyze = async (forceRefresh = false) => {
    setLoadingAnalysis(true);
    setError(null);
    try {
      const res = await apiClient.get(
        `/issues/${issueId}/analysis${forceRefresh ? "?force_refresh=true" : ""}`
      );
      setAnalysis(res.data);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || "Analysis failed. Please try again.";
      setError(msg);
    } finally {
      setLoadingAnalysis(false);
    }
  };

  // ── Save / unsave issue ────────────────────────────────────
  const handleSave = async () => {
    setSavingIssue(true);
    try {
      if (saved) {
        await apiClient.delete(`/issues/${issueId}/save`);
        setSaved(false);
      } else {
        await apiClient.post(`/issues/${issueId}/save`);
        setSaved(true);
      }
    } catch (e) {
      // Silently fail
    } finally {
      setSavingIssue(false);
    }
  };

  // ── Toggle checklist step ──────────────────────────────────
  const toggleStep = async (stepKey: string) => {
    const updated = { ...checklist, [stepKey]: !checklist[stepKey] };
    setChecklist(updated);

    if (saved) {
      try {
        await apiClient.patch(`/users/me/contributions/${issueId}`, {
          checklist_progress: updated,
        });
      } catch (e) {
        // Non-critical
      }
    }
  };

  // ── Loading state ──────────────────────────────────────────
  if (loadingIssue) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="text-center py-16 text-gray-500">
        Issue not found.
        <button onClick={() => router.back()} className="ml-2 text-blue-600 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const completedSteps = analysis
    ? analysis.implementation_steps.filter((s) => checklist[`step_${s.order}`]).length
    : 0;
  const totalSteps = analysis?.implementation_steps.length || 0;

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto">

      {/* ── Back button ── */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to discover
      </button>

      {/* ── Issue header ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4">

        {/* Repo + meta row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1">
              <GitBranch className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs font-mono text-gray-600">
                {issue.repo_owner}/{issue.repo_name}
              </span>
            </div>
            <span className="text-xs text-gray-400">#{issue.github_issue_number}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${DIFFICULTY_STYLES[issue.difficulty] || DIFFICULTY_STYLES.unknown}`}>
              {issue.difficulty.charAt(0).toUpperCase() + issue.difficulty.slice(1)}
            </span>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={savingIssue}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                saved
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {savingIssue ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : saved ? (
                <BookmarkCheck className="w-3.5 h-3.5" />
              ) : (
                <Bookmark className="w-3.5 h-3.5" />
              )}
              {saved ? "Saved" : "Save"}
            </button>

            {/* GitHub link */}
            <a
              href={issue.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-700 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View on GitHub
            </a>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-xl font-bold text-gray-900 mb-3 leading-snug">
          {issue.title}
        </h1>

        {/* Labels */}
        {issue.labels.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {issue.labels.map((label) => (
              <span
                key={label.name}
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={labelStyle(label.color)}
              >
                {label.name}
              </span>
            ))}
          </div>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-4 text-xs text-gray-400 pb-4 border-b border-gray-50 mb-4">
          {issue.estimated_hours && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              ~{issue.estimated_hours}h estimated
            </span>
          )}
          <span className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            {issue.comment_count} comments
          </span>
          <span>Opened {timeAgo(issue.created_at)}</span>
        </div>

        {/* Body */}
        {issue.body && (
          <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
            {renderBody(issue.body)}
          </div>
        )}
      </div>

      {/* ── Repo Overview Panel ── */}
      <RepoOverview owner={issue.repo_owner} repo={issue.repo_name} />

      {/* ── AI Analysis panel ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4">

        {/* Panel header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
              <Brain className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">AI Analysis</h2>
              <p className="text-xs text-gray-400">Powered by OpenRouter</p>
            </div>
          </div>

          {/* Right side: ingest pill + refresh */}
          <div className="flex items-center gap-3">
            <IngestPill status={ingestStatus} />
            {analysis && (
              <button
                onClick={() => handleAnalyze(true)}
                disabled={loadingAnalysis}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${loadingAnalysis ? "animate-spin" : ""}`} />
                Refresh
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Not yet analyzed */}
        {!analysis && !loadingAnalysis && (
          <div className="text-center py-10">
            <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Brain className="w-6 h-6 text-purple-400" />
            </div>
            <p className="text-sm font-medium text-gray-900 mb-1">
              Get AI-powered guidance for this issue
            </p>
            <p className="text-xs text-gray-400 mb-5 max-w-sm mx-auto">
              AI will explain what needs to be done, map the relevant files,
              and give you a step-by-step implementation plan.
            </p>
            <button
              onClick={() => handleAnalyze()}
              disabled={ingestStatus === "indexing"}
              className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-medium px-5 py-2.5 rounded-xl transition-colors text-sm"
              title={ingestStatus === "indexing" ? "Waiting for repo to finish indexing..." : undefined}
            >
              <Brain className="w-4 h-4" />
              {ingestStatus === "indexing" ? "Indexing repo first..." : "Analyze with AI"}
            </button>
            {ingestStatus === "indexing" && (
              <p className="text-xs text-amber-600 mt-2">
                Indexing the repo for richer analysis — this takes ~30s
              </p>
            )}
          </div>
        )}

        {/* Loading analysis */}
        {loadingAnalysis && (
          <div className="text-center py-10">
            <Loader2 className="w-8 h-8 animate-spin text-purple-400 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Analyzing issue...</p>
            <p className="text-xs text-gray-400 mt-1">This takes 5–15 seconds</p>
          </div>
        )}

        {/* Analysis results */}
        {analysis && !loadingAnalysis && (
          <div className="space-y-6">

            {/* Metadata row: cache + RAG indicator */}
            <div className="flex items-center gap-2 flex-wrap">
              {analysis.cached && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                  <Info className="w-3 h-3" />
                  Cached analysis from {timeAgo(analysis.generated_at)}
                </div>
              )}
              {analysis.used_rag && (
                <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <Cpu className="w-3 h-3" />
                  Analyzed with repo context ({analysis.chunks_retrieved} code chunks)
                </div>
              )}
            </div>

            {/* Plain explanation */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                What needs to be done
              </h3>
              <p className="text-sm text-gray-800 leading-relaxed bg-blue-50 rounded-xl p-4 border border-blue-100">
                {analysis.plain_explanation}
              </p>
            </div>

            {/* Background */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Background
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {analysis.background}
              </p>
            </div>

            {/* File map */}
            {analysis.file_map?.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Files to look at
                </h3>
                <div className="space-y-2">
                  {analysis.file_map.map((file, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 p-3 rounded-xl border ${RELEVANCE_STYLES[file.relevance] || RELEVANCE_STYLES.secondary}`}
                    >
                      <FileCode className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <code className="text-xs font-mono font-medium truncate">
                            {file.path}
                          </code>
                          <span className="text-xs opacity-60 capitalize flex-shrink-0">
                            {file.relevance}
                          </span>
                        </div>
                        <p className="text-xs opacity-75">{file.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Implementation checklist */}
            {analysis.implementation_steps?.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Implementation steps
                  </h3>
                  {totalSteps > 0 && (
                    <span className="text-xs text-gray-400">
                      {completedSteps}/{totalSteps} done
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                {totalSteps > 0 && (
                  <div className="h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all duration-300"
                      style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  {analysis.implementation_steps.map((step) => {
                    const key = `step_${step.order}`;
                    const done = checklist[key] || false;
                    return (
                      <button
                        key={step.order}
                        onClick={() => toggleStep(key)}
                        className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                          done
                            ? "bg-green-50 border-green-200"
                            : "bg-gray-50 border-gray-100 hover:border-gray-300"
                        }`}
                      >
                        {done ? (
                          <CheckSquare className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className={`text-xs font-medium mb-0.5 ${done ? "text-green-800 line-through" : "text-gray-900"}`}>
                            {step.order}. {step.title}
                          </div>
                          <div className={`text-xs leading-relaxed ${done ? "text-green-600" : "text-gray-500"}`}>
                            {step.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Edge cases */}
            {analysis.edge_cases?.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Watch out for
                </h3>
                <div className="space-y-1.5">
                  {analysis.edge_cases.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Test hints */}
            {analysis.test_hints && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Testing hints
                </h3>
                <div className="flex items-start gap-2 bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <TestTube className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {analysis.test_hints}
                  </p>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* ── PR Draft panel — only shown after analysis exists ── */}
      {analysis && (
        <PRDraftPanel issueId={issue.id} issueNumber={issue.github_issue_number} />
      )}

    </div>
  );
}