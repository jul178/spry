# Spry — Step-by-Step Tutorial: How to Fork/Create Repo, Clone to VS Code, Write `PROJECT.md` & Defend in Class

This tutorial walks you from **zero to a running repository**:
1. **Part 0:** How to **Fork (or Create)** the GitHub repository and **Clone it into VS Code** step-by-step.
2. **Part 1:** How to complete **Steps 1–4** (`Decide the shape`, `Write the prompt for PROJECT.md`, `Audit PROJECT.md`, `Generate & run with docker compose up --build`, and push to GitHub).
3. **Part 2:** Complete answers to every **"What we discuss in class"** question.

---

## Part 0: How to Fork / Create the Repo on GitHub & Clone It into VS Code

Depending on whether your instructor gave you a starter repository link or asked you to create a new `spry` repo, follow **Option A (Forking)** or **Option B (New Repository)**:

### Option A — If You Are Forking an Existing Course Repository
1. **Open the Original Repo on GitHub:**
   * Go to the course repository URL in your browser and make sure you are signed in to your GitHub account.
2. **Click "Fork" (Top-Right Corner):**
   * Click the **Fork** button in the top-right corner of the GitHub page.
   * Under **Owner**, select your personal GitHub account.
   * **Repository name:** `spry`
   * **Description (paste this into the Description box):**
     ```text
     Spry — Meeting analytics & deep-work optimization platform (Monorepo: FastAPI, SQLAlchemy/Alembic, React + Vite + Tailwind, PostgreSQL).
     ```
   * Keep **"Copy the `main` branch only"** checked.
   * Click the green **Create fork** button.
   * You now have your own copy at `https://github.com/<your-github-username>/spry`.
3. **Copy Your Fork's Clone URL:**
   * On **your forked repository page** (`<your-github-username>/spry`), click the green **`<> Code`** button.
   * Select **HTTPS** and click the **Copy** icon next to `https://github.com/<your-github-username>/spry.git`.

