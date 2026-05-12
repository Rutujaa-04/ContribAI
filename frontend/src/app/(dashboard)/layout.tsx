// ============================================================
// src/app/(dashboard)/layout.tsx
// ============================================================
// This layout wraps ALL protected pages — discover, issue detail,
// dashboard home, etc.
//
// Its ONE job: check if the user is logged in.
// If not → redirect to /login.
// If yes → render the page with the sidebar.
//
// Because this runs on the SERVER before the page renders,
// there's zero flash of unauthenticated content.
// ============================================================

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { GitBranch, Search, LayoutDashboard, LogOut } from "lucide-react";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ── Auth guard ────────────────────────────────────────────
  // auth() reads the session cookie server-side.
  // If there's no session, the user isn't logged in.
  const session = await auth();

  if (!session) {
    // redirect() is a Next.js server function — it stops
    // rendering and sends the user to /login immediately.
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* ── Sidebar ── */}
      <aside className="w-60 bg-white border-r border-gray-100 flex flex-col fixed h-full">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center">
              <GitBranch className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-gray-900 text-sm">ContribAI</span>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          <Link
            href="/discover"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <Search className="w-4 h-4" />
            Discover Issues
          </Link>
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <LayoutDashboard className="w-4 h-4" />
            My Dashboard
          </Link>
        </nav>

        {/* User info + sign out at bottom */}
        <div className="px-3 py-4 border-t border-gray-100">
          {/* User avatar + name */}
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            {session.user.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt={session.user.name ?? "User"}
                className="w-7 h-7 rounded-full"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900 truncate">
                {session.user.name}
              </p>
              <p className="text-xs text-gray-400 truncate">
                @{session.user.username}
              </p>
            </div>
          </div>

          {/* Sign out */}
          <Link
            href="/api/auth/signout"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-900 hover:bg-gray-50 transition-colors w-full"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </Link>
        </div>
      </aside>

      {/* ── Main content ── */}
      {/* ml-60 pushes content to the right of the fixed sidebar */}
      <main className="flex-1 ml-60 p-8">
        {children}
      </main>
    </div>
  );
}