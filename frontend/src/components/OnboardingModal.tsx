// ============================================================
// src/components/OnboardingModal.tsx
// ============================================================
// Shown to users who have no skill_tags set (is_onboarded = false).
// Lets them pick languages and experience level.
// On submit, calls PATCH /users/me and stores in DB.
//
// Usage: in discover/page.tsx, check is_onboarded and render this.
// Overhauled Onboarding Modal with premium, modern SaaS designs.
// Integrates glassmorphism backdrop filters, glowing tech chips,
// tactile experience level cards with dedicated indicator colors,
// and smooth active scale-up transitions.
// ============================================================

"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import { CheckCircle2, Code2, Zap, Loader2 } from "lucide-react";

// ── Available options ─────────────────────────────────────────

const LANGUAGES = [
  { value: "python", label: "Python", emoji: "🐍" },
  { value: "typescript", label: "TypeScript", emoji: "🔷" },
  { value: "javascript", label: "JavaScript", emoji: "💛" },
  { value: "rust", label: "Rust", emoji: "🦀" },
  { value: "go", label: "Go", emoji: "🐹" },
  { value: "java", label: "Java", emoji: "☕" },
  { value: "cpp", label: "C++", emoji: "⚡" },
  { value: "ruby", label: "Ruby", emoji: "💎" },
  { value: "swift", label: "Swift", emoji: "🍎" },
  { value: "kotlin", label: "Kotlin", emoji: "🎯" },
  { value: "php", label: "PHP", emoji: "🐘" },
  { value: "vue", label: "Vue", emoji: "💚" },
];

const LEVELS = [
  {
    value: "beginner",
    label: "Beginner",
    description: "Learning the ropes, comfortable with smaller fixes (< 1 year)",
    color: "border-emerald-500/10 bg-emerald-500/5 text-emerald-400 hover:border-emerald-500/30",
    selectedColor: "border-emerald-500 bg-emerald-500/10 text-emerald-300 ring-4 ring-emerald-500/5 shadow-[0_0_20px_rgba(16,185,129,0.15)]",
  },
  {
    value: "intermediate",
    label: "Intermediate",
    description: "Comfortable with standard features & unit testing (1–3 years)",
    color: "border-blue-500/10 bg-blue-500/5 text-blue-400 hover:border-blue-500/30",
    selectedColor: "border-blue-500 bg-blue-500/10 text-blue-300 ring-4 ring-blue-500/5 shadow-[0_0_20px_rgba(59,130,246,0.15)]",
  },
  {
    value: "advanced",
    label: "Advanced",
    description: "System design, full feature implementations (3+ years)",
    color: "border-purple-500/10 bg-purple-500/5 text-purple-400 hover:border-purple-500/30",
    selectedColor: "border-purple-500 bg-purple-500/10 text-purple-300 ring-4 ring-purple-500/5 shadow-[0_0_20px_rgba(139,92,246,0.15)]",
  },
];

// ── Props ─────────────────────────────────────────────────────

interface OnboardingModalProps {
  onComplete: (skillTags: string[], level: string) => void;
}

// ── Component ─────────────────────────────────────────────────

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [selectedLangs, setSelectedLangs] = useState<string[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<string>("beginner");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleLang = (lang: string) => {
    setSelectedLangs((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  const handleSubmit = async () => {
    if (selectedLangs.length === 0) {
      setError("Please select at least one language to get started.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiClient.patch("/users/me", {
        skill_tags: selectedLangs,
        experience_level: selectedLevel,
      });
      onComplete(selectedLangs, selectedLevel);
    } catch {
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  };

  return (
    // ── Backdrop ──
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B10]/80 backdrop-blur-md px-4">
      {/* ── Modal Card ── */}
      <div className="w-full max-w-xl bg-card rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.6),0_0_50px_rgba(59,130,246,0.05)] border border-white/[0.06] overflow-hidden animate-popup">

        {/* ── Header ── */}
        <div className="bg-[#080B10]/50 px-6 py-5 border-b border-white/[0.04]">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.1)]">
              <Zap className="w-5 h-5 text-blue-400 animate-pulse" />
            </div>
            <h2 className="text-base font-bold text-[#E2E8F0] tracking-tight">Developer Profile Setup</h2>
          </div>
          <p className="text-[#64748B] text-xs font-medium">
            Configure your development preferences to allow personalized codebase matching.
          </p>
        </div>

        <div className="px-6 py-6 space-y-6">

          {/* ── Language picker ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-[#64748B]" />
              <span className="text-xs font-bold text-[#E2E8F0] uppercase tracking-wider">
                Languages &amp; Frameworks
              </span>
              <span className="text-[11px] text-[#475569] font-medium">(select all that apply)</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {LANGUAGES.map((lang) => {
                const isSelected = selectedLangs.includes(lang.value);
                return (
                  <button
                    key={lang.value}
                    onClick={() => toggleLang(lang.value)}
                    className={`
                      flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold
                      border transition-all duration-200 cursor-pointer select-none
                      ${isSelected
                        ? "border-[#3B82F6] bg-[#3B82F6]/10 text-white shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                        : "border-white/[0.06] bg-[#080B10]/40 text-[#94A3B8] hover:border-white/20 hover:text-white"
                      }
                    `}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="flex-shrink-0 text-sm">{lang.emoji}</span>
                      <span className="truncate">{lang.label}</span>
                    </span>
                    {isSelected && (
                      <CheckCircle2 className="w-3.5 h-3.5 ml-1 text-blue-400 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Experience level ── */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-[#E2E8F0] uppercase tracking-wider">
              Experience Level
            </p>
            <div className="grid grid-cols-1 gap-2.5">
              {LEVELS.map((lvl) => {
                const isSelected = selectedLevel === lvl.value;
                return (
                  <button
                    key={lvl.value}
                    onClick={() => setSelectedLevel(lvl.value)}
                    className={`
                      w-full flex items-start gap-3.5 px-4 py-3.5 rounded-xl border text-left
                      transition-all duration-200 cursor-pointer select-none group
                      ${isSelected ? lvl.selectedColor : `border-white/[0.06] bg-[#080B10]/40 ${lvl.color}`}
                    `}
                  >
                    {/* Radio dot */}
                    <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors
                      ${isSelected ? "border-current" : "border-[#475569] group-hover:border-[#64748B]"}`}>
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-current" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide">{lvl.label}</div>
                      <div className="text-xs opacity-75 mt-0.5 leading-relaxed font-normal">{lvl.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Error ── */}
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 px-4 py-2.5 rounded-xl border border-red-500/20 font-medium">
              {error}
            </p>
          )}

          {/* ── Submit ── */}
          <div className="pt-2">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-[#1E293B] disabled:to-[#1E293B] disabled:text-[#475569] text-white font-bold py-3.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-xs uppercase tracking-wider shadow-[0_4px_25px_rgba(59,130,246,0.25)] select-none cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4 text-white" />
                  Saving Preferences...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Find My Issues
                </>
              )}
            </button>
          </div>

          <p className="text-center text-[10px] text-[#475569] font-medium">
            You can modify these filters at any time from your personal settings dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}