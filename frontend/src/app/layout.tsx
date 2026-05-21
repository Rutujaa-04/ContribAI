// ============================================================
// src/app/layout.tsx
// ============================================================
// This is the ROOT layout — it wraps every single page.
// It renders ONCE and stays mounted as you navigate between pages.
//
// Two critical providers live here:
// 1. SessionProvider — makes useSession() work in any component
// 2. QueryClientProvider — makes React Query work (for data fetching)
//
// Think of this like the outermost shell of your entire app.
// ============================================================

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";

// ── Font ─────────────────────────────────────────────────────
// Next.js loads Google Fonts at build time — no runtime request.
// `variable` lets us use it as a CSS variable in Tailwind.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

// ── Metadata ──────────────────────────────────────────────────
// This sets the browser tab title and meta description.
// Next.js uses this to generate the <head> tags automatically.
export const metadata: Metadata = {
  title: "ContribAI — Find Your First Open Source Issue",
  description:
    "AI-powered guidance to help developers make meaningful open source contributions.",
};

// ── Root Layout ───────────────────────────────────────────────
// `children` = whatever page is currently being rendered
// `session`  = the current user's session (from the cookie)
//
// We fetch the session server-side here and pass it to
// SessionProvider — this prevents a flash of "logged out" state
// when the page first loads.
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch session on the server so it's available immediately
  const session = await auth();

  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className="bg-background text-foreground antialiased">
        {/*
          SessionProvider makes the session available to ALL
          components via useSession() hook.
          Passing `session` here avoids an extra round trip.
        */}
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}