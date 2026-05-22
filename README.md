# 🚀 ContribAI

[![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Vercel](https://img.shields.io/badge/Vercel-Deployed-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://contrib-ai.vercel.app)
[![Render](https://img.shields.io/badge/Render-Hosted-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://render.com/)

An AI-powered, RAG (Retrieval-Augmented Generation) repository analysis and issue-discovery platform. **ContribAI** is built specifically to bridge the gap between aspiring developers and open-source contributions by reducing the codebase cognitive load.

🔗 **Live Application:** [https://contrib-ai.vercel.app](https://contrib-ai.vercel.app)

---

## 🌟 The Core Problem Solved
Entering a massive, unfamiliar codebase to solve your first "good first issue" is incredibly daunting. Aspiring contributors are faced with hundreds of thousands of lines of code, lack of context, and complex folder structures. 

**ContribAI** completely eliminates this onboarding friction. By integrating GitHub's API with vector-based semantic search and large language models (LLMs), ContribAI acts as an **on-demand AI co-pilot** that points you directly to the relevant files, explains the architecture, and breaks down exactly how to solve the issue.

---

## ✨ Features

- 🔍 **Intelligent Skill-Based Issue Matching**  
  Filter active, open GitHub issues by difficulty (beginner, intermediate, advanced) and target programming languages.
- ⚡ **RAG Codebase Ingestion**  
  Ingests whole public GitHub repositories in seconds. It parses the file trees, extracts files, chunks source code, generates high-density vector embeddings, and indexes them in a Postgres vector store (`pgvector`).
- 🤖 **Interactive Developer Co-Pilot Chat**  
  Chat directly with the repository! Ask questions like *"Where is the routing handled?"* or *"Can you write a test blueprint for this issue?"* and get highly precise, context-aware answers grounded in the actual codebase files.
- 📋 **Automated Action Checklists**  
  Generates step-by-step local setup guidelines and targeted code change instructions to guide your contribution from start to finish.
- ✍️ **One-Click PR Description Generator**  
  Auto-generates clean, professional Pull Request titles and descriptions that explain your changes clearly to open-source maintainers.
- 🔑 **Secure GitHub OAuth Integration**  
  Sign in securely via GitHub to manage your dashboard, track saved issues, and keep log of your progress.

---

## 📐 System Architecture

ContribAI uses a decoupled full-stack architecture with high-performance vector-search and LLM integration:

```mermaid
graph TD
    User([Developer / User]) <-->|Interacts| FE[Next.js 14 Frontend Vercel]
    FE <-->|REST API / OAuth| BE[FastAPI Backend Render]
    BE <-->|GitHub OAuth & Data| GH[GitHub API]
    BE <-->|Read/Write Vectors| DB[(Neon PostgreSQL + pgvector)]
    BE -->|Code Chunking| AST[AST-based Parser]
    AST -->|Gemini Embeddings| GEMINI[Google Gemini API]
    GEMINI --> DB
    BE <-->|Context-Aware Chat| OR[OpenRouter API / LLM]
```

---

## 🛠️ The Tech Stack

### Frontend
- **Framework:** Next.js 14 (App Router, Server Components)
- **Styling:** TailwindCSS (Premium dark-theme design system, glassmorphism, responsive grids)
- **Authentication:** NextAuth.js (GitHub OAuth Provider)
- **Icons:** Lucide React

### Backend
- **Framework:** FastAPI (Python 3.12, Uvicorn, Lifespan management)
- **Database ORM:** SQLModel & SQLAlchemy
- **Database Migrations:** Alembic
- **AI Integrations:**
  - Google Gemini API (for high-speed, dense code embeddings)
  - OpenRouter API (for advanced repository orchestration and chat queries)

### Database & Hosting
- **Database:** Neon Serverless PostgreSQL with native `pgvector` support
- **Hosting (Frontend):** Vercel
- **Hosting (Backend):** Render (Free tier, auto-scaling)

---

## 🚀 Local Development Setup

To run both the frontend and backend servers locally on your machine, follow these instructions:

### Prerequisites
- Node.js (v18+) & npm
- Python (3.11 or 3.12)
- A running PostgreSQL database (with the `vector` extension enabled) or a Neon account.

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
   source venv/bin/activate  # On Windows, use `venv\Scripts\activate`
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Copy the environment template and fill in your keys:
   ```bash
   cp .env.example .env
   ```
   **Required `.env` Variables:**
   ```env
   DATABASE_URL="postgresql://user:pass@host/dbname?sslmode=require"
   SECRET_KEY="your-jwt-signing-secret"
   ALGORITHM="HS256"
   FRONTEND_URL="http://localhost:3000"
   GOOGLE_API_KEY="AIzaSy..."
   OPENROUTER_API_KEY="sk-or-v1-..."
   GITHUB_CLIENT_ID="your-oauth-client-id"
   GITHUB_CLIENT_SECRET="your-oauth-client-secret"
   GITHUB_TOKEN="your-personal-access-token"
   ```
5. Run the backend development server:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
   The backend will be live at `http://localhost:8000`. You can inspect the interactive OpenAPI docs at `http://localhost:8000/docs`.

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
- **Backend (Render):** Deployed as a web service targeting the `/backend` sub-directory, running stable Python 3.12.3.
- **Database (Neon):** Managed Postgres serverless branch with automated migrations and custom `pgvector` activation code integrated directly into the FastAPI application lifespan.

---

## 📄 License
This project is open-source and licensed under the MIT License. Feel free to fork, modify, and use it as a reference for your own applications!