"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import {
  Star, GitFork, AlertCircle, Activity,
  Globe, Shield, Archive, ChevronDown, ChevronUp,
} from "lucide-react";

interface RepoData {
  owner: string;
  name: string;
  full_name: string;
  description: string | null;
  stars: number;
  forks: number;
  open_issues: number;
  primary_language: string | null;
  tech_stack: string[];
  health_score: number;
  topics: string[];
  license: string | null;
  html_url: string;
  archived: boolean;
  pushed_at: string;
}

interface RepoOverviewProps {
  owner: string;
  repo: string;
}

function healthColor(score: number): string {
  if (score >= 70) return "text-green-600 bg-green-50 border-green-200";
  if (score >= 40) return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-red-600 bg-red-50 border-red-200";
}

function healthLabel(score: number): string {
  if (score >= 70) return "Healthy";
  if (score >= 40) return "Moderate";
  return "Low Activity";
}

function timeAgo(dateStr: string): string {
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
    <div className="bg-white rounded-2xl border border-gray-100 mb-4 overflow-hidden">
      {/* Header row — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">{data.full_name}</span>
              {data.archived && (
                <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                  <Archive className="w-3 h-3" />
                  Archived
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
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${healthColor(data.health_score)}`}>
            {healthLabel(data.health_score)}
          </span>
          {/* Stars */}
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Star className="w-3 h-3" />
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
        <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-3">

          {/* Stats row */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <GitFork className="w-3 h-3" />
              {data.forks.toLocaleString()} forks
            </span>
            <span className="flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {data.open_issues.toLocaleString()} open issues
            </span>
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3" />
              Updated {timeAgo(data.pushed_at)}
            </span>
            {data.license && (
              <span className="flex items-center gap-1">
                <Shield className="w-3 h-3" />
                {data.license}
              </span>
            )}
          </div>

          {/* Health score bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Repo health</span>
              <span className="text-xs font-medium text-gray-700">{data.health_score}/100</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  data.health_score >= 70 ? "bg-green-500" :
                  data.health_score >= 40 ? "bg-amber-500" : "bg-red-400"
                }`}
                style={{ width: `${data.health_score}%` }}
              />
            </div>
          </div>

          {/* Tech stack */}
          {data.tech_stack.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1.5">Tech stack</p>
              <div className="flex flex-wrap gap-1.5">
                {data.tech_stack.map((tech) => (
                  <span
                    key={tech}
                    className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full font-medium"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Topics */}
          {data.topics.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1.5">Topics</p>
              <div className="flex flex-wrap gap-1.5">
                {data.topics.slice(0, 8).map((topic) => (
                  <span
                    key={topic}
                    className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          
         {/* GitHub link */}
         <a
           href={data.html_url}
           target="_blank"
           rel="noopener noreferrer"
           className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
         >
           View repo on GitHub →
         </a>
        </div>
      )}
    </div>
  );
}