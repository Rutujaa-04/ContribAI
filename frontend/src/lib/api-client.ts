// ============================================================
// src/lib/api-client.ts
// ============================================================
// This file creates a single, pre-configured Axios instance
// that ALL your components use to call the FastAPI backend.
//
// Why not just use fetch() directly in components?
// 1. You'd have to type the backend URL in every component
// 2. You'd have to attach the Authorization header everywhere
// 3. You'd have to handle errors in every component
//
// With this file, every component just does:
//   import { apiClient } from "@/lib/api-client"
//   const data = await apiClient.get("/issues/discover")
// ...and the URL, token, and error handling are automatic.
// ============================================================

import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { getSession } from "next-auth/react";

// ── Create the Axios instance ───────────────────────────────
// baseURL: prepended to every request path automatically
// timeout: give up after 30 seconds (AI calls can be slow)
// headers: default Content-Type for all requests
export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  timeout: 30000, // 30 seconds — AI analysis calls need this
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Request Interceptor ─────────────────────────────────────
// This function runs BEFORE every request is sent.
// It grabs the user's session and attaches their backend JWT
// to the Authorization header automatically.
//
// Without this, every protected endpoint would return 401.
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // getSession() reads the session cookie from the browser
    const session = await getSession();

    // If the user is logged in and we have a backend token,
    // attach it to the Authorization header
    if (session?.user?.backendToken) {
      config.headers.Authorization = `Bearer ${session.user.backendToken}`;
    }

    return config;
  },
  (error) => {
    // If something goes wrong building the request, reject it
    return Promise.reject(error);
  }
);

// ── Response Interceptor ────────────────────────────────────
// This function runs AFTER every response comes back.
// The success case just passes the response through.
// The error case handles common HTTP errors in one place.
apiClient.interceptors.response.use(
  // Success: just return the response as-is
  (response) => response,

  // Error: handle specific status codes
  async (error: AxiosError) => {
    const status = error.response?.status;

    if (status === 401) {
      // Token expired or invalid — redirect to login
      // This handles cases where the backend rejects our JWT
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }

    if (status === 429) {
      // Rate limited (e.g. GitHub API limit hit)
      console.error("Rate limited — slow down requests");
    }

    if (status === 500) {
      console.error("Backend server error:", error.response?.data);
    }

    // Re-throw the error so the calling component can handle it
    return Promise.reject(error);
  }
);

// ── Streaming helper ────────────────────────────────────────
// Regular axios can't handle streaming responses (Server-Sent Events).
// This helper uses the browser's native EventSource API to
// connect to streaming endpoints (like the AI analysis).
//
// Usage in a component:
//   streamAnalysis("issues/123/analysis", (chunk) => {
//     setOutput(prev => prev + chunk)
//   })
export function streamAnalysis(
  issueId: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: Event) => void
): EventSource {
  // We need the token to authenticate the SSE connection
  // We pass it as a query param because EventSource doesn't
  // support custom headers
  const url = `${process.env.NEXT_PUBLIC_API_URL}/issues/${issueId}/analysis/stream`;

  const eventSource = new EventSource(url, {
    withCredentials: true,
  });

  // Each time a chunk arrives, call the onChunk callback
  eventSource.onmessage = (event) => {
    if (event.data === "[DONE]") {
      // Backend sends this special token when streaming is finished
      onDone();
      eventSource.close();
    } else {
      onChunk(event.data);
    }
  };

  eventSource.onerror = (err) => {
    onError(err);
    eventSource.close();
  };

  // Return the EventSource so the component can close it
  // when it unmounts (cleanup to prevent memory leaks)
  return eventSource;
}

// ── Typed API helpers ───────────────────────────────────────
// These wrap common API calls with the correct TypeScript types.
// Import and use these in components instead of calling
// apiClient directly — it keeps your component code cleaner.

import type {
  Issue,
  Repository,
  IssueAnalysis,
  UserIssue,
  DashboardStats,
  DiscoverParams,
  PaginatedResponse,
  ContributionStatus,
} from "./types";

export const api = {
  // ── Issues ──────────────────────────────────────────────
  issues: {
    // Fetch skill-matched issues for the discover page
    discover: async (params: DiscoverParams): Promise<PaginatedResponse<Issue>> => {
      const response = await apiClient.get("/issues/discover", { params });
      return response.data;
    },

    // Fetch a single issue by ID
    getById: async (id: string): Promise<Issue> => {
      const response = await apiClient.get(`/issues/${id}`);
      return response.data;
    },

    // Fetch AI analysis for an issue (non-streaming version)
    getAnalysis: async (id: string): Promise<IssueAnalysis> => {
      const response = await apiClient.get(`/issues/${id}/analysis`);
      return response.data;
    },

    // Save an issue to the user's dashboard
    save: async (issueId: string): Promise<UserIssue> => {
      const response = await apiClient.post(`/issues/${issueId}/save`);
      return response.data;
    },

    // Update contribution status (in_progress, submitted, etc.)
    updateStatus: async (
      issueId: string,
      status: ContributionStatus,
      prUrl?: string
    ): Promise<UserIssue> => {
      const response = await apiClient.patch(
        `/users/me/contributions/${issueId}`,
        { status, pr_url: prUrl }
      );
      return response.data;
    },
  },

  // ── Repositories ────────────────────────────────────────
  repos: {
    // Get the AI-generated overview of a repository
    getOverview: async (owner: string, repo: string): Promise<Repository> => {
      const response = await apiClient.get(`/repos/${owner}/${repo}/overview`);
      return response.data;
    },

    // Trigger background ingestion (embedding) of a repo
    ingest: async (owner: string, repo: string): Promise<{ job_id: string }> => {
      const response = await apiClient.post("/repos/ingest", { owner, repo });
      return response.data;
    },
  },

  // ── Users ───────────────────────────────────────────────
  users: {
    // Get the logged-in user's profile
    me: async () => {
      const response = await apiClient.get("/users/me");
      return response.data;
    },

    // Get dashboard data — saved issues + stats
    dashboard: async (): Promise<{
      stats: DashboardStats;
      saved_issues: UserIssue[];
    }> => {
      const response = await apiClient.get("/users/me/dashboard");
      return response.data;
    },
  },
};