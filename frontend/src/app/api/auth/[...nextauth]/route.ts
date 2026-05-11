// ============================================================
// src/app/api/auth/[...nextauth]/route.ts
// ============================================================
// This is the NextAuth catch-all API route.
//
// It handles ALL of these URLs automatically:
//   /api/auth/signin
//   /api/auth/signout
//   /api/auth/callback/github   ← GitHub redirects here after login
//   /api/auth/session
//   /api/auth/csrf
//
// You almost NEVER need to touch this file.
// All the real logic lives in src/lib/auth.ts.
//
// The [...nextauth] folder name is Next.js syntax for a
// "catch-all" dynamic route — it matches any path segment.
// ============================================================

import { handlers } from "@/lib/auth";

// Export GET and POST handlers from NextAuth.
// Next.js App Router needs these named exports to handle
// HTTP GET and POST requests to this route.
export const { GET, POST } = handlers;