// ============================================================
// src/lib/auth.ts
// ============================================================
// This is the NextAuth configuration file — the brain of your
// entire authentication system.
//
// What it does:
// 1. Tells NextAuth to use GitHub as the login provider
// 2. After GitHub login succeeds, calls YOUR backend to create
//    or fetch the user from YOUR database
// 3. Stores the user info + tokens in the session cookie
// 4. Exposes that session to every component in your app
//
// You will NOT need to change this file much. Once it works,
// it just works.
// ============================================================

import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // ── Providers ──────────────────────────────────────────────
  // Tell NextAuth which OAuth providers to support.
  // We're using GitHub only. The credentials come from .env.local
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,

      // Request these extra permissions from GitHub during OAuth.
      // "read:user" = access profile info
      // "user:email" = access their email address
      authorization: {
        params: {
          scope: "read:user user:email",
        },
      },
    }),
  ],

  // ── Custom Pages ───────────────────────────────────────────
  // Tell NextAuth where your custom login page lives.
  // Without this, it uses its own ugly default login page.
  pages: {
    signIn: "/login",
    error: "/login", // Redirect here on auth errors too
  },

  // ── Session Strategy ───────────────────────────────────────
  // "jwt" means the session is stored in an encrypted cookie
  // in the browser. The alternative is "database" (stores in DB).
  // JWT is simpler for our setup.
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
  },

  // ── Callbacks ──────────────────────────────────────────────
  // Callbacks are functions that run at specific points in
  // the auth flow. This is where you add custom logic.
  callbacks: {
    // ── jwt callback ────────────────────────────────────────
    // Runs when a JWT is created (on login) or accessed.
    // The `token` object is what gets stored in the cookie.
    // The `account` and `profile` objects are only available
    // on the FIRST sign-in (not on subsequent session reads).
    //
    // Here we store the GitHub access token and call our
    // backend to get our own JWT.
    async jwt({ token, account, profile }) {
      // `account` is only defined on first sign-in
      if (account && profile) {
        // Store GitHub's access token — we'll use this to
        // make GitHub API calls on behalf of the user
        token.accessToken = account.access_token;
        token.githubUsername = (profile as any).login;

        // ── Call your FastAPI backend ──────────────────────
        // Send the GitHub access token to your backend.
        // Your backend will:
        // 1. Call GitHub's /user endpoint to verify the token
        // 2. Create or update the user in YOUR database
        // 3. Return a JWT signed with YOUR secret key
        try {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/auth/github`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                access_token: account.access_token,
              }),
            }
          );

          if (response.ok) {
            const data = await response.json();
            // Store your backend's JWT in the token
            token.backendToken = data.access_token;
            token.backendUserId = data.user_id;
          } else {
            console.error("Backend auth failed:", await response.text());
          }
        } catch (error) {
          // If the backend is down during development, don't
          // crash the whole auth flow — just log the error.
          // Remove this try/catch lenience in production.
          console.error("Could not reach backend during auth:", error);
        }
      }

      return token;
    },

    // ── session callback ─────────────────────────────────────
    // Runs when someone calls `getServerSession()` or `useSession()`.
    // Takes the JWT token (from the cookie) and shapes it into
    // the session object your components will use.
    //
    // Whatever you put on `session.user` here is what you get
    // back from useSession() in your components.
    async session({ session, token }) {
      if (token) {
        session.user.id = token.backendUserId as string;
        session.user.username = token.githubUsername as string;
        // @ts-ignore — we're adding custom fields to the session
        session.user.accessToken = token.accessToken as string;
        // @ts-ignore
        session.user.backendToken = token.backendToken as string;
      }
      return session;
    },
  },
});

// ── TypeScript module augmentation ─────────────────────────
// Tell TypeScript that our custom fields exist on the session.
// Without this, TypeScript will complain when you access
// session.user.username or session.user.backendToken.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      image: string;
      username: string;
      accessToken: string;
      backendToken: string;
    };
  }
}