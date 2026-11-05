# CampusMesh Deployment Guide

## 1. Cloudflare Pages (Web PWA Hosting)

CampusMesh Web is hosted for free on Cloudflare Pages using the `*.pages.dev` domain.

### Build Configuration

- **Framework Preset:** Vue / Vite
- **Build Command:** `pnpm --filter @campusmesh/web build`
- **Build Output Directory:** `apps/web/dist`
- **Node.js Version:** `>= 20.0.0`
- **Environment Variables:** Set `NODE_VERSION=20`

### Zero-Cost Continuous Deployment

Merges to `main` trigger automatic deployment on Cloudflare Pages via GitHub repository integration. Zero manual steps or paid server infrastructure required.

---

## 2. Cloudflare Workers & Durable Objects (Signaling)

The signaling layer resides in `infrastructure/cloudflare`.

### Deployment via Wrangler

```bash
cd infrastructure/cloudflare
npx wrangler deploy
```

### Wrangler Configuration (`wrangler.toml`)

- Configured with `compatibility_date = "2024-11-01"`
- `workers_dev = true` (uses free `*.workers.dev` subdomain)
- Durable Objects binding `ROOM_COORDINATOR` mapped to class `RoomCoordinatorDO` with SQLite enabled.
- Strictly operates within the 100,000 requests/day free tier.
