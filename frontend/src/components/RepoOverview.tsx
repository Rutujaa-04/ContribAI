"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import {
  Star, Globe, Shield, ChevronDown, ChevronUp,
  Cpu, BookOpen, Terminal, CheckCircle2, Clock
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
  if (score === null) return "text-gray-600 bg-gray-50 border-gray-200";
  if (score >= 70) return "text-green-600 bg-green-50 border-green-200";
  if (score >= 40) return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-red-600 bg-red-50 border-red-200";
}

function healthLabel(score: number | null): string {
  if (score === null) return "Pending";
  if (score >= 70) return "Healthy";
  if (score >= 40) return "Moderate";
  return "Low Activity";
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
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
        <div className="h-3 bg-gray-50 rounded w-2/3" />
      </div>
    );
  }

  if (error || !data) return null; // Fail silently — repo overview is non-critical

  return (
    <div className="bg-white rounded-2xl border border-gray-100 mb-4 overflow-hidden shadow-sm transition-all hover:shadow-md">
      {/* Header row — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Globe className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">{data.full_name}</span>
              {data.primary_language && (
                <span className="text-[10px] font-medium bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {data.primary_language}
                </span>
              )}
            </div>
            {data.description && (
              <p className="text-xs text-gray-500 truncate mt-0.5">{data.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          {/* Health score badge */}
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${healthColor(data.health_score)}`}>
            {healthLabel(data.health_score)}
          </span>
          {/* Stars */}
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
            {data.stars.toLocaleString()}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-5 border-t border-gray-50 pt-4 space-y-4">
          
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex flex-col justify-center">
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1">Stars</span>
              <span className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                {data.stars.toLocaleString()}
              </span>
            </div>
            
            {data.primary_language && (
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex flex-col justify-center">
                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1">Language</span>
                <span className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-blue-500" />
                  {data.primary_language}
                </span>
              </div>
            )}
            
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex flex-col justify-center col-span-2 sm:col-span-1">
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1">Last Ingested</span>
              <span className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-gray-400" />
                {timeAgo(data.last_ingested_at)}
              </span>
            </div>
          </div>

          {/* Health score bar */}
          {data.health_score !== null && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-500">Repository Health Index</span>
                <span className="text-xs font-bold text-gray-800">{data.health_score.toFixed(0)}/100</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    data.health_score >= 70 ? "bg-green-500" :
                    data.health_score >= 40 ? "bg-amber-500" : "bg-red-400"
                  }`}
                  style={{ width: `${data.health_score}%` }}
                />
              </div>
            </div>
          )}

          {/* AI Architecture Summary */}
          {data.arch_summary && (
            <div className="bg-purple-50/50 border border-purple-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Cpu className="w-4 h-4 text-purple-600" />
                <h4 className="text-xs font-bold text-purple-900 uppercase tracking-wide">
                  AI Repo Architecture Overview
                </h4>
              </div>
              <p className="text-xs text-purple-950 leading-relaxed font-normal">
                {data.arch_summary}
              </p>
            </div>
          )}

          {/* Contributing Guidelines Summary */}
          {data.has_contributing_md && data.contributing_md_summary && (
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                  Contribution Guidelines
                </h4>
              </div>
              <p className="text-xs text-emerald-950 leading-relaxed font-normal whitespace-pre-line">
                {data.contributing_md_summary}
              </p>
            </div>
          )}

          {/* Tech stack */}
          {data.tech_stack.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Auto-detected Tech Stack</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(new Set(data.tech_stack)).map((tech) => (
                  <span
                    key={tech}
                    className="text-xs px-2.5 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg font-medium border border-gray-200 transition-colors"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* GitHub link */}
          <div className="pt-2">
            <a
              href={data.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
            >
              View repository on GitHub →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}