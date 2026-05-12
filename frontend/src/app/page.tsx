// ============================================================
// src/app/page.tsx
// ============================================================
// The public landing page at /.
//
// This is a Server Component (no "use client") — it renders
// on the server, which means faster load and better SEO.
//
// If the user is already logged in, we redirect them straight
// to /discover so they don't see the landing page again.
// ============================================================

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  GitBranch,
  Search,
  Brain,
  CheckCircle,
  ArrowRight
} from "lucide-react";

export default async function LandingPage() {
  // ── Auth check ────────────────────────────────────────────
  // If user is logged in, skip the landing page entirely.
  // Server-side redirect — no flash, no loading state.
  const session = await auth();
  if (session) {
    redirect("/discover");
  }

  return (
    <div className="min-h-screen bg-white">

      {/* ── Navbar ── */}
      <nav className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
              <GitBranch className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-gray-900">ContribAI</span>
          </div>
          <Link
            href="/login"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Sign in →
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-full mb-6">
          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
          AI-powered open source guidance
        </div>

        {/* Headline */}
        <h1 className="text-5xl font-bold text-gray-900 leading-tight mb-6">
          Make your first{" "}
          <span className="text-blue-600">open source</span>{" "}
          contribution
          <br />
          without the overwhelm
        </h1>

        {/* Subheadline */}
        <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10">
          ContribAI finds issues matched to your skills, explains exactly what
          needs to be done, and guides you file-by-file through your first PR.
        </p>

        {/* CTA buttons */}
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-gray-900 text-white font-medium px-6 py-3 rounded-xl hover:bg-gray-700 transition-colors"
          >
            <GitBranch className="w-5 h-5" />
            Get started with GitHub
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 text-gray-600 font-medium px-6 py-3 rounded-xl border border-gray-200 hover:border-gray-400 transition-colors"
          >
            See how it works
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="border-y border-gray-100 bg-gray-50 py-10">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-3xl font-bold text-gray-900">40%</div>
            <div className="text-sm text-gray-500 mt-1">more successful first contributions</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-gray-900">&lt;20 min</div>
            <div className="text-sm text-gray-500 mt-1">from signup to first issue started</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-gray-900">85%</div>
            <div className="text-sm text-gray-500 mt-1">positive feedback on AI analysis</div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-gray-900">How it works</h2>
          <p className="mt-3 text-gray-500">Three steps from zero to your first PR</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Step 1 */}
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Search className="w-6 h-6 text-blue-600" />
            </div>
            <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
              Step 1
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Discover matched issues</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Tell us your languages and experience level. We surface real open
              source issues that fit your skills — not just "good first issue" labels.
            </p>
          </div>

          {/* Step 2 */}
          <div className="text-center">
            <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Brain className="w-6 h-6 text-purple-600" />
            </div>
            <div className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-2">
              Step 2
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Understand with AI</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Get a plain-English breakdown of what the issue means, which files
              to edit, and a step-by-step implementation plan — all AI-generated.
            </p>
          </div>

          {/* Step 3 */}
          <div className="text-center">
            <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">
              Step 3
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Contribute with confidence</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Follow the guided checklist, submit your PR, and track your
              contribution history. Build your portfolio one merged PR at a time.
            </p>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="bg-gray-900 py-16">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to make your first contribution?
          </h2>
          <p className="text-gray-400 mb-8">
            Free to use. Sign in with GitHub and start in under 5 minutes.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-white text-gray-900 font-medium px-6 py-3 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <GitBranch className="w-5 h-5" />
            Sign in with GitHub
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 py-6 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4" />
            <span>ContribAI</span>
          </div>
          <span>Built for developers, by developer</span>
        </div>
      </footer>
    </div>
  );
}