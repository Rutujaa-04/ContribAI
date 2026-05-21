"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import {
  Star, Globe, ChevronDown, ChevronUp,
  Cpu, BookOpen, Terminal, Clock
} from "lucide-react";

interface RepoData {
  id: string;
  owner: string;
  name: string;
  full_name: string;
  description: string | null;
  stars: number;
  primary_language: string | null;
  tech_stack: string[];
  arch_summary: string | null;
  health_score: number | null;
  has_contributing_md: boolean | null;
  contributing_md_summary: string | null;
  last_ingested_at: string | null;
  html_url: string;
}

interface RepoOverviewProps {
  owner: string;
  repo: string;
}

function healthColor(score: number | null): string {
  if (score === null) return "text-[#64748B] bg-white/5 border-white/[0.08]";
  if (score >= 70) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]";
  if (score >= 40) return "text-amber-400 bg-amber-500/10 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)]";
  return "text-red-400 bg-red-500/10 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.05)]";
}

function healthLabel(score: number | null): string {
  if (score === null) return "Pending";
  if (score >= 70) return "Healthy";
  if (score >= 40) return "Moderate";
  return "Needs Care";
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

export default function RepoOverview({ owner, repo }: RepoOverviewProps) {
  const [data, setData] = useState<RepoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await apiClient.get(`/repos/${owner}/${repo}/overview`);
        setData(res.data);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [owner, repo]);

  if (loading) {
    return (
      <div className="bg-[#10141D]/40 rounded-2xl border border-white/[0.04] p-4 mb-4 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 bg-white/10 rounded-full" />
          <div className="h-4 bg-white/10 rounded w-1/3" />
        </div>
      </div>
    );
  }

  if (error || !data) return null; // Fail silently — repo overview is non-critical

  return (
    <div className="tactile-card bg-card overflow-hidden shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
      {/* Header row — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors duration-200 text-left select-none cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#3B82F6]/10 border border-[#3B82F6]/20 flex items-center justify-center flex-shrink-0">
            <Globe className="w-4 h-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-[#E2E8F0] tracking-tight">{data.full_name}</span>
              {data.primary_language && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-white/5 border border-white/[0.06] text-[#64748B] px-2 py-0.5 rounded-full select-none">
                  {data.primary_language}
                </span>
              )}
            </div>
            {data.description && (
              <p className="text-xs text-[#64748B] truncate mt-0.5 max-w-md font-normal">{data.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          {/* Health score badge */}
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${healthColor(data.health_score)}`}>
            {healthLabel(data.health_score)}
          </span>
          {/* Stars */}
          <span className="flex items-center gap-1 text-xs text-[#64748B] font-semibold bg-white/5 border border-white/[0.04] px-2 py-1 rounded-lg">
            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
            {data.stars.toLocaleString()}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-[#475569]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#475569]" />
          )}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-white/[0.04] pt-5 space-y-5 animate-slide-up">
          
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-[#080B10]/40 border border-white/[0.05] rounded-xl p-3 flex flex-col justify-center transition-all duration-200 hover:border-[#3B82F6]/25">
              <span className="text-[9px] text-[#475569] font-bold uppercase tracking-wider mb-1">Stars</span>
              <span className="text-xs sm:text-sm font-bold text-[#E2E8F0] flex items-center gap-1.5">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                {data.stars.toLocaleString()}
              </span>
            </div>
            
            {data.primary_language && (
              <div className="bg-[#080B10]/40 border border-white/[0.05] rounded-xl p-3 flex flex-col justify-center transition-all duration-200 hover:border-[#3B82F6]/25">
                <span className="text-[9px] text-[#475569] font-bold uppercase tracking-wider mb-1">Language</span>
                <span className="text-xs sm:text-sm font-bold text-[#E2E8F0] flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-blue-400" />
                  {data.primary_language}
                </span>
              </div>
            )}
            
            <div className="bg-[#080B10]/40 border border-white/[0.05] rounded-xl p-3 flex flex-col justify-center col-span-2 sm:col-span-1 transition-all duration-200 hover:border-[#3B82F6]/25">
              <span className="text-[9px] text-[#475569] font-bold uppercase tracking-wider mb-1">Last Ingested</span>
              <span className="text-xs sm:text-sm font-bold text-[#E2E8F0] flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#64748B]" />
                {timeAgo(data.last_ingested_at)}
              </span>
            </div>
          </div>

          {/* Health score bar */}
          {data.health_score !== null && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-[#64748B]">Repository Health Index</span>
                <span className="text-xs font-mono font-bold text-[#E2E8F0]">{data.health_score.toFixed(0)}/100</span>
              </div>
              <div className="h-2 bg-[#080B10] border border-white/[0.04] rounded-full overflow-hidden p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(59,130,246,0.1)] ${
                    data.health_score >= 70 ? "bg-emerald-500" :
                    data.health_score >= 40 ? "bg-amber-500" : "bg-red-500"
                  }`}
                  style={{ width: `${data.health_score}%` }}
                />
              </div>
            </div>
          )}

          {/* AI Architecture Summary */}
          {data.arch_summary && (
            <div className="bg-purple-500/5 border border-purple-500/15 rounded-2xl p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-0.5 h-full bg-purple-500/40" />
              <div className="flex items-center gap-2 mb-2">
                <Cpu className="w-4 h-4 text-purple-400" />
                <h4 className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">
                  AI Architecture Map Summary
                </h4>
              </div>
              <p className="text-xs text-[#94A3B8] leading-relaxed font-normal">
                {data.arch_summary}
              </p>
            </div>
          )}

          {/* Contributing Guidelines Summary */}
          {data.has_contributing_md && data.contributing_md_summary && (
            <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-2xl p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-0.5 h-full bg-emerald-500/40" />
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <h4 className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">
                  Codebase Contribution Guidelines
                </h4>
              </div>
              <p className="text-xs text-[#94A3B8] leading-relaxed font-normal whitespace-pre-line">
                {data.contributing_md_summary}
              </p>
            </div>
          )}

          {/* Tech stack */}
          {data.tech_stack.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-2">Auto-detected Tech Stack</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(new Set(data.tech_stack)).map((tech) => (
                  <span
                    key={tech}
                    className="text-xs px-2.5 py-1 bg-white/5 hover:bg-white/[0.08] hover:text-white text-[#94A3B8] rounded-lg font-medium border border-white/[0.04] transition-colors duration-200 select-none"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* GitHub link */}
          <div className="pt-2 border-t border-white/[0.04]">
            <a
              href={data.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors duration-200 group"
            >
              View repository on GitHub 
              <span className="transform group-hover:translate-x-0.5 transition-transform">→</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}