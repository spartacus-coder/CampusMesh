# ADR-001: Monorepo Architecture with pnpm Workspaces

## Status

Accepted

## Context

CampusMesh requires building a cross-platform system comprising a responsive web application (PWA), a native desktop container (Tauri 2), a native mobile container (Capacitor 8), serverless signaling infrastructure (Cloudflare Workers/Durable Objects), and reusable TypeScript core libraries (cryptography, messaging protocol, storage, transport).

Maintaining multiple separate repositories would introduce severe dependency synchronization overhead, API drift, and duplicated build pipelines.

## Alternatives Considered

1. **Separate Repositories:** Independent git repos for web, desktop, mobile, and libraries. Rejected due to version coordination friction.
2. **Turborepo / Nx:** High-complexity monorepo orchestrators. Rejected to maintain minimal tooling overhead and avoid paid/proprietary cloud cache incentives.
3. **pnpm Workspaces:** Standard, lightweight, fast, deterministic package manager supporting symlinked workspace dependencies natively.

## Decision

We select **pnpm Workspaces** with TypeScript project references as the monorepo foundation. Applications reside in `apps/*`, libraries in `packages/*`, and serverless code in `infrastructure/*`.

## Consequences

- Fast, space-efficient dependency installations via hardlinks.
- Atomic commits and unified CI/CD pipelines across the entire codebase.
- Clear architectural boundaries enforced by TypeScript and ESLint.
