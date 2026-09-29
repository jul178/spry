# Spry — System Architecture (Short & Easy-to-Explain Version)

---

## 0. Assumptions & Scope (What the Brief Leaves Open)

* **Cloud & GDPR Region (`NFR-7`, `NFR-8`):** Deployed on **AWS `eu-central-1` (Frankfurt)** so all EU data stays in the EU. **Rejected GCP** because AWS offers `Cognito` (free up to 50k MAUs), `Aurora Serverless v2`, `SQS`, and `SES` with lower cost and zero ops (`NFR-12`).
* **Architecture Style (`NFR-2`, `NFR-10`):** **Modular Monolith API + Async Queue Workers** in one GitHub monorepo. **Rejected Microservices** (too complex for 4 engineers in 4 months, `NFR-12`) and **Synchronous Monolith** (would crash on Monday $5\times$ sync spikes, `NFR-1`).
* **Personal Data & GDPR Retention (`NFR-7`, `FR-24`):**
  * **Past events:** Never store event titles, descriptions, or attendee emails — only structural metadata (`start_utc`, `end_utc`, `attendee_count`, boolean `has_agenda`, `type`).
  * **Upcoming 7 days (`FR-17`–`FR-19`):** Cache KMS-encrypted titles/descriptions *only* for the next 7 days so users can see meetings without agendas and add them. Stripped automatically once the meeting ends.
  * **Deletion (`FR-24`):** Account/org deletion revokes OAuth tokens immediately and purges all DB/backup data within **$\le 30\text{ days}$**.
* **Deep-Work Math (`FR-8`, `FR-9`, `FR-14`):** Clipped to each member's local timezone and working hours (default `09:00–17:00`). Overlapping meetings are merged first. **Insight deep-work (`FR-9`)** = contiguous free/focus blocks $\ge 60\text{ min}$. **Proposed slots (`FR-14`)** = free blocks $\ge 120\text{ min}$.
* **Where the "Google-ness" Lives (`Section 5`):** Isolated inside a `GoogleCalendarAdapter` behind a `CalendarProvider` interface. Database and `Analytics Worker` use normalized events, so **Microsoft 365** can be added later by writing one adapter without touching analytics (`NFR-10`).
* **Stretch Goals Deferred to "Later" (`Section 5` — 4 Engineers × 4 Months Budget):**
  * `FR-1` (Email/password login) $\rightarrow$ toggle later in Cognito.
  * `FR-13` (Meeting cost) $\rightarrow$ add an `org_admin`-only rate table later.
  * `FR-20` (LLM agenda draft) $\rightarrow$ add later via Amazon Bedrock with a $5\text{ s}$ timeout fallback to a manual template.
* **Team Split (`NFR-12` — 4 Engineers, 0 Ops):** **Eng 1:** React Frontend; **Eng 2:** FastAPI, Cognito Auth, PostgreSQL RLS & Admin; **Eng 3:** Google Calendar Sync & Webhooks; **Eng 4:** Analytics Worker, Scheduler/SES & AWS CI/CD.

---

## 1. Context Diagram (C4 Level 1) & External Integrations

![C4 Level 1 System Context Diagram](C:/Users/Dell/.gemini/antigravity/brain/b0e3b765-799a-477f-97fe-d506649657f8/spry_c4_context_diagram.png)

### External Systems

1. **Amazon Cognito + Google Workspace (Identity Provider)**
   * **Responsibility:** Signs users in with their corporate Google account (`FR-1`), verifies the company email domain to create/join an organisation (`FR-2`), and issues JWTs to the frontend.
   * **Technology:** Amazon Cognito User Pool federated with Google Workspace (`OAuth 2.0 / OIDC`).
   * **Forces it:** `FR-1`, `FR-2`, `NFR-6`, `Section 5` (managed auth + ready for Microsoft 365).
   * **Trade-off & Rejected:** Free up to 50,000 MAUs (`NFR-1`). **Rejected Auth0/Okta** (too expensive for `NFR-8` $\le \$0.15/\text{user}$) and **custom OAuth code** (wastes engineering time, `NFR-12`).

