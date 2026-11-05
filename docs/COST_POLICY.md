# CampusMesh Infrastructure Cost Policy & Quota Safeguards

> **Budget Cap:** Exactly $0.00 / month  
> **Status:** Strictly Enforced Fail-Closed Architecture  
> **Verification Date:** Current Official Upstream Documentation

---

## 1. Zero-Cost Policy Principles

1. **No Paid Dependencies:** The project strictly forbids introducing any paid VPS, cloud databases, managed TURN services, commercial push gateways, paid domains, or proprietary commercial SDKs.
2. **Provider Subdomains Only:** The application operates exclusively on default free provider subdomains (e.g. `*.pages.dev`, `*.workers.dev`). No custom domain registration fees.
3. **No Payment Methods on Cloud Accounts:** Cloudflare and GitHub accounts hosting CampusMesh must remain strictly on Free tiers with no payment method attached.
4. **Fail-Closed Protection:** If any free-tier service quota is exceeded, the service halts immediately and fails closed. The software **never** auto-escalates to a paid plan.
5. **Graceful Client Degradation:** The client software handles all quota exhaustion status codes (HTTP 429, 1015, 1027), displays informative diagnostic notices, queues messages in local storage, and falls back to pure direct P2P (manual Base45 tokens / local LAN).

---

## 2. Official Cloudflare Free Tier Quota Audit

### 2.1 Cloudflare Workers & Durable Objects (Free Plan)

| Resource Metric                 | Free Plan Quota         | Scope       | Exhaustion Mechanism       | Client Handling                              |
| ------------------------------- | ----------------------- | ----------- | -------------------------- | -------------------------------------------- |
| **Workers Invocations**         | 100,000 requests / day  | Account     | HTTP 429 / 1015            | Sets `signalingStatus = 'UNAVAILABLE_QUOTA'` |
| **Workers CPU Time**            | 10 ms / invocation      | Per request | Worker timeout (1101/1027) | Discards request; logs warning               |
| **Durable Objects Requests**    | 100,000 requests / day  | Account     | HTTP 429                   | DO coordination pauses                       |
| **Durable Objects Compute**     | 13,000 GB-seconds / day | Account     | Rate limited               | WebSocket Hibernation ensures 0s idle usage  |
| **DO SQLite Reads**             | 5,000,000 rows / day    | Account     | SQLite read throttled      | Retries with backoff                         |
| **DO SQLite Writes**            | 100,000 rows / day      | Account     | SQLite write throttled     | Minimizes writes; ephemeral state only       |
| **DO Total Account Storage**    | 5 GB                    | Account     | Insufficient storage error | Auto-evicts expired room records             |
| **Max Storage per DO Instance** | 1 GB                    | Per DO      | Write rejected             | Room instance capped to 2 MB                 |

### 2.2 Cloudflare Pages (Free Plan)

| Resource Metric              | Free Plan Quota     | Scope      | Exhaustion Behavior                                             |
| ---------------------------- | ------------------- | ---------- | --------------------------------------------------------------- |
| **Monthly Builds**           | 500 builds / month  | Account    | Builds pause until month reset; active production site stays up |
| **Concurrent Builds**        | 1 concurrent build  | Account    | Subsequent builds queue sequentially                            |
| **Build Timeout**            | 20 minutes          | Per build  | Build fails; logs timeout                                       |
| **Static Files per Site**    | 20,000 static files | Per deploy | Deploy fails if exceeded (monorepo produces < 500 files)        |
| **Max Individual File Size** | 25 MiB              | Per file   | Deploy fails (Vite chunks are bounded to < 500 KB)              |
| **Bandwidth**                | Unlimited Free      | Global CDN | Unmetered; zero billing risk                                    |

---

## 3. Free Public STUN Pool & Prohibited TURN

- **Prohibited:** Paid TURN servers and Cloudflare Calls (which incurs usage billing).
- **Free STUN Providers:**
  - `stun:stun.cloudflare.com:3478`
  - `stun:stun.l.google.com:19302`
- **NAT Traversal Failure Policy:** When symmetric NAT prevents direct WebRTC traversal, the client informs the user to connect via local Wi-Fi or manual token exchange. The platform will never introduce a paid relay server.

---

## 4. GitHub Actions CI/CD Budget Protection

- Public GitHub repositories benefit from free standard runners.
- Windows and Android builds execute only on tagged releases (`v*`) or merges to `main`.
- Pull request workflows execute fast linting, type-checking, and unit tests on Linux standard runners.
