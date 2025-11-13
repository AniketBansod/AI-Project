AI-powered classroom platform with Next.js, Node/Express API, and a FastAPI microservice that detects plagiarism using FAISS vector search, BM25, and AI text detection — backed by PostgreSQL (pgvector), Redis + BullMQ, S3 storage, Docker, and a Caddy reverse proxy.

---

# AI‑Powered Classroom & Plagiarism Detection

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=nextdotjs)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js)
![FastAPI](https://img.shields.io/badge/FastAPI-0.117-009688?logo=fastapi)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?logo=postgresql)
![Redis](https://img.shields.io/badge/Redis-7-red?logo=redis)
![BullMQ](https://img.shields.io/badge/BullMQ-Queues-CC0000)
![FAISS](https://img.shields.io/badge/FAISS-Vector%20Search-1f6feb)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma)
![AWS S3](https://img.shields.io/badge/AWS-S3-orange?logo=amazon-aws)
![Docker](https://img.shields.io/badge/Docker-Multi--Service-2496ED?logo=docker)
![Caddy](https://img.shields.io/badge/Caddy-Reverse%20Proxy-2aa3ff)
![License](https://img.shields.io/badge/License-ISC-blue)

## 🚀 Features

- Robust classroom workflows: classes, assignments, submissions, comments, grades, materials.
- Email/password + Google OAuth sign‑in; JWT‑secured API with role‑based access (Teacher/Student).
- AI plagiarism detection pipeline combining FAISS vector search, BM25, and AI text detectors.
- Incremental FAISS indexing on each submission; per‑assignment filtering to reduce false positives.
- Highlighted PDF generation with copied/AI segments and optional upload to S3.
- Asynchronous processing with Redis + BullMQ worker; resilient retries and backoff.
- PostgreSQL with pgvector for embeddings and Prisma ORM; health and readiness probes.
- Modern Next.js 14 UI with Tailwind and Axios; typed TypeScript codebase end‑to‑end.
- Docker Compose stack with API, worker, AI service, Redis, and Caddy reverse proxy.

## 🧠 Architecture

Technologies

- Frontend: Next.js 14, Tailwind, Axios.
- API: Node.js + Express 5, Prisma ORM, JWT, Google OAuth, Nodemailer.
- AI Service: FastAPI + PyTorch + sentence‑transformers + FAISS + BM25 + PyMuPDF.
- Async/Queue: BullMQ + Redis.
- Storage: PostgreSQL (pgvector), AWS S3 (uploads + highlighted PDFs).
- Networking: Caddy reverse proxy; Docker Compose for local/prod deployment.

Data Flow

- The Next.js app calls the Express API. Teachers create assignments; students submit text/PDF.
- The API persists submissions in Postgres and enqueues a plagiarism job in Redis/BullMQ.
- A worker consumes jobs, calls the FastAPI service (`/check`, `/highlight_pdf`), and upserts reports.
- The AI service performs vector search (FAISS) + BM25 + AI text detection and returns similarity.
- Optional: AI service generates a highlighted PDF; the worker uploads it to S3 and stores the link.

ASCII Diagram

```
[Next.js] ──HTTP──> [Express API] ──SQL──> [PostgreSQL (pgvector)]
			│                    │                    ▲
			│                    ├─enqueue─> [Redis + BullMQ] ──consumed by──> [Worker]
			│                    │                                             │
			│                    │                                   HTTP      │
			│                    └─────────────────────────────────────────────►│
			│                                                                  ▼
			│                                                            [FastAPI AI]
			│                                                                  │
			│                          s3:// upload (optional)                 │
			└──────────────────────────────────────────────────────────────────►[AWS S3]

							 [Caddy] reverse‑proxies API and AI services in Docker
```

## 🛠️ Tech Stack

- Frontend: `Next.js`, `React`, `TypeScript`, `TailwindCSS`.
- API: `Express 5`, `TypeScript`, `Prisma`, `jsonwebtoken`, `helmet`, `cors`, `nodemailer`, `passport-google-oauth20`.
- AI: `FastAPI`, `PyTorch`, `sentence-transformers`, `faiss-cpu`, `rank-bm25`, `nltk`, `PyMuPDF`.
- Queue: `BullMQ`, `ioredis`.
- Database: `PostgreSQL` + `pgvector` extension.
- Storage: `AWS S3` (`multer-s3-v3`, `@aws-sdk/client-s3`).
- Infra: `Docker`, `Docker Compose`, `Caddy`.

## 📦 Installation

Prerequisites

- Node.js 20+, npm
- Python 3.11+
- PostgreSQL 14+ with `pgvector` extension
- Redis 7+
- Docker (optional but recommended)

Clone

```powershell
git clone https://github.com/AniketBansod/AI-Project.git
cd AI-Project
```

Environment

- Create env files from the provided examples:
  - `backend/.env.example` → `backend/.env`
  - `ai-service/.env.example` → `ai-service/.env`
  - `frontend/.env.example` → `frontend/.env`

Install dependencies

```powershell
# Backend
cd backend; npm ci; cd ..

# Frontend
cd frontend; npm ci; cd ..

# AI service
cd ai-service; python -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt; cd ..
```

Database (Prisma)

```powershell
cd backend
# Generate client and apply migrations (requires DATABASE_URL / DIRECT_URL)
npx prisma generate
npx prisma migrate deploy
cd ..
```

## 🧪 Running the Project

Development (separate terminals)

```powershell
# 1) AI service
cd ai-service; .\.venv\Scripts\Activate.ps1; uvicorn main:app --host 0.0.0.0 --port 8000

# 2) API (Express)
cd backend; npm run dev

# 3) Worker (BullMQ)
cd backend; npm run worker

# 4) Frontend (Next.js)
cd frontend; npm run dev
```

Production (Docker Compose)

```powershell
# builds/starts caddy, api, worker, ai, redis using docker images
docker compose up -d

# view logs
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f ai
```

## 🔍 Usage

- Teachers create classes and assignments; students submit text or PDFs.
- The dashboard shows plagiarism reports with similarity score and AI‑probability.
- For PDFs, a highlighted copy can be retrieved if S3 is configured.

API Base (development)

- Backend: `http://localhost:5000`
- Frontend: `http://localhost:3000`
- AI service: `http://localhost:8000`

Generating a vector index (optional bulk ingest)

```powershell
cd ai-service\backend\src
python ingest_embeddings.py
```

## ⚙️ Configuration

Backend (`backend/.env`)

```
PORT=5000
NODE_ENV=development
PUBLIC_API_BASE_URL=http://localhost:5000
PUBLIC_APP_BASE_URL=http://localhost:3000
CORS_ALLOWED=http://localhost:3000

# PostgreSQL
DATABASE_URL=postgresql://user:pass@host:5432/db
DIRECT_URL=postgresql://user:pass@host:5432/db?sslmode=require

# Auth
JWT_SECRET=replace-me
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback

# Email (SMTP)
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=username
EMAIL_PASS=password

# Queue/Redis/AI
REDIS_URL=redis://127.0.0.1:6379
AI_SERVICE_URL=http://127.0.0.1:8000
JOB_ATTEMPTS=3
JOB_BACKOFF_MS=3000
HTTP_RETRIES=2
HTTP_BACKOFF_MS=1500
WORKER_CONCURRENCY=1

# AWS S3
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your-bucket
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret
```

AI Service (`ai-service/.env`)

```
# DB + Cache
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://127.0.0.1:6379

# FAISS index persistence
FAISS_INDEX_PATH=./data/faiss_index.bin
FAISS_META_PATH=./data/faiss_meta.pkl
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

# Detection
DETECTOR_MODELS=Hello-SimpleAI/chatgpt-detector-roberta,roberta-base-openai-detector
ENABLE_PERPLEXITY=false
PERPLEXITY_MODEL=gpt2
PERPLEXITY_WEIGHT=0.5
CHUNK_SIZE_WORDS=250
CHUNK_OVERLAP_WORDS=50
MAX_QUERY_CHUNKS=40
AI_THRESHOLD=0.5
AI_SENTENCE_THRESHOLD=0.7

# Optional S3 access for fetching PDFs
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret
```

Frontend (`frontend/.env`)

```
NEXT_PUBLIC_API_BASE=http://localhost:5000
```

## 🧵 API Endpoints (overview)

- `GET /health`, `GET /ready` – liveness/readiness checks.
- `/auth` – register, login, Google OAuth, email verification, `GET /auth/me`.
- `/api/classes` – class CRUD and membership.
- `/api/assignments` – create/update/delete, list submissions, list rejected.
- `/api/submissions` – create submission (text/PDF), grade/feedback.
- `/api/submission-comments` – threaded comments on submissions.
- `/api/materials` – class materials and attachments.
- `/api/posts`, `/api/comments` – class posts and comments.
- `/api/plagiarism-reports/:submissionId` – fetch report for a submission.
- AI Service: `POST /check`, `POST /highlight_pdf`, plus `GET /health`.

## 📈 Performance / Benchmarks

- Backend health endpoint (autocannon, 30s, 30 connections):
  - ~612 req/s average; p50 ≈ 28 ms; p90 ≈ 42 ms. See `evidence/backend/autocannon-get.json`.
- Lighthouse (deployed frontend, desktop):
  - FCP ≈ 0.7s, LCP ≈ 0.8s, Speed Index ≈ 1.3s. See `evidence/frontend/` reports.
  - Parse helpers in `tools/parse-autocannon.js` and `tools/parse-lighthouse.js`.

## 🧩 Folder Structure

```
ai-service/           # FastAPI microservice (FAISS/BM25/AI detection)
	backend/src/        # Vector index + embedding ingest
	tasks/              # Plagiarism + PDF highlight routines
backend/              # Express API, Prisma schema, BullMQ worker
	prisma/             # PostgreSQL schema (pgvector) and migrations
	src/controllers/    # Route handlers
	src/routes/         # Express routes (auth, class, assignment, etc.)
	src/queues/         # BullMQ queue definition
	src/utils/          # config/auth/email/passport/prisma
frontend/             # Next.js 14 app
evidence/             # Benchmarks & audits
tools/                # Scripts to parse evidence
Caddyfile             # Reverse proxy config
docker-compose.yml    # Multi-service deployment
```

## 🛡️ Security

- JWT auth with role‑based access guards (Teacher/Student).
- CORS allowlist and secure headers via Helmet and Caddy.
- Google OAuth 2.0 login supported.
- Rate limiting can be added at Caddy or API layer (recommended for production).
- Avoid committing real secrets; use the provided `.env.example` files.

## 📦 Deployment

- Vercel for the Next.js frontend (set `NEXT_PUBLIC_API_BASE` to your API origin).
- Docker Compose for API/worker/AI/Redis/Caddy (see `docker-compose.yml`).
- Caddy terminates TLS and reverse‑proxies `/api/*`, `/auth/*`, and AI endpoints.
- Container images can be published to GHCR and referenced in Compose (see current tags in `docker-compose.yml`).

## 🧠 Future Improvements

- Add teacher dashboards for report trends and cohort analytics.
- Add submission deduplication and resubmission diffs.
- Implement per‑class/assignment granular rate limiting.
- Expand AI detectors with lightweight distilled models for faster cold starts.
- Batch ingestion job and periodic FAISS index rebuilds.
- Webhooks/events to notify on report completion and S3 uploads.
- E2E tests (Playwright) and load tests as CI artifacts.
- Terraform/Bicep for cloud infra and secrets management.

## 📝 License

Licensed under the ISC License. See `LICENSE` for full text.

## 🙌 Acknowledgements

- FAISS, sentence‑transformers, rank‑BM25, PyMuPDF.
- Prisma, BullMQ, Caddy, and the broader Next.js ecosystem.