2. **Google Calendar API**
   * **Responsibility:** Pushes event change webhooks (`FR-6`), serves incremental event deltas (`syncToken`), creates/tracks deep-work blocks (`FR-15`, `FR-16`), and writes agendas (`FR-19`).
   * **Technology:** Google Calendar REST API + Push Notifications (`events.watch`).
   * **Forces it:** `FR-5`–`FR-7`, `FR-15`–`FR-19`, `NFR-4` ($\le 5\text{ min}$ freshness), `NFR-5`.
   * **Trade-off & Rejected:** Subject to rate limits and 7-day webhook expiry (handled by SQS retries + scheduled renewal). **Rejected polling-only** because polling 50k calendars every 5 min would hit Google quota limits.

3. **Amazon SES**
   * **Responsibility:** Sends Monday morning weekly digests (`FR-21`), 24h no-agenda alerts (`FR-22`), and org invites (`FR-2`).
   * **Technology:** Amazon Simple Email Service (`SES`).
   * **Forces it:** `FR-21`, `FR-22`, `NFR-8`.
   * **Trade-off & Rejected:** Costs $\$0.10 / 1,000$ emails ($\sim \$25/\text{mo}$). **Rejected Mailchimp** (marketing tool, not transactional) and **SendGrid** (more expensive for simple emails).

---

## 2. Container Diagram (C4 Level 2) & Spry Components

![C4 Level 2 Spry AWS Architecture Diagram](C:/Users/Dell/.gemini/antigravity/brain/b0e3b765-799a-477f-97fe-d506649657f8/spry_architecture_diagram_v3.png)

### Spry Containers (Inside AWS `eu-central-1`)

1. **Web Frontend + S3 + CloudFront (`static frontend only, single origin: S3`)**
   * **Responsibility:** Serves the static React SPA (`Home`, `Deep Work`, `Agenda Readiness`, `Admin/Settings`) from edge cache (`static files` from `S3` single origin).
   * **Technology:** React + Vite + Tailwind + shadcn/ui hosted on private **Amazon S3** behind **Amazon CloudFront CDN** (`single origin: S3`).
   * **How it scales:** CDN edge caching handles 50k to 500k users (`NFR-2`) with zero frontend servers.
   * **Forces it:** `FR-3`, `FR-9`–`FR-19`; `NFR-3` ($<2\text{ s p95}$ Home load), `NFR-5` ($99.9\%$ uptime), `NFR-8`.
   * **Trade-off & Rejected:** Needs cache invalidation on deploy. **Rejected Django SSR templates / EC2 servers** because interactive widget updates (`FR-15`, `FR-19`) are faster in React and static S3 hosting costs almost $\$0$.

2. **Backend API (`AWS Lambda (FastAPI) · Function URL, warm concurrency`)**
   * **Responsibility:** Receives direct HTTPS API calls from the browser via **AWS Lambda Function URL** (`Bearer token`), verifies Cognito JWTs, enforces tenant/role checks (`FR-3`, `FR-4`), reads precomputed insights (`<300 ms p95`), reserves deep-work blocks (`FR-15`), writes agendas (`FR-19`), handles CSV export/deletion/audit logs (`FR-23`–`FR-25`), and receives Google webhooks by enqueuing to SQS.
   * **Technology:** **FastAPI (Python)** running as a container on **AWS Lambda** exposed via **Lambda Function URL** (CORS + TLS) with **2 Provisioned Concurrency warm instances**.
   * **How it scales:** Auto-scales concurrent executions on traffic spikes (`NFR-1`); can move the exact same Docker image to **ECS Fargate** at Year-3 scale (`NFR-2`) without code changes.
   * **Forces it:** `FR-2`–`FR-19`, `FR-23`–`FR-25`; `NFR-2`, `NFR-3` ($<300\text{ ms p95}$), `NFR-8`, `NFR-12`.
   * **Trade-off & Rejected:** **Lambda Function URL** is free and avoids API Gateway/CloudFront proxy hops; Provisioned Concurrency ($\sim \$25/\text{mo}$) eliminates cold starts so API latency stays $<300\text{ ms}$ (`NFR-3`). **Rejected Django** (heavy unused features) and **Kubernetes/EKS** (no ops engineer, `NFR-12`).

