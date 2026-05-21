// ============================================================
// src/app/(auth)/login/page.tsx
// ============================================================
// The sign-in page at /login.
// What happens when user clicks "Sign in with GitHub":
// 1. signIn("github") is called
// 2. NextAuth redirects user to GitHub's authorization page
// 3. User approves the app on GitHub
// 4. GitHub redirects back to /api/auth/callback/github
// 5. NextAuth's jwt() callback fires — calls your backend
// 6. Backend creates/fetches user, returns JWT
// 7. NextAuth stores everything in session cookie
// 8. User is redirected to /discover (logged in!)
// Redesigned premium login portal. Encased in an elegant
// glassmorphic card with ambient mesh glows, subtle typography,
// and micro-scale interactive button states.
// ============================================================

"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { GitBranch, Zap, Shield, ArrowLeft, Loader2 } from "lucide-react";

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  // Redirect to discover if authenticated
  useEffect(() => {
    if (session) {
      router.push("/discover");
    }
  }, [session, router]);

  const handleSignIn = async () => {
    setIsLoading(true);
    try {
      await signIn("github", { callbackUrl: "/discover" });
    } catch (error) {
      console.error("Sign in error:", error);
      setIsLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#080B10]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <span className="text-xs text-[#64748B] font-medium tracking-wide">Syncing session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080B10] flex flex-col items-center justify-center px-4 relative overflow-hidden selection:bg-blue-500/20 selection:text-blue-200">
      
      {/* Background ambient lighting blobs */}
      <div className="absolute top-[20%] left-[20%] w-[60%] h-[60%] mesh-blob-blue opacity-30 pointer-events-none" />
      <div className="absolute bottom-[10%] right-[10%] w-[50%] h-[50%] mesh-blob-purple opacity-20 pointer-events-none" />

      {/* ── Glass Login Card ── */}
      <div className="w-full max-w-md bg-[#10141D]/70 backdrop-blur-lg border border-white/[0.05] shadow-[0_12px_40px_rgba(0,0,0,0.5)] rounded-2xl p-8 relative z-10 animate-popup">
        
        {/* Logo and Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl mb-4 shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-transform duration-300 hover:scale-105">
            <GitBranch className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">ContribAI</h1>
          <p className="mt-2 text-xs text-[#94A3B8] font-medium">
            Your AI-guided pathway to open source contributions
          </p>
        </div>

        {/* Feature Deck */}
        <div className="space-y-4 mb-8">
          {/* Feature 1 */}
          <div className="flex items-start gap-3 p-3 bg-[#161D2B]/40 rounded-xl border border-white/[0.02]">
            <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">AI-Powered Repository Mapping</p>
              <p className="text-[11px] text-[#94A3B8] mt-0.5">Generates plain-English issue summaries and file paths.</p>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="flex items-start gap-3 p-3 bg-[#161D2B]/40 rounded-xl border border-white/[0.02]">
            <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <GitBranch className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Skill-Matched Sourcing</p>
              <p className="text-[11px] text-[#94A3B8] mt-0.5">Finds issues matching your preferred stack and difficulty.</p>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="flex items-start gap-3 p-3 bg-[#161D2B]/40 rounded-xl border border-white/[0.02]">
            <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Guided Implementation Checklist</p>
              <p className="text-[11px] text-[#94A3B8] mt-0.5">Edit with confidence using code maps and edge-case hints.</p>
            </div>
          </div>
        </div>

        {/* Sign In button */}
        <button
          onClick={handleSignIn}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 shadow-[0_4px_15px_rgba(59,130,246,0.2)] hover:from-blue-500 hover:to-indigo-500 hover:shadow-[0_4px_25px_rgba(59,130,246,0.35)] hover:-translate-y-0.5 active:translate-y-px disabled:bg-[#161D2B] disabled:text-[#475569] disabled:shadow-none cursor-pointer"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <GitBranch className="w-5 h-5" />
          )}
          {isLoading ? "Connecting to GitHub..." : "Sign in with GitHub"}
        </button>

        {/* Disclaimer print */}
        <p className="mt-5 text-center text-[10px] text-[#475569] leading-relaxed">
          By authenticating, you permit ContribAI to read your public profile. We maintain high security standards and will never write to your repositories.
        </p>
      </div>

      {/* Back home anchor */}
      <Link
        href="/"
        className="mt-6 flex items-center gap-1.5 text-xs text-[#64748B] hover:text-white transition-colors duration-200 group relative z-10"
      >
        <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform duration-200" />
        Back to home
      </Link>
    </div>
  );
}