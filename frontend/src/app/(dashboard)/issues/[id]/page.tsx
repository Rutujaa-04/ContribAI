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
// Overhauled issue detail workspace. Includes:
// - Dual-column Linear-style responsive dashboard grid.
// - Tactile premium surfaces with ambient glows and shadows.
// - Filesystem graph parser with colored filetype extensions.
// - Interactive checklist metrics, radial animations, and active state pops.
// - Ambient pulsing background indicators and ingestion pills.
// ============================================================

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import {
  ArrowLeft, ExternalLink, Bookmark, BookmarkCheck,
  Brain, GitBranch, Clock, MessageSquare,
  FileCode, CheckSquare, Square, AlertTriangle, TestTube,
  Loader2, RefreshCw, Info, Cpu, CheckCircle2, Sparkles
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
  beginner: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  intermediate: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  advanced: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  unknown: "bg-white/5 text-[#64748B] border border-white/[0.08]",
};

const RELEVANCE_STYLES: Record<string, string> = {
  primary: "bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.05)]",
  secondary: "bg-white/5 text-[#94A3B8] border border-white/[0.06]",
  reference: "bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)]",
};

function labelStyle(hexColor: string) {
  return {
    backgroundColor: `#${hexColor}15`,
    color: `#${hexColor}`,
    border: `1px solid #${hexColor}25`,
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

function formatFilePath(filePath: string) {
  const parts = filePath.split("/");
  const fileName = parts.pop() || "";
  const dirPath = parts.join("/");
  
  // Detect extension
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  let extColor = "text-[#94A3B8]";
  let extBg = "bg-white/5";
  
  if (["ts", "tsx"].includes(ext)) {
    extColor = "text-blue-400";
    extBg = "bg-blue-500/10 border-blue-500/25";
  } else if (["js", "jsx"].includes(ext)) {
    extColor = "text-amber-400";
    extBg = "bg-amber-500/10 border-amber-500/25";
  } else if (ext === "rs") {
    extColor = "text-orange-400";
    extBg = "bg-orange-500/10 border-orange-500/25";
  } else if (ext === "py") {
    extColor = "text-emerald-400";
    extBg = "bg-emerald-500/10 border-emerald-500/25";
  } else if (ext === "json") {
    extColor = "text-yellow-400";
    extBg = "bg-yellow-500/10 border-yellow-500/25";
  } else if (ext === "md") {
    extColor = "text-teal-400";
    extBg = "bg-teal-500/10 border-teal-500/25";
  }
  
  return { fileName, dirPath, extColor, extBg };
}

// ── Ingest status pill ────────────────────────────────────────

function IngestPill({ status }: { status: IngestStatus }) {
  if (status === "idle") return null;

  const config = {
    indexing: {
      text: "Indexing repo...",
      className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      icon: (
        <span className="relative flex h-2 w-2 mr-1">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </span>
      ),
    },
    ready: {
      text: "Repo indexed",
      className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      icon: <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
    },
    cached: {
      text: "Index cached",
      className: "bg-white/5 text-[#64748B] border-white/[0.08]",
      icon: <CheckCircle2 className="w-3 h-3 text-[#64748B]" />,
    },
    failed: {
      text: "Index unavailable",
      className: "bg-red-500/10 text-red-400 border-red-500/20",
      icon: <Info className="w-3 h-3 text-red-400" />,
    },
  }[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all duration-200 ${config.className}`}
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
      } catch {
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
      } catch {
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
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = e as any;
      const msg = err?.response?.data?.detail || "Analysis failed. Please try again.";
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
    } catch {
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
      } catch {
        // Non-critical
      }
    }
  };

  // ── Loading state ──────────────────────────────────────────
  if (loadingIssue) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-[#3B82F6]" />
        <p className="text-sm text-[#94A3B8] font-medium animate-pulse">Assembling issue details...</p>
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="text-center py-16 text-[#64748B]">
        Issue not found.
        <button onClick={() => router.back()} className="ml-2 text-blue-400 hover:underline font-semibold">
          Go back
        </button>
      </div>
    );
  }

  const completedSteps = analysis
    ? analysis.implementation_steps.filter((s) => checklist[`step_${s.order}`]).length
    : 0;
  const totalSteps = analysis?.implementation_steps.length || 0;
  const percentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 animate-slide-up">

      {/* ── Back button ── */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-[#94A3B8] hover:text-white mb-6 transition-all duration-200 group"
      >
        <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-0.5 transition-transform" />
        Back to discover
      </button>

      {/* ── Dual Column Grid Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* ── Left Column: Issue Metadata & Repo Health (5 cols) ── */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Issue Info Panel */}
          <div className="tactile-card p-6 bg-card">
            
            {/* Repo + meta row */}
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-white/5 border border-white/[0.08] rounded-lg px-2.5 py-1">
                  <GitBranch className="w-3.5 h-3.5 text-[#3B82F6]" />
                  <span className="text-xs font-mono text-[#94A3B8] font-semibold">
                    {issue.repo_owner}/{issue.repo_name}
                  </span>
                </div>
                <span className="text-xs text-[#475569] font-medium">#{issue.github_issue_number}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${DIFFICULTY_STYLES[issue.difficulty] || DIFFICULTY_STYLES.unknown}`}>
                  {issue.difficulty}
                </span>
              </div>
            </div>

            {/* Title */}
            <h1 className="text-lg sm:text-xl font-bold text-[#F1F5F9] mb-4 leading-snug tracking-tight font-sans">
              {issue.title}
            </h1>

            {/* Labels */}
            {issue.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-5">
                {issue.labels.map((label) => (
                  <span
                    key={label.name}
                    className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide"
                    style={labelStyle(label.color)}
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            )}

            {/* Action buttons (Save + GitHub Link) */}
            <div className="grid grid-cols-2 gap-3 mb-5 border-b border-white/[0.04] pb-5">
              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={savingIssue}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all duration-200 select-none ${
                  saved
                    ? "bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]/25 shadow-[0_0_15px_rgba(59,130,246,0.05)]"
                    : "text-[#94A3B8] bg-white/5 border-white/[0.08] hover:border-white/20 hover:text-white"
                }`}
              >
                {savingIssue ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#3B82F6]" />
                ) : saved ? (
                  <BookmarkCheck className="w-4 h-4" />
                ) : (
                  <Bookmark className="w-4 h-4" />
                )}
                {saved ? "Saved" : "Save Issue"}
              </button>

              {/* GitHub link */}
              <a
                href={issue.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#3B82F6] text-white hover:bg-blue-500 shadow-[0_4px_12px_rgba(59,130,246,0.2)] transition-all duration-200"
              >
                <ExternalLink className="w-4 h-4" />
                View on GitHub
              </a>
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#64748B] mb-5">
              {issue.estimated_hours && (
                <span className="flex items-center gap-1.5 font-medium bg-white/5 rounded-lg px-2 py-1 border border-white/[0.04]">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  ~{issue.estimated_hours}h est.
                </span>
              )}
              <span className="flex items-center gap-1.5 font-medium bg-white/5 rounded-lg px-2 py-1 border border-white/[0.04]">
                <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                {issue.comment_count} comments
              </span>
              <span className="text-[#475569]">Opened {timeAgo(issue.created_at)}</span>
            </div>

            {/* Description Body */}
            {issue.body && (
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-[#475569] uppercase tracking-wider">Description</span>
                <div className="text-sm text-[#94A3B8] leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto bg-[#080B10]/40 p-4 border border-white/[0.04] rounded-xl pr-2">
                  {renderBody(issue.body)}
                </div>
              </div>
            )}
          </div>

          {/* Repo Overview */}
          <RepoOverview owner={issue.repo_owner} repo={issue.repo_name} />
          
        </div>

        {/* ── Right Column: AI Analysis & PR Drafts (7 cols) ── */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* AI Analysis Panel */}
          <div className="tactile-card p-6 bg-card relative overflow-hidden">
            {/* Ambient Background Glow behind brain */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 filter blur-2xl rounded-full pointer-events-none" />

            {/* Panel header */}
            <div className="flex items-center justify-between mb-6 border-b border-white/[0.04] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.1)]">
                  <Brain className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-[#E2E8F0] tracking-tight">AI Technical Guidance</h2>
                    <span className="text-[9px] font-bold bg-white/5 border border-white/[0.08] text-[#64748B] px-1.5 py-0.5 rounded uppercase tracking-wider">Beta</span>
                  </div>
                  <p className="text-[11px] text-[#475569] font-medium">Contextual code ingestion & RAG synthesis</p>
                </div>
              </div>

              {/* Right side: ingest pill + refresh */}
              <div className="flex items-center gap-3">
                <IngestPill status={ingestStatus} />
                {analysis && (
                  <button
                    onClick={() => handleAnalyze(true)}
                    disabled={loadingAnalysis}
                    className="flex items-center gap-1.5 text-xs text-[#64748B] hover:text-white transition-colors duration-200 select-none disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingAnalysis ? "animate-spin" : ""}`} />
                    <span className="font-semibold hidden sm:inline">Re-analyze</span>
                  </button>
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-5 text-sm text-red-400 flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-red-300">Analysis Error</div>
                  <p className="text-xs text-red-400/90 mt-0.5">{error}</p>
                </div>
              </div>
            )}

            {/* Not yet analyzed */}
            {!analysis && !loadingAnalysis && (
              <div className="text-center py-12 relative">
                {/* Visual Glow Backdrop */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-purple-600/5 filter blur-3xl rounded-full" />
                
                <div className="w-14 h-14 bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border border-purple-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_8px_24px_rgba(139,92,246,0.15)]">
                  <Brain className="w-7 h-7 text-purple-400" />
                </div>
                <h3 className="text-base font-bold text-[#E2E8F0] mb-2 tracking-tight">
                  Get Deep AI Technical Guidance
                </h3>
                <p className="text-xs text-[#64748B] mb-6 max-w-sm mx-auto leading-relaxed">
                  Analyze this issue against the codebase repository structure to extract a customized plan, relevant target files, and edge-case warnings.
                </p>
                <button
                  onClick={() => handleAnalyze()}
                  disabled={ingestStatus === "indexing"}
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-purple-900/20 disabled:to-indigo-900/20 disabled:text-purple-300/40 text-white font-bold px-6 py-3 rounded-xl transition-all duration-200 text-xs uppercase tracking-wider shadow-[0_4px_20px_rgba(139,92,246,0.25)] select-none cursor-pointer"
                  title={ingestStatus === "indexing" ? "Waiting for repo to finish indexing..." : undefined}
                >
                  <Sparkles className="w-4 h-4 animate-pulse" />
                  {ingestStatus === "indexing" ? "Indexing Repository..." : "Analyze with AI"}
                </button>
                {ingestStatus === "indexing" && (
                  <p className="text-[11px] text-amber-400 mt-3 font-medium animate-pulse">
                    Ingesting codebase repository chunks into the vector database (takes ~30s)
                  </p>
                )}
              </div>
            )}

            {/* Loading analysis */}
            {loadingAnalysis && (
              <div className="py-16 space-y-6">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="relative mb-4">
                    <div className="w-12 h-12 rounded-full border-4 border-purple-500/10 border-t-purple-500 animate-spin" />
                    <Brain className="w-5 h-5 text-purple-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                  </div>
                  <p className="text-sm font-bold text-[#E2E8F0] tracking-tight">Synthesizing Technical Architecture</p>
                  <p className="text-xs text-[#475569] mt-1 font-medium">Retrieving matching code blocks & running LLM models (5–15s)</p>
                </div>

                {/* Loading Skeleton blocks */}
                <div className="space-y-3 pt-4 border-t border-white/[0.04]">
                  <div className="h-20 shimmer-dark rounded-xl" />
                  <div className="h-24 shimmer-dark rounded-xl" />
                  <div className="h-16 shimmer-dark rounded-xl" />
                </div>
              </div>
            )}

            {/* Analysis results */}
            {analysis && !loadingAnalysis && (
              <div className="space-y-6">

                {/* Metadata row: cache + RAG indicator */}
                <div className="flex items-center gap-2 flex-wrap">
                  {analysis.cached && (
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#64748B] bg-white/5 border border-white/[0.04] rounded-lg px-2.5 py-1">
                      <Info className="w-3.5 h-3.5 text-[#64748B]" />
                      Cached analysis ({timeAgo(analysis.generated_at)})
                    </div>
                  )}
                  {analysis.used_rag && (
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                      <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                      RAG Contextualized ({analysis.chunks_retrieved} chunks)
                    </div>
                  )}
                </div>

                {/* Plain explanation in an elevated gradient card */}
                <div>
                  <h3 className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-2">
                    Action Plan Summary
                  </h3>
                  <div className="relative overflow-hidden bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-2xl p-5 border border-blue-500/20 shadow-[0_4px_20px_rgba(59,130,246,0.05)]">
                    {/* Glowing highlight strip */}
                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-400 to-indigo-500" />
                    <p className="text-sm text-[#E2E8F0] leading-relaxed font-normal">
                      {analysis.plain_explanation}
                    </p>
                  </div>
                </div>

                {/* Background */}
                {analysis.background && (
                  <div>
                    <h3 className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-2">
                      Technical Background
                    </h3>
                    <p className="text-sm text-[#94A3B8] leading-relaxed bg-[#080B10]/20 p-4 border border-white/[0.04] rounded-xl font-normal">
                      {analysis.background}
                    </p>
                  </div>
                )}

                {/* Filesystem tree parser */}
                {analysis.file_map?.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-2">
                      Filesystem Target Map
                    </h3>
                    <div className="space-y-2.5">
                      {analysis.file_map.map((file, i) => {
                        const { fileName, dirPath, extColor, extBg } = formatFilePath(file.path);
                        return (
                          <div
                            key={i}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border gap-3 transition-all duration-200 hover:border-white/10 ${RELEVANCE_STYLES[file.relevance] || RELEVANCE_STYLES.secondary}`}
                          >
                            <div className="min-w-0 flex items-start gap-3">
                              <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 mt-0.5 ${extBg}`}>
                                <FileCode className={`w-4 h-4 ${extColor}`} />
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <code className="text-xs font-mono text-white break-all">
                                    {dirPath && <span className="text-[#475569]">{dirPath}/</span>}
                                    <span className="font-bold">{fileName}</span>
                                  </code>
                                  <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border select-none ${
                                    file.relevance === "primary" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                                    file.relevance === "reference" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                    "bg-white/5 text-[#94A3B8] border-white/[0.08]"
                                  }`}>
                                    {file.relevance}
                                  </span>
                                </div>
                                <p className="text-xs text-[#64748B] mt-1 leading-relaxed font-normal">{file.reason}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Implementation checklist */}
                {analysis.implementation_steps?.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">
                        Step-by-Step Checklist
                      </h3>
                      {totalSteps > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-[#E2E8F0] font-bold">
                            {percentage}%
                          </span>
                          <span className="text-xs text-[#475569] font-medium">
                            ({completedSteps}/{totalSteps} complete)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Progress bar */}
                    {totalSteps > 0 && (
                      <div className="h-1.5 bg-[#080B10] border border-white/[0.04] rounded-full mb-4 overflow-hidden p-0.5">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    )}

                    <div className="space-y-2.5">
                      {analysis.implementation_steps.map((step) => {
                        const key = `step_${step.order}`;
                        const done = checklist[key] || false;
                        return (
                          <button
                            key={step.order}
                            onClick={() => toggleStep(key)}
                            className={`w-full flex items-start gap-3.5 p-4 rounded-xl border text-left transition-all duration-200 select-none group cursor-pointer ${
                              done
                                ? "bg-emerald-500/5 border-emerald-500/20 shadow-[inset_0_1px_1px_rgba(16,185,129,0.02)]"
                                : "bg-[#080B10]/20 border-white/[0.06] hover:border-white/15 hover:bg-white/[0.02]"
                            }`}
                          >
                            {done ? (
                              <div className="w-5 h-5 rounded-md bg-emerald-500/10 border border-emerald-500/35 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-md bg-white/5 border border-white/[0.1] flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:border-white/30 transition-colors">
                                <Square className="w-3.5 h-3.5 text-transparent" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className={`text-xs font-bold transition-all duration-200 ${done ? "text-emerald-400/80 line-through" : "text-[#E2E8F0]"}`}>
                                {step.order}. {step.title}
                              </div>
                              <div className={`text-xs leading-relaxed mt-0.5 font-normal transition-colors duration-200 ${done ? "text-emerald-400/50" : "text-[#64748B]"}`}>
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
                  <div className="bg-amber-500/5 border border-amber-500/15 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <h3 className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                        Architectural Watchouts
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {analysis.edge_cases.map((item, i) => (
                        <div key={i} className="flex items-start gap-2.5 text-xs text-[#94A3B8] font-normal leading-relaxed">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70 mt-1.5 flex-shrink-0" />
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Test hints */}
                {analysis.test_hints && (
                  <div>
                    <h3 className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-2">
                      Testing Blueprint
                    </h3>
                    <div className="flex items-start gap-3 bg-white/5 rounded-2xl p-4 border border-white/[0.05]">
                      <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <TestTube className="w-4 h-4 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-xs text-[#94A3B8] leading-relaxed font-normal">
                          {analysis.test_hints}
                        </p>
                      </div>
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

      </div>

    </div>
  );
}