# Spry — Repository Structure & First Vertical Slice Specification (`PROJECT.md`)

## 1. Architectural Decision

Spry is structured as a **single Git monorepo** containing the FastAPI backend, React frontend, database migrations, and local Docker Compose orchestration:

1. **Atomic Cross-Stack Changes:** A single Git commit updates the database migration, the SQLAlchemy model, the FastAPI Pydantic schema/endpoint, and the React UI component that consumes it. The frontend and backend contracts can never drift out of sync.
2. **The Repository Is the AI Agent's Context Window:** When the entire vertical slice lives in one directory tree, a coding agent can read the database migration, ORM model, API route, and React component in a single pass. Splitting a 4-person startup project across three repositories forces the agent to see only one-third of the system and guess the API contract across repo boundaries—turning guessed contracts into integration bugs.

---

## 2. Pinned Technology Versions

| Layer | Technology | Pinned Version |
| :--- | :--- | :--- |
| **Database Container** | PostgreSQL | `postgres:16.4-alpine` |
| **Backend Base Image** | Python (Debian Slim) | `python:3.12.6-slim` |
| **Backend Framework** | FastAPI + Uvicorn | `fastapi==0.115.0`, `uvicorn[standard]==0.30.6` |
| **ORM & DB Driver** | SQLAlchemy 2.0 + Psycopg 3 | `sqlalchemy==2.0.35`, `psycopg[binary]==3.2.2` |
| **Schema Migrations** | Alembic | `alembic==1.13.3` |
| **Validation** | Pydantic v2 | `pydantic==2.9.2` |
| **Frontend Base Image** | Node.js (Debian Slim) | `node:20.17.0-slim` |
| **Frontend Build & UI** | React + TypeScript + Vite | `react@18.3.1`, `typescript@5.6.2`, `vite@5.4.8` |
| **Styling & Components** | Tailwind CSS + shadcn/ui | `tailwindcss@3.4.13`, `lucide-react@0.446.0` |

---

## 3. Repository Directory Layout & Purpose of Every Folder

```text
spry/
├── PROJECT.md                        # Specification of structure, contracts, and startup rules
├── docker-compose.yml                # Local 3-service orchestration (postgres, backend, frontend)
├── .gitignore                        # Ignores __pycache__, .venv, node_modules, dist, .env
│
├── backend/                          # FastAPI backend service + SQLAlchemy ORM + Alembic
│   ├── Dockerfile                    # Builds python:3.12.6-slim image, installs requirements, runs entrypoint
│   ├── requirements.txt              # Pinned Python dependencies
│   ├── alembic.ini                   # Alembic CLI configuration pointing to backend/alembic
│   ├── alembic/                      # Versioned database schema migrations
│   │   ├── env.py                    # Connects Alembic to SQLAlchemy Base.metadata and DATABASE_URL
│   │   ├── script.py.mako            # Template for generating new migration files
│   │   └── versions/                 # Ordered migration scripts (e.g., 0001_create_meetings_table.py)
│   └── app/                          # Backend application package
│       ├── __init__.py
│       ├── main.py                   # FastAPI app instance, CORS middleware, router registration
│       ├── database.py               # SQLAlchemy Engine (pool_pre_ping=True), SessionLocal, Base, get_db()
│       ├── models.py                 # SQLAlchemy ORM table definitions (Meeting model)
│       ├── schemas.py                # Pydantic v2 request/response contracts (MeetingCreate, MeetingRead)
│       └── routers/                  # HTTP route handlers separated from ORM models
│           ├── __init__.py
│           └── meetings.py           # GET /api/meetings and POST /api/meetings endpoints
│
└── frontend/                         # React + Vite + Tailwind + shadcn/ui single-page application
    ├── Dockerfile                    # Builds node:20.17.0-slim image and runs Vite dev server
    ├── package.json                  # Pinned frontend dependencies and npm scripts
    ├── tsconfig.json                 # TypeScript compiler configuration
    ├── vite.config.ts                # Vite configuration (listens on 0.0.0.0:5173)
    ├── tailwind.config.js            # Tailwind CSS theme configuration
    ├── postcss.config.js             # PostCSS configuration for Tailwind
    ├── index.html                    # HTML shell mounting the React app
    └── src/                          # Frontend source code
        ├── main.tsx                  # React DOM entry point
        ├── App.tsx                   # Main page: lists meetings and renders the "Add Meeting" form
        ├── index.css                 # Tailwind CSS directives and shadcn/ui CSS variables
        ├── lib/                      # Shared frontend utilities
        │   ├── api.ts                # Typed fetch wrapper for GET /api/meetings & POST /api/meetings
        │   └── utils.ts              # Tailwind class merger (cn helper for shadcn/ui)
        └── components/               # UI components
            └── ui/                   # Reusable shadcn/ui primitives (Button, Card, Input, Label)
```

