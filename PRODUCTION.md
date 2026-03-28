# SBDMM — Production Launch Checklist

Use this checklist before going live. Tick each item only after verifying it in your actual environment.

---

## 🔴 Critical — Must complete before launch

### Database

- [ ] Run all 4 migrations against your production Supabase project:
  ```bash
  supabase db push --db-url "$PROD_SUPABASE_DB_URL"
  ```
- [ ] Verify table names: `compliance_results` and `integrations` (not the old names)
- [ ] Confirm RLS is **ON** for every table (`SELECT tablename FROM pg_tables WHERE schemaname='public'` then `\d+ tablename`)
- [ ] Enable the `pg_cron` extension if you want automatic notification cleanup (migration 004)
- [ ] Set `supabase_realtime` publication to only stream: `orders`, `notifications`, `quotes`

### Authentication

- [ ] Enable **email OTP** or **TOTP** in Supabase Auth → MFA settings
- [ ] Set `mfa_required = true` for all `tenant_admin` and `super_admin` users in `user_profiles`
- [ ] Configure email templates (invite, password reset) in Supabase Auth → Email Templates
- [ ] Set `SITE_URL` and `REDIRECT_URLS` in Supabase Auth settings to your production domain

### Secrets

- [ ] Rotate all secrets from `.env.example` — never reuse dev values in production
- [ ] Store secrets in a secrets manager (Doppler, AWS Secrets Manager, or GitHub Actions secrets)
- [ ] Ensure `SUPABASE_SERVICE_ROLE_KEY` is **never** exposed to the browser
- [ ] Ensure `OPENAI_API_KEY` is **never** exposed to the browser
- [ ] Confirm `WEBHOOK_SECRET` is set and matches your integration partner's configuration

### Infrastructure

- [ ] Configure a reverse proxy (nginx / Caddy / CloudFront) with:
  - TLS 1.2+ enforced
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `Content-Security-Policy` header
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - Rate limiting on `/api/v1/auth` endpoints
- [ ] Deploy API behind the proxy — never expose it directly on port 3001
- [ ] Configure health check and readiness check on your load balancer to hit `/health` and `/ready`

### Storage

- [ ] Create `trade-documents` bucket in Supabase Storage Dashboard
- [ ] Confirm bucket is **private** (not publicly accessible)
- [ ] Enable virus scanning on the bucket (requires a Supabase Storage webhook + external scanner)

---

## 🟠 Important — Complete within week 1

### Monitoring

- [ ] Configure Sentry DSN in production environment variables
- [ ] Set `SENTRY_TRACES_SAMPLE_RATE=0.1` in production (1.0 is too high for prod traffic)
- [ ] Set up Sentry alerts for:
  - Error rate spike
  - P95 response time > 2s
  - 5xx error ratio > 1%
- [ ] Configure OpenTelemetry exporter (Jaeger / Grafana Tempo / Honeycomb) if desired
- [ ] Set up uptime monitoring (Better Uptime / PagerDuty) on `/health`

### Performance

- [ ] Run EXPLAIN ANALYZE on the most common queries from your routes
- [ ] Confirm `pg_stat_statements` is enabled in Supabase (Dashboard → Database → Query Performance)
- [ ] Enable Supabase connection pooling (Supavisor) for production API pods

### CI/CD

- [ ] Add all required GitHub Actions secrets (see `.github/workflows/ci.yml` and `deploy.yml`)
- [ ] Set `TURBO_TOKEN` and `TURBO_TEAM` for remote Turborepo caching (optional but recommended)
- [ ] Configure branch protection on `main`: require CI to pass, require review

### GDPR / POPIA Compliance

- [ ] Implement a data subject request process (right to access, right to erasure)
- [ ] Configure database backups and confirm retention period meets regulatory requirements
- [ ] Ensure `contact_email` in `vendors` table is only accessible to authorised roles
- [ ] Document data flows for your DPA (Data Processing Agreement) if processing EU data

---

## 🟡 Nice to have — Within month 1

- [ ] Set up `pg_cron` for notification cleanup (migration 004 has the SQL, commented out)
- [ ] Configure Supabase Log Drains to ship database logs to your logging provider
- [ ] Implement document expiry enforcement (cronjob to flag expired trade_documents)
- [ ] Add `esg_scores` data ingestion from your external ESG provider
- [ ] Configure IP allowlist enforcement for integrations (`allowed_ips` column in `integrations`)
- [ ] Load test the API before launch (k6 / Artillery) — focus on `/api/v1/orders` and `/api/v1/compliance`

---

## Useful Commands

```bash
# Check migration status
supabase migration list --db-url "$PROD_SUPABASE_DB_URL"

# Push pending migrations
supabase db push --db-url "$PROD_SUPABASE_DB_URL"

# Build and run API locally with Docker
docker build -t sbdmm-api -f apps/api/Dockerfile .
docker run -p 3001:3001 --env-file apps/api/.env sbdmm-api

# Full typecheck
npm run typecheck

# Run E2E tests against staging
PLAYWRIGHT_BASE_URL=https://staging.your-domain.com npm run test:e2e
```
