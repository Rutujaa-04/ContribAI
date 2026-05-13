// ============================================================
// src/components/OnboardingModal.tsx
// ============================================================
// Shown to users who have no skill_tags set (is_onboarded = false).
// Lets them pick languages and experience level.
// On submit, calls PATCH /users/me and stores in DB.
//
// Usage: in discover/page.tsx, check is_onboarded and render this.
// ============================================================

"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import { CheckCircle2, Code2, Zap } from "lucide-react";

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
    description: "< 1 year, learning the ropes",
    color: "border-green-200 bg-green-50 text-green-800",
    selectedColor: "border-green-500 bg-green-100 ring-2 ring-green-400",
  },
  {
    value: "intermediate",
    label: "Intermediate",
    description: "1–3 years, comfortable with code",
    color: "border-blue-200 bg-blue-50 text-blue-800",
    selectedColor: "border-blue-500 bg-blue-100 ring-2 ring-blue-400",
  },
  {
    value: "advanced",
    label: "Advanced",
    description: "3+ years, system design experience",
    color: "border-purple-200 bg-purple-50 text-purple-800",
    selectedColor: "border-purple-500 bg-purple-100 ring-2 ring-purple-400",
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
      setError("Pick at least one language.");
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
    } catch (e) {
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  };

  return (
    // ── Backdrop ────────────────────────────────────────────
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      {/* ── Modal card ── */}
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">

        {/* ── Header ── */}
        <div className="bg-gray-900 px-6 py-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-white">Quick setup</h2>
          </div>
          <p className="text-gray-400 text-sm">
            Tell us your stack so we can find issues that actually fit you.
          </p>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* ── Language picker ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Code2 className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-900">
                Languages & frameworks you know
              </span>
              <span className="text-xs text-gray-400">(pick all that apply)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((lang) => {
                const isSelected = selectedLangs.includes(lang.value);
                return (
                  <button
                    key={lang.value}
                    onClick={() => toggleLang(lang.value)}
                    className={`
                      inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                      border transition-all duration-150 cursor-pointer select-none
                      ${isSelected
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"
                      }
                    `}
                  >
                    <span>{lang.emoji}</span>
                    {lang.label}
                    {isSelected && (
                      <CheckCircle2 className="w-3.5 h-3.5 ml-0.5 text-white" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Experience level ── */}
          <div>
            <p className="text-sm font-medium text-gray-900 mb-3">
              Your experience level
            </p>
            <div className="space-y-2">
              {LEVELS.map((lvl) => {
                const isSelected = selectedLevel === lvl.value;
                return (
                  <button
                    key={lvl.value}
                    onClick={() => setSelectedLevel(lvl.value)}
                    className={`
                      w-full flex items-start gap-3 px-4 py-3 rounded-xl border text-left
                      transition-all duration-150 cursor-pointer
                      ${isSelected ? lvl.selectedColor : "border-gray-200 bg-white hover:border-gray-300"}
                    `}
                  >
                    {/* Radio dot */}
                    <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0
                      ${isSelected ? "border-current" : "border-gray-300"}`}>
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-current" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{lvl.label}</div>
                      <div className="text-xs opacity-70 mt-0.5">{lvl.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Error ── */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          {/* ── Submit ── */}
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Find my issues →
              </>
            )}
          </button>

          <p className="text-center text-xs text-gray-400">
            You can update this anytime from your profile settings.
          </p>
        </div>
      </div>
    </div>
  );
}