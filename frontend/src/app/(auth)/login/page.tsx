// ============================================================
// src/app/(auth)/login/page.tsx
// ============================================================
// The sign-in page at /login.
//
// What happens when user clicks "Sign in with GitHub":
// 1. signIn("github") is called
// 2. NextAuth redirects user to GitHub's authorization page
// 3. User approves the app on GitHub
// 4. GitHub redirects back to /api/auth/callback/github
// 5. NextAuth's jwt() callback fires — calls your backend
// 6. Backend creates/fetches user, returns JWT
// 7. NextAuth stores everything in session cookie
// 8. User is redirected to /discover (logged in!)
// ============================================================

"use client"; // This page uses browser APIs (signIn), so it's a Client Component

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GitBranch, Zap, Shield } from "lucide-react";

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  // ── If already logged in, redirect to discover ────────────
  // This handles the case where user navigates to /login
  // but they're already authenticated.
  useEffect(() => {
    if (session) {
      router.push("/discover");
    }
  }, [session, router]);

  // ── Handle sign in button click ───────────────────────────
  const handleSignIn = async () => {
    setIsLoading(true);
    try {
      // "github" = which provider to use (matches our auth.ts config)
      // callbackUrl = where to go AFTER successful login
      await signIn("github", { callbackUrl: "/discover" });
    } catch (error) {
      console.error("Sign in error:", error);
      setIsLoading(false);
    }
  };

  // ── Loading state while checking session ──────────────────
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  // ── Login UI ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">

      {/* ── Card ── */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

        {/* ── Logo + Title ── */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-900 rounded-xl mb-4">
            <GitBranch className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">ContribAI</h1>
          <p className="mt-2 text-gray-500 text-sm">
            Your AI guide to open source contributions
          </p>
        </div>

        {/* ── Feature highlights ── */}
        <div className="space-y-3 mb-8">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">AI-powered issue analysis</p>
              <p className="text-xs text-gray-500">Understand exactly what needs to be done</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <GitBranch className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Matched to your skill level</p>
              <p className="text-xs text-gray-500">Issues filtered by your languages and experience</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Step-by-step guidance</p>
              <p className="text-xs text-gray-500">Know which files to edit and what to do</p>
            </div>
          </div>
        </div>

        {/* ── Sign in button ── */}
        <button
          onClick={handleSignIn}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-gray-900 hover:bg-gray-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-xl transition-colors duration-200"
        >
          {isLoading ? (
            // Loading spinner while OAuth redirect is happening
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
          ) : (
            <GitBranch className="w-5 h-5" />
          )}
          {isLoading ? "Redirecting to GitHub..." : "Sign in with GitHub"}
        </button>

        {/* ── Fine print ── */}
        <p className="mt-4 text-center text-xs text-gray-400">
          By signing in, you agree that we&apos;ll read your public GitHub profile.
          We never write to your repositories.
        </p>
      </div>

      {/* ── Back to home ── */}
      <a
        href="/"
        className="mt-6 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        ← Back to home
      </a>
    </div>
  );
}