3. **Main Database (`Aurora PostgreSQL Serverless v2` + `AWS KMS`, Direct `:5432` Connection)**
   * **Responsibility:** Stores orgs, users, teams, KMS-encrypted OAuth tokens, minimal event metadata, precomputed weekly insights (current + 12 weeks), and audit logs.
   * **Technology:** **Aurora PostgreSQL Serverless v2** in private subnets (no RDS Proxy — API and Worker Lambdas connect directly on `:5432`), using **PostgreSQL Row-Level Security (`RLS`)** on `org_id`.
   * **How it scales:** Auto-scales ACUs (`0.5–8 ACU`, supporting up to $\sim 1,600$ direct PostgreSQL connections) on Monday bursts (`NFR-1`); SQS `MaxConcurrency` caps total concurrent Worker/API Lambdas ($\le 170$ total) and warm Lambda containers reuse their TCP database connections across invocations.
   * **Forces it:** `FR-2`–`FR-4`, `FR-8`–`FR-12`, `FR-23`–`FR-25`; `NFR-6` (RLS tenant isolation + KMS token encryption), `NFR-7` (EU region), `NFR-8` (cost efficiency).
   * **Trade-off & Rejected:** Connecting directly to Aurora (`:5432`) with bounded Lambda concurrency saves the fixed cost of RDS Proxy while staying well below Aurora's connection ceiling. **Rejected DynamoDB/MongoDB** because 12-week team/org aggregations (`FR-10`, `FR-11`), CSV exports (`FR-23`), and database-enforced **Row-Level Security (`RLS`)** (`NFR-6`) require a relational SQL database.

4. **Background Job Queues (`Amazon SQS` — 3 Queues + DLQ)**
   * **Responsibility:** Buffers work across **`sync-q`** (calendar sync), **`analytics-q`** (metric recomputation), and **`notify-q`** (emails), plus **Dead-Letter Queues (`DLQ`)** so failed jobs are never lost (`NFR-5`).
   * **Technology:** Amazon SQS.
   * **How it scales:** Absorbs Monday $5\times$ spikes ($2\text{M changes/day}$, `NFR-1`) and throttles Lambda concurrency so workers never overload Aurora or Google APIs.
   * **Forces it:** `NFR-1`, `NFR-2`, `NFR-4`, `NFR-5`.
   * **Trade-off & Rejected:** Workers must be idempotent (`UPSERT`). **Rejected Kafka / RabbitMQ** because Spry needs simple durable job queuing ($<\$15/\text{mo}$), not a $\$200+/\text{mo}$ broker cluster (`NFR-8`, `NFR-12`).

5. **Calendar Sync Worker**
   * **Responsibility:** Consumes `sync-q`, fetches changed events from Google Calendar via `syncToken`, updates minimal event data in PostgreSQL (`:5432`), and enqueues a job to `analytics-q`.
   * **Technology:** AWS Lambda worker (Python).
   * **How it scales:** Scales concurrently with `sync-q` depth (`MaxConcurrency = 50`).
   * **Forces it:** `FR-5`, `FR-6`, `FR-16`; `NFR-1`, `NFR-4`, `NFR-10`.
   * **Trade-off & Rejected:** Separated from `Analytics Worker` so an engineer can add a new insight in 1 week without touching Google sync code (`NFR-10`).

6. **Analytics Worker**
   * **Responsibility:** Consumes `analytics-q`, classifies events (`FR-7`), applies member working hours/timezone (`FR-8`), and precomputes member metrics (`FR-9`), free deep-work slots (`FR-14`), team load (`FR-10`), and 12-week org trends (`FR-11`), writing directly to Aurora (`:5432`).
   * **Technology:** AWS Lambda worker (Python).
   * **How it scales:** Scales to `MaxConcurrency = 100`, finishing each member-week calculation in $<80\text{ ms}$ so freshness is $\le 5\text{ min p95}$ (`NFR-4`).
   * **Forces it:** `FR-7`–`FR-12`, `FR-14`; `NFR-3`, `NFR-4`, `NFR-10`.
   * **Trade-off & Rejected:** Brief eventual consistency (seconds). **Rejected computing metrics live inside `GET /api/home`** because scanning 12 weeks of events live would violate `<300 ms p95` API latency (`NFR-3`).

7. **EventBridge Scheduler + Notification Worker**
   * **Responsibility:** Triggers (1) Monday 8am local-timezone digests (`FR-21`), (2) 24h no-agenda reminders (`FR-22`), and (3) 4-minute fallback calendar polling & webhook renewal (`FR-6`), sending emails via `SES`.
   * **Technology:** Amazon EventBridge Scheduler + AWS Lambda.
   * **Forces it:** `FR-6` (fallback poll), `FR-8`, `FR-21`, `FR-22`.
   * **Trade-off & Rejected:** **Rejected a self-hosted cron server on EC2** (single point of failure and extra ops, `NFR-5`, `NFR-12`).

