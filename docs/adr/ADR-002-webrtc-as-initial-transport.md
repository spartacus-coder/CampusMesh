# ADR-002: WebRTC DataChannels with Serverless Signaling as Initial Transport

## Status

Accepted

## Context

CampusMesh aims to deliver true peer-to-peer, direct device-to-device communication without routing message plaintext through centralized servers. The initial deliverable must function seamlessly in standard web browsers across Windows, Linux, macOS, Android, and iOS.

## Alternatives Considered

1. **WebSockets to a Central Server:** Traditional client-server model. Rejected because it violates the decentralized P2P mandate and creates hosting costs.
2. **Holepunch Pear / Hyperswarm:** Pure P2P DHT and swarm protocol. Excellent for native runtimes, but lacks direct, unassisted browser WebRTC gateway compatibility. Deferred to Phase 10 as an experimental R&D track.
3. **WebRTC DataChannels:** Standard, universally supported browser and native P2P transport providing low-latency, encrypted datagrams and byte streams.

## Decision

We select **WebRTC DataChannels** as the primary initial transport, coordinated by an ephemeral Cloudflare Worker + Durable Object room coordinator.

## Consequences

- Zero-cost direct data transfer between peers on compatible NAT networks.
- Requires signaling for SDP/ICE exchange (implemented on Cloudflare Free tier).
- When signaling is offline, clients fall back to manual Base45 connection tokens or local LAN discovery.
