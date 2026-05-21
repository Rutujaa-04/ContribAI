"use client";

import {
  Brain, RefreshCw, Info, FileCode, CheckSquare,
  Square, AlertTriangle, TestTube, Loader2,
} from "lucide-react";

interface FileMapItem {
  path: string;
  relevance: "primary" | "secondary" | "reference";
  reason: string;
}

interface ImplementationStep {
  order: number;
  title: string;
  description: string;
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
}

interface AnalysisPanelProps {
  analysis: Analysis | null;
  loading: boolean;
  error: string | null;
  checklist: Record<string, boolean>;
  onAnalyze: (forceRefresh?: boolean) => void;
  onToggleStep: (key: string) => void;
}

const RELEVANCE_STYLES: Record<string, string> = {
  primary: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  secondary: "bg-white/5 text-[#94A3B8] border-white/[0.08]",
  reference: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

function timeAgo(dateStr: string): string {
  const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

export default function AnalysisPanel({
  analysis,
  loading,
  error,
  checklist,
  onAnalyze,
  onToggleStep,
}: AnalysisPanelProps) {
  const completedSteps = analysis
    ? analysis.implementation_steps.filter((s) => checklist[`step_${s.order}`]).length
    : 0;
  const totalSteps = analysis?.implementation_steps.length || 0;

  return (
    <div className="bg-[#111827] rounded-2xl border border-white/[0.06] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center">
            <Brain className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#E2E8F0]">AI Analysis</h2>
            <p className="text-xs text-[#475569]">Powered by AI</p>
          </div>
        </div>
        {analysis && (
          <button
            onClick={() => onAnalyze(true)}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-[#475569] hover:text-[#E2E8F0] transition-colors duration-200"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!analysis && !loading && (
        <div className="text-center py-10">
          <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Brain className="w-6 h-6 text-purple-400" />
          </div>
          <p className="text-sm font-medium text-[#E2E8F0] mb-1">
            Get AI-powered guidance for this issue
          </p>
          <p className="text-xs text-[#475569] mb-5 max-w-sm mx-auto">
            AI will explain what needs to be done, map the relevant files,
            and give you a step-by-step implementation plan.
          </p>
          <button
            onClick={() => onAnalyze()}
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-medium px-5 py-2.5 rounded-xl transition-all duration-200 text-sm"
          >
            <Brain className="w-4 h-4" />
            Analyze with AI
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-10">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400 mx-auto mb-3" />
          <p className="text-sm text-[#64748B]">Analyzing issue...</p>
          <p className="text-xs text-[#475569] mt-1">This takes 5–15 seconds</p>
        </div>
      )}

      {/* Results */}
      {analysis && !loading && (
        <div className="space-y-6">

          {analysis.cached && (
            <div className="flex items-center gap-1.5 text-xs text-[#475569] bg-white/5 rounded-lg px-3 py-2">
              <Info className="w-3 h-3" />
              Cached analysis from {timeAgo(analysis.generated_at)}
            </div>
          )}

          {/* Plain explanation */}
          <div>
            <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2">
              What needs to be done
            </h3>
            <p className="text-sm text-[#CBD5E1] leading-relaxed bg-blue-500/10 rounded-2xl p-4 border border-blue-500/15">
              {analysis.plain_explanation}
            </p>
          </div>

          {/* Background */}
          <div>
            <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2">
              Background
            </h3>
            <p className="text-sm text-[#94A3B8] leading-relaxed">
              {analysis.background}
            </p>
          </div>

          {/* File map */}
          {analysis.file_map?.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2">
                Files to look at
              </h3>
              <div className="space-y-2">
                {analysis.file_map.map((file, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-all duration-200 ${RELEVANCE_STYLES[file.relevance] || RELEVANCE_STYLES.secondary}`}
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
                <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">
                  Implementation steps
                </h3>
                <span className="text-xs text-[#475569]">{completedSteps}/{totalSteps} done</span>
              </div>
              <div className="h-1.5 bg-white/[0.06] rounded-full mb-3 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${totalSteps ? (completedSteps / totalSteps) * 100 : 0}%` }}
                />
              </div>
              <div className="space-y-2">
                {analysis.implementation_steps.map((step) => {
                  const key = `step_${step.order}`;
                  const done = checklist[key] || false;
                  return (
                    <button
                      key={step.order}
                      onClick={() => onToggleStep(key)}
                      className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all duration-200 ${
                        done ? "bg-emerald-500/10 border-emerald-500/20" : "bg-white/5 border-white/[0.06] hover:border-white/15"
                      }`}
                    >
                      {done ? (
                        <CheckSquare className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                      ) : (
                        <Square className="w-4 h-4 text-[#334155] flex-shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className={`text-xs font-medium mb-0.5 ${done ? "text-emerald-400 line-through" : "text-[#E2E8F0]"}`}>
                          {step.order}. {step.title}
                        </div>
                        <div className={`text-xs leading-relaxed ${done ? "text-emerald-400/70" : "text-[#64748B]"}`}>
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
              <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2">
                Watch out for
              </h3>
              <div className="space-y-1.5">
                {analysis.edge_cases.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-[#94A3B8]">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Test hints */}
          {analysis.test_hints && (
            <div>
              <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2">
                Testing hints
              </h3>
              <div className="flex items-start gap-2 bg-white/5 rounded-xl p-3 border border-white/[0.06] transition-all duration-200">
                <TestTube className="w-4 h-4 text-[#475569] flex-shrink-0 mt-0.5" />
                <p className="text-sm text-[#94A3B8] leading-relaxed">{analysis.test_hints}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}