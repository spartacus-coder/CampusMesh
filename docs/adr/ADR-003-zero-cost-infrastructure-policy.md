# ADR-003: Zero-Cost Infrastructure Policy & Fail-Closed Guardrails

## Status

Accepted

## Context

A non-negotiable requirement of CampusMesh is a hard monthly infrastructure budget of **$0.00**. The platform must never require recurring server expenditure, commercial API subscriptions, or paid domain registrations.

## Alternatives Considered

1. **Low-Cost VPS ($5/month):** Rejected; violates the absolute zero-cost constraint.
2. **Free-Tier Cloud with Auto-Pay Escalation:** Dangerous; sudden traffic spikes or malicious attacks could trigger unexpected bills.
3. **Fail-Closed Free Tier with Pure P2P Fallback:** Selected.

## Decision

We mandate an enforced **Fail-Closed Architecture**:

1. All cloud components are provisioned exclusively on free tiers that refuse paid overages (Cloudflare Pages, Workers Free, Durable Objects Free, GitHub Actions public runners).
2. No payment method is attached to cloud hosting accounts.
3. If quotas are exceeded, the affected coordination component halts immediately, and clients gracefully degrade to direct manual signaling or local LAN mode.

## Consequences

- Guaranteed zero recurring financial liability.
- Software remains functional even during total coordination infrastructure outage.
