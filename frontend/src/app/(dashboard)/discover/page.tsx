// ============================================================
// src/app/(dashboard)/discover/page.tsx
// ============================================================
// The main issue discovery page.
// For now this is a placeholder — we'll build the real
// issue fetching + filtering in the next step.
//
// This page only renders if the user is logged in
// (the layout.tsx above this handles the auth check).
// ============================================================

import { auth } from "@/lib/auth";

export default async function DiscoverPage() {
  const session = await auth();

  return (
    <div>
      {/* ── Page header ── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome, {session?.user?.name?.split(" ")[0]} 👋
        </h1>
        <p className="mt-1 text-gray-500">
          Find open source issues matched to your skills
        </p>
      </div>

      {/* ── Placeholder content ── */}
      {/* We'll replace this with real issue cards in the next step */}
      <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Issue discovery coming next
        </h2>
        <p className="text-gray-500 text-sm max-w-sm mx-auto">
          Auth is working! Next we&apos;ll connect to the GitHub API and show
          real issues matched to your skill profile.
        </p>

        {/* Show the logged-in user's info — confirms auth works */}
        <div className="mt-6 inline-flex items-center gap-3 bg-green-50 text-green-800 px-4 py-2 rounded-xl text-sm">
          <span className="w-2 h-2 bg-green-500 rounded-full" />
          Logged in as @{session?.user?.username} ✓
        </div>
      </div>
    </div>
  );
}