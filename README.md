# SBDMM — 5PL Logistics AI Marketplace Platform

> **Secure-by-design, AI-enabled, multi-tenant 5PL logistics marketplace**
> built on Turborepo · TypeScript · Supabase · OpenAI · Vercel

---

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [Architecture Summary](#architecture-summary)
3. [Repository Structure](#repository-structure)
4. [Quick Start](#quick-start)
5. [Environment Variables](#environment-variables)
6. [Security Model](#security-model)
7. [AI Governance Layer](#ai-governance-layer)
8. [Development Workflow](#development-workflow)
9. [Deployment](#deployment)
10. [Avoid These Mistakes](#avoid-these-mistakes)
11. [Next 10 Build Steps](#next-10-build-steps)

---

## Platform Overview

SBDMM is a **5PL (Fifth-Party Logistics)** platform that orchestrates carriers, vendors, brokers, and compliance engines under a single AI-augmented marketplace. It is built for:

- **Multi-tenant SaaS** — each organization (tenant) is fully isolated at the database, API, and UI level
- **AI-augmented logistics** — route optimisation, risk assessment, and document summarisation powered by OpenAI, with a strict governance proxy
- **Compliance-first trade** — sanctions checks, ESG scoring, customs restrictions, and document requirements enforced as first-class platform rules
- **Zero-trust API security** — every request is verified at the JWT, role, and tenant boundary level, even with Supabase RLS as a second layer

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                       Browser (React)                        │
│   AuthContext → ProtectedRoute → Pages → apiClient          │
│   Supabase anon key ONLY — no secrets ever in browser        │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTPS + Bearer JWT
┌───────────────────────▼─────────────────────────────────────┐
│              Express API (Node.js 20+)                       │
│  requestId → secureHeaders → CORS → rateLimit → auth        │
│  → authorization → validate(Zod) → handler → auditLog       │
│  OpenAI is called ONLY through /api/v1/ai/proxy              │
└───────────────────────┬─────────────────────────────────────┘
                        │ Service Role Key (server only)
┌───────────────────────▼─────────────────────────────────────┐
│           Supabase (Postgres + Auth + RLS + Storage)         │
│   RLS policies enforce tenant isolation at DB layer          │
│   JWT claims → get_my_tenant_id(), get_my_role() helpers     │
└─────────────────────────────────────────────────────────────┘
```

**Key design decisions:**

| Decision | Rationale |
|---|---|
| JWT verified by calling `supabase.auth.getUser()` | Prevents forged JWTs — Supabase signature check, not just claim parsing |
| Role/tenant loaded from `user_profiles` table, not JWT | JWT claims are untrusted for authorization decisions |
| OpenAI called server-side only | API key never in browser bundle; all prompts logged and governed |
| Service role key only on the backend | Browser only holds anon key; RLS is a second enforcement layer |
| `exactOptionalPropertyTypes: true` | Prevents silent `undefined` property assignments |
| Zod `.strict()` on write schemas | Prevents mass assignment attacks |
| HMAC-SHA256 webhook verification | Prevents webhook spoofing from carrier integrations |
| Audit log uses admin client, never JWT | Ensures audit records cannot be tampered by regular users |

---

## Repository Structure

```
sbdmm/
├── apps/
│   ├── api/                     # Express.js backend API
│   │   └── src/
│   │       ├── ai/              # OpenAI governance proxy
│   │       ├── compliance/      # Rules engine
│   │       ├── lib/             # Config, logger, Supabase clients
│   │       ├── middleware/      # Auth, CORS, rate limiting, error handling
│   │       ├── routes/          # auth, health, orders (add more here)
│   │       ├── schemas/         # Zod validation schemas
│   │       ├── services/        # Audit log service
│   │       └── webhooks/        # HMAC webhook verifier
│   │
│   └── web/                     # React + Vite frontend
│       └── src/
│           ├── components/      # ProtectedRoute
│           ├── contexts/        # AuthContext
│           ├── lib/             # apiClient, supabaseClient
│           └── pages/           # Login, Dashboard, Orders, etc.
│
├── packages/
│   └── shared/                  # @sbdmm/shared — types consumed by both apps
│       └── src/index.ts
│
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql   # All tables + triggers
│       └── 002_rls_policies.sql     # Row Level Security + GRANT
│
├── .github/
│   └── workflows/
│       └── security.yml         # CI/CD: lint, typecheck, audit, secret scan, build
│
├── docs/
│   └── architecture.md          # Extended architecture notes
│
├── vercel.json                  # Deployment hardening (headers, rewrites)
├── turbo.json                   # Monorepo build pipeline
└── package.json                 # Workspace root
```

---

## Quick Start

### Prerequisites

- Node.js ≥ 20.0.0
- npm ≥ 10.0.0
- A [Supabase](https://supabase.com) project (free tier works for development)
- An [OpenAI](https://platform.openai.com) API key

### Install

```bash
git clone <repo-url> sbdmm
cd sbdmm
npm install
```

### Configure environment

```bash
# Backend
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your Supabase URL, service role key, OpenAI key, etc.

# Frontend
cp apps/web/.env.example apps/web/.env
# Edit apps/web/.env with your Supabase URL and anon key
```

### Run database migrations

```bash
# Install Supabase CLI if needed
npm install -g supabase

# Link to your project
supabase link --project-ref <your-project-ref>

# Apply migrations
supabase db push
```

### Start development servers

```bash
# Start both API and web in parallel
npm run dev

# Or individually
npm run dev --workspace=apps/api
npm run dev --workspace=apps/web
```

- **API**: http://localhost:3001
- **Web**: http://localhost:5173

---

## Environment Variables

### Backend (`apps/api/.env`)

| Variable | Required | Security Level | Description |
|---|---|---|---|
| `SUPABASE_URL` | ✅ | Public | Supabase project URL |
| `SUPABASE_ANON_KEY` | ✅ | Public | Supabase anon key (safe for server) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | 🔴 SECRET | Bypasses RLS — never in browser |
| `OPENAI_API_KEY` | ✅ | 🔴 SECRET | Server-only — never in browser |
| `CORS_ALLOWED_ORIGINS` | ✅ | Config | Comma-separated allowed origins |
| `JWT_SECRET` | ✅ | 🔴 SECRET | Min 32 chars — used for webhook signing |
| `PORT` | ❌ | Config | Default: 3001 |

### Frontend (`apps/web/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase anon key (safe for browser) |
| `VITE_API_BASE_URL` | ✅ | Backend API URL |

> ⚠️ **Rule**: `VITE_*` prefix = browser-safe. Never add non-`VITE_` vars to the web `.env` — Vite will refuse to embed them.

---

## Security Model

### Authentication Flow

```
1. Browser: supabase.auth.signInWithPassword(email, password)
2. Browser: Receives JWT from Supabase Auth
3. Browser: Attaches JWT as Authorization: Bearer <token> on API calls
4. API middleware: Calls supabase.auth.getUser(token) — NOT jwt.verify()
   └── This verifies the signature AND checks Supabase's revocation list
5. API middleware: Loads user_profiles row for authoritative role + tenant_id
   └── JWT claims for role are NEVER trusted — DB is authoritative
6. Route handler: assertTenantOwnership() on individual resource access
   └── Prevents IDOR (Insecure Direct Object Reference) attacks
7. Supabase: RLS policies enforce tenant isolation at DB layer (second enforcement)
```

### Role Hierarchy

```
super_admin      — Platform-wide access, all tenants
tenant_admin     — Full access within own tenant
logistics_provider — Manage shipments and routes
vendor           — Manage own product listings
buyer            — Create orders, view quotes
```

### Multi-Tenancy Isolation

Every API query filters by `tenant_id` from the authenticated user's profile (server-injected). The Supabase RLS policies enforce this at the database level as a second layer. A tenant can never see another tenant's data even if:
- The API middleware has a bug
- A developer writes a query without a tenant filter

---

## AI Governance Layer

All AI operations go through `/api/v1/ai/proxy`. The browser **never** calls OpenAI directly.

```
Browser → POST /api/v1/ai/proxy
            ↓
    requireAuth + aiRateLimit (20/hr)
            ↓
    Task allowlist check:
    - route_optimization
    - risk_assessment
    - document_summary
    - compliance_query
    - esg_analysis
            ↓
    Role check per task
            ↓
    Model allowlist (gpt-4o, gpt-4o-mini, gpt-4-turbo)
            ↓
    Prompt injection defense:
    - User input wrapped in <data> tags
    - System prompt is server-controlled
    - No raw string concatenation
            ↓
    Token budget cap (configurable per task)
            ↓
    response_format: { type: 'json_object' }
            ↓
    Output validation + audit log
            ↓
    AI NEVER makes authorization or compliance decisions
```

---

## Development Workflow

```bash
# Type check all packages
npm run typecheck

# Lint all packages
npm run lint

# Format code
npx prettier --write .

# Build everything
npm run build

# Run tests
npm test
```

---

## Deployment

### Vercel (Frontend + API Routes)

1. Connect the repository to Vercel
2. Set root directory to `/` (monorepo root)
3. Configure build command: `npx turbo run build`
4. Output directory: `apps/web/dist`
5. Add all environment variables from `apps/web/.env.example` to Vercel project settings
6. The `vercel.json` in the root handles security headers, SPA routing rewrites, and asset caching

### Backend API (Node.js server)

Deploy `apps/api` to Railway, Render, Fly.io, or any Node.js host:

```bash
cd apps/api
npm run build
npm start
```

Set all `apps/api/.env.example` variables as environment secrets on your host.

### Supabase

Apply migrations to production:
```bash
supabase db push --db-url "postgresql://postgres:<password>@<host>:5432/postgres"
```

---

## Avoid These Mistakes

### 🔴 Critical — Do Not Do These

| Mistake | Why It's Dangerous |
|---|---|
| Calling OpenAI from the browser | Exposes your API key; no governance; costs uncontrolled |
| Trusting JWT role/tenant claims for authorization | JWTs can be decoded and modified — always load from DB |
| Using `getAdminClient()` in a user-facing route without asserting ownership | Admin client bypasses RLS — any bug leaks cross-tenant data |
| Storing secrets in `VITE_*` env vars | Vite embeds them in the browser bundle — publicly visible |
| Disabling RLS on any table | Removes the last security layer for that data |
| Using `req.body.tenant_id` for the tenant context | Allows tenants to self-assign to other tenants |
| Logging `req.body` or `req.headers.authorization` | Logs credentials and PII in plaintext |
| Using `Math.random()` for tokens or IDs | Not cryptographically random — predictable |

### 🟡 Architecture Mistakes

| Mistake | Correct Approach |
|---|---|
| Adding business logic to migration files | Keep migrations additive-only; logic belongs in the API |
| Importing from `apps/api` in `apps/web` | Only import from `packages/shared` — never cross-app imports |
| Creating a new DB client per request | Use the singleton pattern in `supabaseAdmin.ts` |
| Adding `super_admin` as an invitable role | Controlled by migration/seed only — never by API invite |
| Putting compliance checks in the frontend | Always enforce on the backend; frontend is UX only |
| Returning raw Supabase errors to the client | Wrap in `AppError` — raw errors reveal schema details |

### 🟢 Performance Pitfalls

| Mistake | Correct Approach |
|---|---|
| Calling `supabase.auth.getUser()` on every request for non-auth operations | Use the cached `req.user` after `requireAuth` middleware |
| N+1 queries in list endpoints | Use `.select()` with joins instead of fetching relations in a loop |
| No pagination on list endpoints | All list routes MUST accept `page` + `limit` params via `paginationSchema` |

---

## Next 10 Build Steps

These are the concrete engineering tasks to make the platform production-ready:

### Step 1 — Vendor Onboarding Route (`apps/api/src/routes/vendors.ts`)
Implement `POST /api/v1/vendors/onboard` using the `vendorOnboardingSchema`. Trigger `evaluateCompliance()` on submission. Write audit log entries for each step.

### Step 2 — Quotes Route (`apps/api/src/routes/quotes.ts`)
CRUD for quote requests. Enforce that only vendors can create quotes, and only buyers assigned to the order can accept/reject them.

### Step 3 — Document Upload (`apps/api/src/routes/documents.ts`)
Use Supabase Storage with signed URLs (not public URLs). Enforce file type allowlist (PDF, JPEG, PNG). Record document metadata in `trade_documents`. Trigger compliance re-evaluation on upload.

### Step 4 — Compliance Trigger Endpoint (`apps/api/src/routes/compliance.ts`)
`POST /api/v1/compliance/evaluate` — calls `evaluateCompliance()`. `GET /api/v1/compliance/results/:orderId` — returns evaluation results. Only `tenant_admin` and `super_admin` may retrieve results cross-order.

### Step 5 — Integration Registry (`apps/api/src/routes/integrations.ts`)
CRUD for API credentials (store only `key_hash`, never raw key). Rate-limit key creation. Provide `POST /api/v1/integrations/test` to validate a saved credential.

### Step 6 — Real-time Notifications (Supabase Realtime)
Add `useRealtimeOrders()` React hook that subscribes to order status changes via Supabase realtime. Filter subscription by tenant at the channel level.

### Step 7 — MFA Enforcement for Privileged Roles
Add middleware that checks `user.mfa_enabled` (from Supabase Auth Factors API) and returns 403 if `tenant_admin` or `super_admin` hasn't enrolled MFA. Add a `/api/v1/auth/mfa-status` endpoint.

### Step 8 — Admin Route (`apps/api/src/routes/admin.ts`)
`GET /api/v1/admin/tenants` — list all tenants (super_admin only). `POST /api/v1/admin/tenants/:id/suspend` — suspend a tenant (writes to audit log). All admin actions require the `requireSuperAdmin` middleware.

### Step 9 — Observability (OpenTelemetry + Sentry)
Add `@opentelemetry/sdk-node` to the API for distributed tracing. Add Sentry for error monitoring in both web and API. Ensure PII/secrets are scrubbed from both before transmission.

### Step 10 — End-to-End Tests (Playwright)
Write Playwright tests for the full auth flow (login → dashboard → signout), the order creation flow, and the role-based access denial scenario. Run these in CI against a seeded Supabase staging instance.
