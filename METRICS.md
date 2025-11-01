# Project Metrics (Evidence-Backed)

This document captures the key, resume-ready metrics for the project. Each number is backed by an artifact in the `evidence/` folder or a public status page. Replace placeholders after you run the steps below.

## Frontend Web Experience (Vercel)

- Lighthouse (Desktop) — Performance/Accessibility/Best Practices/SEO: 98/100/96/100
  - Evidence: `evidence/frontend/lighthouse-desktop.report.html` and `.json`
- Lighthouse (Mobile) — Performance/Accessibility/Best Practices/SEO: 98/100/96/100
  - Evidence: `evidence/frontend/lighthouse-mobile.report.html` and `.json`

Notes: Include PageSpeed Insights screenshots if desired: `evidence/frontend/psi-desktop.png`, `evidence/frontend/psi-mobile.png`.

## Backend API Performance (Production)

- Endpoint(s) tested: `GET https://api.4.187.225.54.nip.io/health`
- Load test parameters: `concurrency=c30`, `duration=30s`
- Latency (ms): p50 `28`, p99 `291` (p95 N/A in this run)
- Peak throughput (avg requests/s): `611.94`
- Non-2xx error rate during load test: `0.00%`
  - Evidence: `evidence/backend/autocannon-get.json` (parsed via `node tools/parse-autocannon.js evidence/backend/autocannon-get.json`)

## Reliability (Uptime)

- Uptime (last 30 days): Frontend `100%` | Backend `100%`
  - Evidence: UptimeRobot public status page link + screenshots in `evidence/reliability/`
  - Status page URL: `https://stats.uptimerobot.com/lNxVm6j69q`

## Security (Production Dependencies)

- Vulnerabilities: 0 high / 0 critical
  - Evidence: `evidence/frontend/npm-audit-frontend.txt`, `evidence/backend/npm-audit-backend.txt`

---

# How to Reproduce (Summary)

See the step-by-step guide in the PR/issue comment or your personal notes. Quick pointers:

- Lighthouse (production Vercel URL):

  - Desktop: `npx lighthouse <FRONTEND_URL> --preset=desktop --output=json --output=html --output-path=./evidence/frontend/lighthouse-desktop`
  - Mobile (default): `npx lighthouse <FRONTEND_URL> --output=json --output=html --output-path=./evidence/frontend/lighthouse-mobile`
    - Note: Lighthouse defaults to a mobile emulation profile. Use `--preset=desktop` only for desktop.

- API Load Test (production API URL):

  - GET: `npx autocannon -c 50 -d 60 <API_GET_URL> --json > evidence/backend/autocannon-get.json`
  - POST: `npx autocannon -c 20 -d 60 -m POST -H "content-type=application/json" -b @sample-body.json <API_POST_URL> --json > evidence/backend/autocannon-post.json`
  - Summary: `node tools/parse-autocannon.js evidence/backend/autocannon-post.json`
  - Windows tip: PowerShell redirection can save UTF-16. Prefer `cmd /c "... > evidence\\backend\\file.json"` or `... | Out-File -Encoding utf8`.

- Uptime (UptimeRobot): Create two HTTP monitors (frontend

* backend) and enable a public Status Page. Save screenshots to `evidence/reliability/`.

- Security (npm audit):
  - Frontend: `cd frontend && npm audit --production > ../evidence/frontend/npm-audit-frontend.txt`
  - Backend: `cd backend && npm audit --production > ../evidence/backend/npm-audit-backend.txt`

Keep this file updated with your latest results and dates.