---

## 4. Data Model & API Contracts (First Vertical Slice)

### 4.1 Database Table: `meetings`

| Column | SQL Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | Unique identifier of the meeting |
| `title` | `VARCHAR(200)` | `NOT NULL` | Non-empty title of the meeting |
| `starts_at` | `TIMESTAMPTZ` | `NOT NULL` | Start timestamp in UTC (ISO-8601) |
| `ends_at` | `TIMESTAMPTZ` | `NOT NULL` | End timestamp in UTC (`ends_at > starts_at`) |
| `attendee_count` | `INTEGER` | `NOT NULL, CHECK (attendee_count >= 1)` | Number of attendees ($\ge 1$) |

---

### 4.2 HTTP Endpoints & Exact JSON Contracts

Base URL (local development): `http://localhost:8000`
All timestamps use **ISO-8601 UTC format** (`YYYY-MM-DDTHH:MM:SSZ`).

#### 1. `GET /api/meetings` — List all meetings
* **Purpose:** Returns all meetings ordered by `starts_at ASC`.
* **Success Response:** `200 OK` (`application/json`)
```json
[
  {
    "id": 1,
    "title": "Weekly Product Sync",
    "starts_at": "2026-09-29T09:00:00Z",
    "ends_at": "2026-09-29T09:45:00Z",
    "attendee_count": 6
  }
]
```

#### 2. `POST /api/meetings` — Create a new meeting
* **Purpose:** Validates and inserts a new meeting into PostgreSQL and returns the created record.
* **Request Body (`application/json`):**
```json
{
  "title": "Sprint Architecture Review",
  "starts_at": "2026-09-29T14:00:00Z",
  "ends_at": "2026-09-29T15:00:00Z",
  "attendee_count": 4
}
```
* **Validation Rules (enforced by Pydantic `MeetingCreate`):**
  * `title`: string, stripped of whitespace, length `1..200`.
  * `starts_at`: valid ISO-8601 datetime.
  * `ends_at`: valid ISO-8601 datetime; must satisfy `ends_at > starts_at` (otherwise `422 Unprocessable Entity`).
  * `attendee_count`: integer $\ge 1$ (otherwise `422 Unprocessable Entity`).
* **Success Response:** `201 Created` (`application/json`)
```json
{
  "id": 2,
  "title": "Sprint Architecture Review",
  "starts_at": "2026-09-29T14:00:00Z",
  "ends_at": "2026-09-29T15:00:00Z",
  "attendee_count": 4
}
```

---

## 5. Docker Compose Services, Ports, Dependencies & Startup Order
```bash
docker compose up --build
```

| Service Name | Image / Build Context | Host:Container Port | Depends On | Readiness Check & Startup Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **`postgres`** | `postgres:16.4-alpine` | `5432:5432` | None | Runs `pg_isready -U spry -d spry_db` every `3s` (`timeout: 3s`, `retries: 10`). Marked `healthy` only when PostgreSQL accepts TCP connections. |
| **`backend`** | `./backend` (`python:3.12.6-slim`) | `8000:8000` | `postgres` (`condition: service_healthy`) | Waits until `postgres` is `healthy`, then runs `alembic upgrade head` to create/update tables before starting `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`. |
| **`frontend`** | `./frontend` (`node:20.17.0-slim`) | `5173:5173` | `backend` (`condition: service_started`) | Starts Vite dev server (`npm run dev -- --host 0.0.0.0 --port 5173`) calling `http://localhost:8000/api/meetings`. |
