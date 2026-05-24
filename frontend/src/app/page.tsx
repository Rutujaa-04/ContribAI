// ============================================================
// src/app/page.tsx
// ============================================================
// The public landing page at /.
// This is a Server Component (no "use client") — it renders
// on the server, which means faster load and better SEO.
// If the user is already logged in, we redirect them straight
// to /discover so they don't see the landing page again.
// The redesigned public landing page at /.
// Elevated with premium dark SaaS layouts, mesh gradients,
// glowing typography, tactile cards, and fluid layouts.
// ============================================================

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  GitBranch,
  Search,
  Brain,
  CheckCircle,
  ArrowRight,
  TrendingUp,
  Activity,
  Clock,
} from "lucide-react";

export default async function LandingPage() {
  // ── Auth check ────────────────────────────────────────────
  const session = await auth();
  if (session) {
    redirect("/discover");
  }

  return (
    <div className="min-h-screen bg-[#080B10] text-[#F1F5F9] relative overflow-hidden selection:bg-blue-500/20 selection:text-blue-200">
      {/* Ambient mesh background glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] mesh-blob-blue opacity-50 pointer-events-none" />
      <div className="absolute top-[40%] right-[-10%] w-[60%] h-[60%] mesh-blob-purple opacity-40 pointer-events-none" />
      
      {/* ── Glass Navbar ── */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.04] bg-[#080B10]/70 backdrop-blur-md px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 group cursor-pointer">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.4)] transition-all duration-300 group-hover:scale-105 group-hover:shadow-[0_0_25px_rgba(59,130,246,0.6)]">
              <GitBranch className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight bg-gradient-to-r from-white to-[#94A3B8] bg-clip-text text-transparent group-hover:from-white group-hover:to-white transition-all duration-300">
              ContribAI
            </span>
          </div>
          <Link
            href="/login"
            className="text-sm font-medium px-4 py-1.5 rounded-lg border border-white/[0.06] bg-white/5 hover:bg-white/10 hover:border-white/15 text-[#94A3B8] hover:text-white transition-all duration-200"
          >
            Sign in →
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-20 text-center relative z-10 animate-slide-up">
        {/* Sleek Subtitle Header */}
        <p className="text-xs font-bold tracking-widest text-blue-400 uppercase mb-4 animate-fade-in">
          From First Issue to Merged PR
        </p>

        {/* Headline */}
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.1] mb-8 bg-gradient-to-b from-white via-[#E2E8F0] to-[#94A3B8] bg-clip-text text-transparent">
          Make your first <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_2px_15px_rgba(59,130,246,0.15)]">open source</span>
          <br />
          contribution without the pain
        </h1>

        {/* Subheadline */}
        <p className="text-lg sm:text-xl text-[#94A3B8] max-w-2xl mx-auto mb-12 leading-relaxed">
          ContribAI maps open source issues to your skills, explains exactly what 
          needs to be done with RAG codebase insights, and guides you step-by-step.
        </p>

        {/* CTA buttons */}
        <div className="flex items-center justify-center gap-4 flex-wrap mb-16">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold px-7 py-3.5 rounded-xl hover:from-blue-500 hover:to-indigo-500 shadow-[0_4px_20px_rgba(59,130,246,0.25)] hover:shadow-[0_4px_30px_rgba(59,130,246,0.4)] hover:-translate-y-0.5 active:translate-y-px transition-all duration-200"
          >
            <GitBranch className="w-5 h-5" />
            Get Started with GitHub
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 text-[#E2E8F0] font-semibold px-7 py-3.5 rounded-xl border border-white/[0.06] bg-[#111622]/60 hover:bg-[#161D2B]/80 hover:border-white/15 transition-all duration-200"
          >
            See How it Works
            <ArrowRight className="w-4 h-4 text-[#94A3B8]" />
          </a>
        </div>
      </section>

      {/* ── Stats Deck ── */}
      <section className="border-y border-white/[0.04] bg-[#0E131F]/40 backdrop-blur-md py-14 relative z-10">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Stat 1 */}
          <div className="bg-[#10141D]/50 border border-white/[0.03] rounded-2xl p-6 text-center hover:border-white/[0.08] transition-all duration-300">
            <div className="inline-flex p-2 rounded-lg bg-blue-500/10 mb-2">
              <Activity className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">&lt; 15s</div>
            <div className="text-sm text-[#94A3B8] mt-1 font-medium">Repository Ingestion Speed</div>
          </div>
          
          {/* Stat 2 */}
          <div className="bg-[#10141D]/50 border border-white/[0.03] rounded-2xl p-6 text-center hover:border-white/[0.08] transition-all duration-300">
            <div className="inline-flex p-2 rounded-lg bg-indigo-500/10 mb-2">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">90%+</div>
            <div className="text-sm text-[#94A3B8] mt-1 font-medium">Vector Search Precision</div>
          </div>

          {/* Stat 3 */}
          <div className="bg-[#10141D]/50 border border-white/[0.03] rounded-2xl p-6 text-center hover:border-white/[0.08] transition-all duration-300">
            <div className="inline-flex p-2 rounded-lg bg-cyan-500/10 mb-2">
              <CheckCircle className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">1-Click</div>
            <div className="text-sm text-[#94A3B8] mt-1 font-medium">PR Description Generation</div>
          </div>
        </div>
      </section>

      {/* ── How it Works ── */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-28 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl tracking-tight bg-gradient-to-r from-white to-[#94A3B8] bg-clip-text text-transparent">
            Three Steps to Contribution
          </h2>
          <p className="mt-4 text-[#94A3B8] font-medium">From zero experience to your first merged PR</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Step 1 */}
          <div className="tactile-card p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
              <Search className="w-5 h-5 text-blue-400" />
            </div>
            <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2 bg-blue-500/10 px-2 py-0.5 rounded">
              Step 01
            </div>
            <h3 className="text-base font-bold text-white mb-3">Discover Matched Issues</h3>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              Input your tech stack and experience level. We aggregate real GitHub 
              issues matching your skills, going beyond trivial labels.
            </p>
          </div>

          {/* Step 2 */}
          <div className="tactile-card p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
              <Brain className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2 bg-indigo-500/10 px-2 py-0.5 rounded">
              Step 02
            </div>
            <h3 className="text-base font-bold text-white mb-3">Understand with RAG AI</h3>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              Get clear plain-English breakdowns of requirements, mapped files inside 
              the repo codebase, and step-by-step checklists.
            </p>
          </div>

          {/* Step 3 */}
          <div className="tactile-card p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
              <CheckCircle className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-2 bg-cyan-500/10 px-2 py-0.5 rounded">
              Step 03
            </div>
            <h3 className="text-base font-bold text-white mb-3">Contribute with Confidence</h3>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              Check off tasks, write your code, generate an automated rich PR title 
              and description, and submit to the maintainer.
            </p>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="bg-[#0C111A] border-t border-white/[0.04] py-24 relative z-10">
        <div className="max-w-3xl mx-auto px-6 text-center relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl tracking-tight mb-4">
            Ready to make your first contribution?
          </h2>
          <p className="text-[#94A3B8] mb-10 max-w-lg mx-auto text-sm leading-relaxed">
            Free to use. Authenticate securely with GitHub and start building your portfolio in under 5 minutes.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold px-7 py-3.5 rounded-xl hover:from-blue-500 hover:to-indigo-500 shadow-[0_4px_20px_rgba(59,130,246,0.25)] hover:shadow-[0_4px_30px_rgba(59,130,246,0.4)] transition-all duration-200"
          >
            <GitBranch className="w-5 h-5" />
            Sign in with GitHub
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.04] bg-[#080B10] py-8 px-6 relative z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-[#475569]">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4.5 h-4.5 text-[#64748B]" />
            <span className="font-semibold tracking-tight text-[#64748B]">ContribAI</span>
          </div>
          <span>Built by a developer, for developers © {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}