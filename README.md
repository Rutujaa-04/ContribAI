# 🚀 ContribAI

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Vercel](https://img.shields.io/badge/Vercel-Deployed-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://contrib-ai.vercel.app)
[![Render](https://img.shields.io/badge/Render-Hosted-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://render.com/)

An AI-powered, RAG (Retrieval-Augmented Generation) repository analysis and issue-discovery platform. **ContribAI** is built specifically to bridge the gap between aspiring developers and open-source contributions by reducing the codebase cognitive load.

🔗 **Live Application:** [https://contrib-ai.vercel.app](https://contrib-ai.vercel.app)

---

## 🌟 The Core Problem Solved
Entering a massive, unfamiliar codebase to solve your first "good first issue" is daunting. Aspiring contributors are faced with hundreds of thousands of lines of code, lack of context, and complex folder structures. 

**ContribAI** eliminates this onboarding friction. By integrating GitHub's API with vector-based semantic search and large language models (LLMs), ContribAI acts as an **on-demand AI co-pilot** that points you directly to the relevant files, explains the architecture, and breaks down exactly how to solve the issue.

---

## ✨ Features

- 🔍 **Intelligent Skill-Based Issue Matching**  
  Filter active, open GitHub issues by difficulty (beginner, intermediate, advanced) and target programming languages with smart recommendation scoring based on user profile and repository familiarity.
- ⚡ **RAG Codebase Ingestion**  
  Ingests public GitHub repositories on demand. It parses file trees, extracts source files, chunks code across syntactic function/class boundaries, generates 768-dimensional dense vector embeddings via Ollama (`nomic-embed-text`), and indexes them in a PostgreSQL vector store (`pgvector`).
- 🤖 **Deep RAG-Powered Issue Walkthroughs**  
  Provides context-aware RAG analysis for specific issues. It runs cosine similarity searches against the vector store to locate exact code chunks and structures relevant to the issue, generating grounded blueprints with real file references.
- 📋 **Automated Action Checklists & Edge Cases**  
  Generates step-by-step local setup guidelines, targeted code change instructions, test hints, and edge case alerts to guide your contribution from start to finish.
- ✍️ **One-Click PR Description Generator**  
  Auto-generates clean, professional Pull Request titles and markdown descriptions based on your issue context and personal contribution summary.
- 🔑 **Secure GitHub OAuth Integration**  
  Sign in securely via GitHub to manage your dashboard, track saved issues, record progress, and inspect live PR competition on GitHub.

---

## 📐 System Architecture

ContribAI uses a decoupled full-stack architecture with high-performance vector-search and LLM integration:

```mermaid
graph TD
    User([Developer / User]) <-->|Interacts| FE[Next.js Frontend Vercel]
    FE <-->|REST API / OAuth| BE[FastAPI Backend Render]
    BE <-->|GitHub OAuth & Data| GH[GitHub API]
    BE <-->|Read/Write Vectors| DB[(Neon PostgreSQL + pgvector)]
    BE -->|Syntactic Chunking| CHUNK[Code Chunker]
    CHUNK -->|Vector Embeddings| EMBED[Ollama / nomic-embed-text]
    EMBED --> DB
    BE <-->|RAG Analysis & PR Drafts| LLM[OpenRouter API / LLM]
```

---

## 🛠️ The Tech Stack

### Frontend
- **Framework:** Next.js 16 (App Router, Server Components) & React 19
- **Styling:** TailwindCSS v4 (Premium dark-theme design system, glassmorphism, responsive grids)
- **Authentication:** NextAuth.js v5 (GitHub OAuth Provider)
- **State & Data Fetching:** TanStack React Query & Axios
- **Icons & UI:** Lucide React & Radix UI primitives

### Backend
- **Framework:** FastAPI (Python 3.11 / 3.12, Uvicorn, Lifespan management)
- **Database ORM:** SQLAlchemy with `pgvector` extension
- **Database Migrations:** Alembic
- **Code Chunking:** Regex-based syntactic boundary chunker (function/class boundaries across Python, TypeScript, Go, Rust, Java, etc.)
- **Vector Embeddings:** Ollama `nomic-embed-text` (768 dimensions, zero-rate-limit local embedding)
- **LLM Orchestration:** OpenRouter API (unified multi-model routing for deep RAG issue analysis, PR drafting, architecture & contributing summaries)

### Database & Hosting
- **Database:** Neon Serverless PostgreSQL with native `pgvector` support
- **Hosting (Frontend):** Vercel
- **Hosting (Backend):** Render (Web service, auto-scaling)

---

## 🚀 Local Development Setup

To run both the frontend and backend servers locally on your machine, follow these instructions:

### Prerequisites
- Node.js (v18+) & npm
- Python (3.11 or 3.12)
- A running PostgreSQL database with the `vector` extension enabled (or a Neon database instance)
- [Ollama](https://ollama.com/) running locally with the `nomic-embed-text` model:
  ```bash
  ollama serve
  ollama pull nomic-embed-text
  ```

---

### 1. Clone the Repository
```bash
git clone https://github.com/Rutujaa-04/ContribAI.git
cd ContribAI
```

### 2. Configure the FastAPI Backend
1. Navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file in the `backend` folder:
   ```env
   DATABASE_URL="postgresql://user:pass@host/dbname?sslmode=require"
   SECRET_KEY="your-jwt-signing-secret"
   ALGORITHM="HS256"
   FRONTEND_URL="http://localhost:3000"
   OPENROUTER_API_KEY="sk-or-v1-..."
   GITHUB_CLIENT_ID="your-oauth-client-id"
   GITHUB_CLIENT_SECRET="your-oauth-client-secret"
   GITHUB_TOKEN="your-personal-access-token"
   ```
5. Run the backend development server:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
   The backend will be live at `http://localhost:8000`. You can inspect interactive OpenAPI documentation at `http://localhost:8000/docs`.

---

### 3. Configure the Next.js Frontend
1. Open a new terminal window and navigate to the frontend folder:
   ```bash
   cd frontend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Create a `.env.local` file at the root of the `frontend` folder:
   ```env
   NEXT_PUBLIC_API_URL="http://localhost:8000"
   AUTH_SECRET="your-next-auth-secret-key"
   GITHUB_CLIENT_ID="your-oauth-client-id"
   GITHUB_CLIENT_SECRET="your-oauth-client-secret"
   ```
4. Run the frontend development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser to start contributing!

---

## 🔒 Production Deployment Overview

- **Frontend (Vercel):** Configured to build the `/frontend` sub-directory using the Next.js preset.
- **Backend (Render):** Deployed as a web service targeting the `/backend` sub-directory, running stable Python 3.12.
- **Database (Neon):** Managed Postgres serverless branch with automated migrations and custom `pgvector` activation code integrated directly into the FastAPI application lifespan.

---

## 📄 License
This project is open-source and licensed under the MIT License. Feel free to fork, modify, and use it as a reference for your own applications!