### Option B — If You Are Creating a Brand-New `spry` Monorepo on GitHub
1. Go to [https://github.com/new](https://github.com/new).
2. Set **Repository name** to `spry`.
3. In the **Description (optional)** field, paste:
   ```text
   Spry — Meeting analytics & deep-work optimization platform (Monorepo: FastAPI, SQLAlchemy/Alembic, React + Vite + Tailwind, PostgreSQL).
   ```
4. Choose **Public** or **Private** (as required by your instructor).
5. Leave **"Add a README file"** unchecked (or checked—either works) and click **Create repository**.
6. Copy the **HTTPS URL**: `https://github.com/<your-github-username>/spry.git`.

---

### Step-by-Step: Clone the Repository into VS Code (or Antigravity IDE)

You can clone into VS Code using either the **Visual UI (Method 1)** or the **Terminal (Method 2)**:

#### Method 1 — Using the VS Code Command Palette (Easiest GUI Way)
1. Open **VS Code**.
2. Press **`Ctrl + Shift + P`** (Windows/Linux) or **`Cmd + Shift + P`** (macOS) to open the **Command Palette**.
3. Type **`Git: Clone`** and press **Enter**.
4. Paste your copied URL (`https://github.com/<your-github-username>/spry.git`) and press **Enter**.
5. A file picker window will open — choose the parent folder on your computer (for example, `c:\ucu_2_year\ooad`) and click **Select as Repository Destination**.
6. When VS Code shows the popup *"Would you like to open the cloned repository?"*, click **Open**.

#### Method 2 — Using the Terminal (If You Already Opened `c:\ucu_2_year\ooad\spry` in VS Code)
If you already have the local folder `c:\ucu_2_year\ooad\spry` open in VS Code (with your architecture files and `PROJECT.md` inside it) and want to connect it to your GitHub repo/fork:

1. Open the integrated terminal in VS Code by pressing **`Ctrl + ` `** (Ctrl + Backtick) or via menu **Terminal $\rightarrow$ New Terminal**.
2. Initialize Git (if not initialized yet) and link it to your GitHub repo:
   ```powershell
   git init
   git branch -M main
   git remote add origin https://github.com/<your-github-username>/spry.git
   ```
   *(If you forked a repo that already has commits on `main`, run `git pull origin main --allow-unrelated-histories` first).*
3. Verify your remote is connected properly:
   ```powershell
   git remote -v
   ```
   You should see:
   ```text
   origin  https://github.com/<your-github-username>/spry.git (fetch)
   origin  https://github.com/<your-github-username>/spry.git (push)
   ```
   *(Optional: If you forked an upstream class repo and want to pull instructor updates later, also add upstream: `git remote add upstream https://github.com/<instructor-org>/<repo>.git`).*

---

## Part 1: Step-by-Step Lab Workflow (`PROJECT.md` $\rightarrow$ Running App)

The core rule of this lab: **Write and verify the structure in `PROJECT.md` first, commit it, and only then let the coding agent generate code from it.**

---

### Step 1 — Decide the Shape: One Repository, Not Three (~15 min)

#### What to Do
Keep everything (`backend/`, `frontend/`, `docker-compose.yml`, and `PROJECT.md`) inside your single `spry/` repository. Write this justification at the top of `PROJECT.md` (already included in your [PROJECT.md](file:///c:/ucu_2_year/ooad/spry/PROJECT.md)).

#### Why We Choose a Monorepo (What to Write & Defend in Class)
1. **Atomic Cross-Stack Changes:** One Git commit changes the Alembic database migration, the SQLAlchemy model, the FastAPI endpoint (`GET/POST /api/meetings`), and the React component that calls it. The backend and frontend can never drift out of sync.
2. **The Repository Is the Agent's Context Window (Key Lecture Concept):**
   * When the whole pipeline lives in one directory tree, an AI coding agent can read the endpoint, the ORM model, the migration, and the React component in a **single pass**.
   * If you split Spry across 3 repositories (`spry-backend`, `spry-frontend`, `spry-infra`), the agent sees only **one-third** of the system and **guesses** the rest—and a guessed API contract is a bug you only discover at integration time.
   * **Trade-off:** A repository boundary buys team independence at the cost of context. For a 4-person startup (`NFR-12`) building a product that does not exist yet, **shared context is worth far more than independence**.

---

### Step 2 — Write the Prompt for `PROJECT.md` (~20 min)

Do **not** ask the AI agent for Python or React code yet. Open the AI chat in VS Code and give it this **Refined Prompt** so it generates only `PROJECT.md`:

```text
Write PROJECT.md for a monorepo called "spry". It must describe the structure of the repository only: folders, what lives in each one, and the exact contracts between parts. No implementation code.

1. Architectural Decision:
- State why Spry is built as a single monorepo (atomic cross-stack commits + the repository is the agent's context window).

2. Layout:
- backend/: FastAPI, SQLAlchemy 2.0 as the ORM, Alembic for migrations (structured into app/main.py, app/database.py, app/models.py, app/schemas.py, app/routers/meetings.py, and alembic/).
- frontend/: React + TypeScript + Vite, Tailwind CSS, shadcn/ui components (structured into src/App.tsx, src/lib/api.ts, src/components/ui/).
- docker-compose.yml at the root: postgres, backend, frontend — `docker compose up --build` is the only command a new developer runs after installing Docker Desktop.

3. Scope of the First Slice:
- Backend exposes ONLY `GET /api/meetings` (list ordered by starts_at ASC) and `POST /api/meetings` (create one).
- A meeting has ONLY: `id` (int PK), `title` (string, 1..200 chars), `starts_at` (ISO-8601 UTC datetime), `ends_at` (ISO-8601 UTC datetime > starts_at), `attendee_count` (int >= 1).
- Include exact JSON request/response examples and HTTP status codes (200, 201, 422).
- Frontend has one page that lists meetings and a form that adds a new one.

4. Rules:
- For every folder state what it is for.
- For every service in compose state which port it listens on (`5432`, `8000`, `5173`), what it depends on, and how it knows the dependency is ready (`pg_isready` healthcheck + `condition: service_healthy`, running `alembic upgrade head` before `uvicorn`).
- Pin exact versions (`postgres:16.4-alpine`, `python:3.12.6-slim`, `node:20.17.0-slim`). Never use `:latest`.
- Add nothing that is not listed above (no Redis, no Celery, no Nginx, no Kubernetes).
```

*(Note: A complete, ready-to-use [PROJECT.md](file:///c:/ucu_2_year/ooad/spry/PROJECT.md) has already been created in your `c:\ucu_2_year\ooad\spry\PROJECT.md` folder!)*

---

### Step 3 — Read & Review `PROJECT.md` Line by Line (~20 min)

Open [PROJECT.md](file:///c:/ucu_2_year/ooad/spry/PROJECT.md) in VS Code and audit it as a human reviewer **before** generating any code:

1. **Every folder has a stated purpose:**
   * Check that `backend/alembic/`, `backend/app/routers/`, `frontend/src/lib/`, and `frontend/src/components/ui/` each have a clear 1-line description.
2. **Nothing extra crept in:**
   * Verify there is **no** Redis, Celery, RabbitMQ, Nginx, or second database.
   * If the model added anything extra, delete those lines in VS Code and explain why in your commit message!
3. **The contract is concrete:**
   * `GET /api/meetings` specifies field names (`id`, `title`, `starts_at`, `ends_at`, `attendee_count`), types (`int`, `str`, `ISO-8601 UTC`), and status code (`200 OK`).
   * `POST /api/meetings` specifies validation rules (`ends_at > starts_at`, `attendee_count >= 1`) and returns `201 Created`.
4. **Versions are pinned:**
   * `postgres:16.4-alpine`, `python:3.12.6-slim`, `node:20.17.0-slim` (not `:latest`).
5. **Startup & migration order is explicit:**
   * `postgres` runs `pg_isready`; `backend` waits for `condition: service_healthy`, runs `alembic upgrade head`, and then starts `uvicorn`.

#### Commit `PROJECT.md` First!
Run this in your VS Code terminal so your Git history proves you wrote and reviewed the specification **before** generating code:
```powershell
git add PROJECT.md
git commit -m "docs: add PROJECT.md monorepo specification and API contracts for first slice"
git push -u origin main
```

---

### Step 4 — Generate the Project from `PROJECT.md` & Run It (~30 min)

#### 1. Ask the Agent to Generate the Repository from `PROJECT.md`
In your VS Code AI chat, run this prompt:
```text
Generate the repository exactly as described in PROJECT.md.
Do not add any extra services, folders, or endpoints not listed in PROJECT.md, and use Alembic migrations (never Base.metadata.create_all()).
```

#### 2. Review the Diff in VS Code
Click the **Source Control** icon on the left sidebar of VS Code (`Ctrl + Shift + G`) and inspect the generated files (`docker-compose.yml`, `backend/Dockerfile`, `backend/alembic/versions/0001_create_meetings_table.py`, `backend/app/routers/meetings.py`, `frontend/src/App.tsx`).

#### 3. Run the Stack with Docker Compose
Make sure **Docker Desktop** is running, then run in the VS Code terminal:
```powershell
docker compose up --build
```
* What happens on startup:
  1. Docker builds `backend` (`python:3.12.6-slim`) and `frontend` (`node:20.17.0-slim`) and pulls `postgres:16.4-alpine`.
  2. `postgres` starts on `:5432` and runs `pg_isready` until it reports `healthy`.
  3. `backend` sees `postgres` is `healthy`, runs `alembic upgrade head` (creating the `meetings` table), and starts FastAPI on `http://localhost:8000`.
  4. `frontend` starts Vite on `http://localhost:5173`.

#### 4. Test the Full Chain & Match the Spry UI Screenshot
1. Open **`http://localhost:5173`** in your browser.
2. Add a meeting using the form and click **Submit / Add Meeting**.
3. **Reload the page (`F5`)** — the meeting is still there because it went through **React $\rightarrow$ FastAPI $\rightarrow$ SQLAlchemy $\rightarrow$ PostgreSQL** and back!
4. **Match the Lab 1 Spry Screenshot:** Attach the Spry dashboard screenshot from the Lab 1 brief to the AI chat and prompt:
   ```text
   Match this screenshot for the styling in frontend/src/App.tsx:
   align layout, card spacing, typography, summary metric cards, and colors with the Spry dashboard reference while keeping the exact GET/POST /api/meetings contract.
   ```
5. Commit and push the working slice to GitHub:
   ```powershell
   git add .
   git commit -m "feat: generate first vertical slice (FastAPI + SQLAlchemy/Alembic + React/Vite + Docker Compose)"
   git push
   ```

---

## Part 2: Complete Answers to "What We Discuss in Class" (Defense Cheat Sheet)

---

### A. The Compose File (`docker-compose.yml`)

#### 1. Read `docker-compose.yml` line by line: what does each key do, and which lines are for **development only** (and would be wrong in production)?
* **What each key does:**
  * **`image:`** Uses a pre-built image from Docker Hub (e.g., `postgres:16.4-alpine`).
  * **`build:`** Builds a custom container image from a local `Dockerfile` (`./backend` or `./frontend`).
  * **`ports: ["8000:8000"]`** Binds a port on your **host laptop** (`HOST:CONTAINER`) so your browser can access `localhost:8000`.
  * **`expose: ["8000"]`** Opens a port **only inside the internal Docker network** (container-to-container) without exposing it to the host machine.
  * **`environment:`** Passes configuration variables (`DATABASE_URL`, `POSTGRES_PASSWORD`) into the container.
  * **`volumes:`** Mounts persistent storage (`postgres_data:/var/lib/postgresql/data`) or live source code bind mounts (`./backend:/app`).
  * **`command:`** Overrides the container startup command (`alembic upgrade head && uvicorn ... --reload`).
* **Which lines are DEV-ONLY (and wrong in our AWS Production Architecture)?**
  1. **Bind mounts (`./backend:/app`, `./frontend:/app`):** Great for live code editing in dev, but in production (**AWS Lambda + ECR**), code must be baked into an immutable, versioned container image so rollbacks take $<5\text{ min}$ (`NFR-11`).
  2. **Dev servers (`uvicorn --reload` and `npm run dev`):** `--reload` watches files and wastes CPU/memory, and `npm run dev` serves unminified code. In production, the frontend is compiled (`npm run build`) and deployed as static files to **Amazon S3 + CloudFront**, and FastAPI runs without `--reload` on **AWS Lambda**.
  3. **Exposing DB port (`5432:5432`) & hardcoded passwords (`POSTGRES_PASSWORD=spry`):** In production, **Aurora PostgreSQL Serverless v2** sits inside **Private Subnets** with no public IP (`NFR-6`), and secrets are managed via **AWS KMS** / IAM.

---

#### 2. How does a service wait for another one (`depends_on` + `healthcheck`), and what does your backend do if the database disappears **later** when no Compose feature can help you?
* **Startup waiting (`healthcheck` + `condition: service_healthy`):**
  * Plain `depends_on: [postgres]` only waits for the Postgres container to **start**, not for the database server inside it to finish initializing and accept TCP connections.
  * We add a `healthcheck` to `postgres` (`pg_isready -U spry -d spry_db`) and set `depends_on: postgres: condition: service_healthy` on `backend`. Now `backend` waits until Postgres actually answers queries before running `alembic upgrade head`.
* **What happens if the database disappears LATER at runtime?**
  * Compose `depends_on` only acts at container boot. If the DB drops connections or restarts hours later:
    1. **SQLAlchemy `pool_pre_ping=True`:** Before handing an idle connection from the pool to a request, SQLAlchemy sends a fast `SELECT 1` ping. If the connection died while the DB restarted, SQLAlchemy discards the dead socket and opens a new connection transparently.
    2. **Graceful HTTP `503 Service Unavailable`:** If the DB is still down, the backend catches `OperationalError` and returns `503` without crashing the FastAPI worker process, so traffic recovers automatically the second the DB comes back.
    3. **In Production (`Amazon SQS`):** Background calendar sync and analytics jobs sit safely in **SQS (`sync-q`, `analytics-q`, `notify-q`)** and retry automatically (`NFR-5`).

---

#### 3. Why do you have one `docker-compose.yml` and a `Dockerfile` per service? Which one survives a move to ECS / Lambda / Cloud Run, and which one is replaced?
* **What each file answers:**
  * **`Dockerfile` (per service):** Answers *"How is this single service built and packaged?"* (OS image, system libs, `pip install` / `npm ci`, working directory, entrypoint).
  * **`docker-compose.yml` (one at root):** Answers *"How do these separate containers run and talk to each other on one local machine?"* (virtual network, local ports, local DB volume, startup order).
* **Which one survives moving to the cloud?**
  * **The `Dockerfile` SURVIVES:** In our CI/CD pipeline (`GitHub Actions`), we build `backend/Dockerfile` and push the image to **`Amazon ECR`** to run on **`AWS Lambda`** (or **`ECS Fargate`** at Year-3 scale, `NFR-2`).
  * **`docker-compose.yml` IS REPLACED:** Cloud environments replace `docker-compose.yml` with managed cloud services (**Aurora PostgreSQL** replaces the `postgres` container, **Lambda Function URL** runs the backend, and **S3 + CloudFront** serves the built frontend).

---

#### 4. What is a base image? Compare `python:3.12`, `python:3.12-slim`, and `python:3.12-alpine`.
* **Base image:** The foundational OS filesystem (`FROM ...`) containing the Linux C library, tools, and Python runtime.
* **Comparison:**
  * **`python:3.12` (Full Debian, ~1 GB):** Contains compilers (`gcc`), Git, and hundreds of OS libraries. Too slow to push/pull from `ECR` and carries hundreds of unnecessary OS security vulnerabilities (CVEs).
  * **`python:3.12-slim` (Minimal Debian + `glibc`, ~130 MB — Our Choice):** Removes compilers and bloat while keeping standard **`glibc`**. Precompiled Python binary wheels (`manylinux` wheels for `psycopg`, `pydantic-core`, `sqlalchemy`) install in seconds, keeping both build time and image size small.
  * **`python:3.12-alpine` (Alpine Linux + `musl libc`, ~50 MB):** Smallest base layer, **but uses `musl libc` instead of `glibc`**. Because Python binary wheels target `glibc`, Alpine often forces `pip` to install `gcc`/`rust` and compile C/Rust extensions from source—making builds **$5\times$ slower** and often inflating the final image right back up.

---

### B. The Backend (`backend/`)

#### 5. What is the structure of `backend/` — where do the HTTP layer, the models, and the business logic live, and why not put them all in one file?
* **Structure:**
  * `app/routers/meetings.py` $\rightarrow$ **HTTP layer** (routes, status codes, query/path params).
  * `app/schemas.py` $\rightarrow$ **API Contract layer** (Pydantic request/response validation).
  * `app/models.py` $\rightarrow$ **ORM / Database layer** (SQLAlchemy `Meeting` table mapping).
  * `app/database.py` $\rightarrow$ **DB connection layer** (`engine` with `pool_pre_ping=True`, `SessionLocal`, `get_db()`).
* **Why not put everything in one file?**
  1. **Security & Privacy (`NFR-6`, `NFR-7`):** Database rows contain internal fields (`org_id`, tokens, sync state) that must never automatically leak into public API JSON responses. Separating `schemas.py` (what the API returns) from `models.py` (what the DB stores) enforces a strict boundary.
  2. **Code Reuse by Background Workers:** In our Spry architecture, the **Calendar Sync Worker** and **Analytics Worker** need `models.py` and `database.py` to read/write Aurora, but they do not run HTTP endpoints (`routers/`).
  3. **Clean Context for Engineers & Coding Agents (`NFR-10`):** Small, single-responsibility files prevent Git merge conflicts across a 4-person team.

---

#### 6. What is SQLAlchemy for? What do you gain over writing raw SQL, and what do you lose when a query gets interesting?
* **What you gain:**
  1. Maps relational rows directly to typed Python objects (`meeting.title`) with autocompletion.
  2. Automatic parameterized queries that prevent SQL injection (`NFR-6`).
  3. Built-in connection pooling (`pool_pre_ping=True`) and transaction management.
  4. Schema metadata (`Base.metadata`) that Alembic uses to generate migrations.
* **What you lose when a query gets interesting:**
  1. **Hidden $N+1$ Queries:** Lazy-loading relationships inside loops can silently execute dozens of extra SQL queries.
  2. **Complex Analytics Overhead:** Expressing multi-week window functions, overlapping interval merges, and timezone working-hour clipping (`FR-8`, `FR-11`) in pure ORM syntax is clunky and harder to tune than explicit SQL or dedicated Python batch calculation in our **Analytics Worker**.

---

#### 7. What is Alembic for, why NOT `Base.metadata.create_all()`, and when does the migration run in your Compose setup?
* **Why NOT `Base.metadata.create_all()`?**
  * `create_all()` only creates tables that **do not exist yet**. Once the `meetings` table exists in production with real customer rows, if you add a new column to `models.py` (e.g., `has_agenda`), `create_all()` **does nothing**—it cannot `ALTER TABLE`, migrate existing data, or roll back (`downgrade`).
* **What Alembic does:**
  * Alembic provides **versioned, reviewable, reversible schema migrations** (`upgrade()` and `downgrade()` scripts in `backend/alembic/versions/`) tracked in the database's `alembic_version` table.
* **When does the migration run?**
  * **In our Compose setup:** At **`backend` container startup** (`alembic upgrade head && uvicorn ...`), immediately after `postgres` passes its `pg_isready` healthcheck.
  * **Why NOT at build time (`Dockerfile`)?** Because during `docker build`, the database container does not exist and is not reachable!