8. **Observability (`CloudWatch`) & CI/CD (`GitHub Actions` + `ECR`)**
   * **Responsibility:** `CloudWatch` traces every sync and recomputation per `org_id` and alerts if freshness ($>5\text{ min}$) is breached for $>15\text{ min}$ (`NFR-9`). `GitHub Actions` runs RLS security tests, deploys static files to S3/CloudFront, and pushes container versions to `ECR`/Lambda (`<30 min` deploy, `<5 min` alias rollback, `NFR-11`).
   * **Trade-off & Rejected:** **Rejected Prometheus/Grafana & Jenkins** because self-hosting them requires an ops engineer (`NFR-12`).

### Cost Check (`NFR-8`: Must be $\le \$0.15$ / active member / month)
At Year-1 scale (**50,000 members**, budget ceiling $= 50,000 \times \$0.15 = \mathbf{\$7,500/\text{mo}}$):
* Aurora Serverless v2 ($\sim \$175$, direct connection, no RDS Proxy) + Lambda Function URL & Workers ($\sim \$145$) + NAT/VPC ($\sim \$68$) + CloudWatch/KMS/ECR ($\sim \$85$) + S3/CloudFront/SQS/SES/Cognito ($\sim \$116$) $= \mathbf{\approx \$589/\text{month total}}$.
* **$\$589 \div 50,000\text{ members} = \mathbf{\$0.0118 / \text{member / month}}$** ($12\times$ cheaper than the $\$0.15$ limit).

---

## 3. Component Interactions (Quick Summary)

1. **Users (Browser) $\rightarrow$ CloudFront $\rightarrow$ S3 (`static files`):** Loads the static React SPA from `S3` (`single origin: S3`).
2. **Users (Browser) $\rightarrow$ Backend API (`HTTPS, Function URL (Bearer token)`):** Browser sends direct HTTPS API requests with the Cognito `Bearer token` to the `Backend API` Lambda Function URL (no `/api/*` routing through CloudFront).
3. **Users (Browser) $\leftrightarrow$ Cognito $\leftrightarrow$ Google Workspace:** OAuth 2.0 sign-in from the browser to Cognito, which federates with Google Workspace, verifies corporate domain (`FR-2`), and issues JWTs; `Backend API` verifies JWTs via `JWKS verify`.
4. **Google Calendar $\rightarrow$ Backend API $\rightarrow$ `sync-q`:** Push webhook hits FastAPI Function URL, which immediately enqueues a job in `sync-q` and returns `200 OK`.
5. **`sync-q` $\rightarrow$ Calendar Sync Worker $\rightarrow$ `analytics-q` $\rightarrow$ Analytics Worker:** Sync Worker pulls delta changes from Google Calendar via `NAT Gateway`, saves minimal metadata directly in `Aurora PostgreSQL` (`:5432`), and triggers `Analytics Worker` to update precomputed insights in `Aurora` (`:5432`).
6. **EventBridge $\rightarrow$ `notify-q` $\rightarrow$ Notification Worker $\rightarrow$ SES:** Sends Monday digests and 24h agenda reminders; also triggers 4-min fallback polling.

---

## 4. End-to-End Scenario: Member Moves a Meeting ($\le 5\text{ min p95}$)

1. **Move:** Member moves a meeting in Google Calendar.
2. **Webhook (`~2 s`):** Google pushes a webhook notification to FastAPI (`/api/webhooks/google`).
3. **Queue (`~2.1 s`):** FastAPI validates the header and puts a job into **`SQS (sync-q)`** (never syncs inline).
4. **Sync (`~4 s`):** **`Calendar Sync Worker`** reads `sync-q`, decrypts the member's KMS OAuth token, fetches the changed event delta from **Google Calendar API**, and updates `start_utc`/`end_utc` in **Aurora PostgreSQL**.
5. **Trigger (`~5 s`):** `Calendar Sync Worker` pushes a `(member_id, week)` job into **`SQS (analytics-q)`**.
6. **Recompute (`~8 s`):** **`Analytics Worker`** recomputes meeting hours, deep-work time, free slots, and team/org aggregates, saving ready-to-read results in **Aurora PostgreSQL**.
7. **Monitor:** **CloudWatch** logs the trace per `org_id` and checks that total lag is $\le 5\text{ min}$ (`NFR-4`, `NFR-9`).
8. **Read (`<300 ms`):** When the user views `Home`, **FastAPI** reads the precomputed row from Aurora in $<40\text{ ms}$ (`NFR-3`) and React updates the UI (`<2 s`).
