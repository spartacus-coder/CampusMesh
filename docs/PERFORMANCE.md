# CampusMesh Performance & Benchmarking Standards

## 1. Benchmarking Philosophy & Low-End Target Environments

Performance in CampusMesh is treated as a core architectural feature. The platform must operate fluidly on budget hardware and unstable mobile connections.

### Target Reference Hardware & Networks

1. **Low-End Mobile Device:**
   - CPU: ARM Cortex-A55 octa-core (e.g. MediaTek Helio G35 / Qualcomm Snapdragon 680).
   - RAM: 3 GB - 4 GB.
   - OS: Android 12+, Chrome for Android.
2. **Budget Windows Laptop:**
   - CPU: Intel Celeron N4020 / Intel Core i3 (dual/quad-core).
   - RAM: 4 GB.
   - OS: Windows 10/11, Edge/Chrome.
3. **Throttled Network Profile (3G Simulation):**
   - RTT: 300 ms.
   - Packet Loss: 1%.
   - Bandwidth: 1.5 Mbps downlink, 750 kbps uplink.

---

## 2. Core Metrics & Hard Engineering Budgets

We measure realistic laboratory and field Core Web Vitals alongside a custom application responsiveness metric:

| Metric                                    | Target (Budget Laptop) | Target (Low-End Mobile) | Verification Tool                    |
| ----------------------------------------- | ---------------------- | ----------------------- | ------------------------------------ |
| **CampusMesh Cold-Start-to-Usable (CSU)** | p50 < 1.4s, p95 < 2.2s | p50 < 2.0s, p95 < 3.0s  | Custom `performance.mark()` timeline |
| **Largest Contentful Paint (LCP)**        | p50 < 1.2s, p95 < 1.8s | p50 < 1.8s, p95 < 2.5s  | Chrome DevTools Performance          |
| **Cumulative Layout Shift (CLS)**         | < 0.05                 | < 0.05                  | Chrome DevTools Layout Shift         |
| **Total Blocking Time (TBT)**             | < 100 ms               | < 180 ms                | Lighthouse Lab Run                   |
| **Interaction to Next Paint (INP)**       | < 60 ms                | < 90 ms                 | Chrome Performance Profiler          |
| **Active Chat Memory Footprint**          | < 60 MB RAM (1k msgs)  | < 70 MB RAM (1k msgs)   | Heap Snapshot Analyzer               |
| **Initial JS Bundle Size**                | < 150 KB gzipped       | < 150 KB gzipped        | Vite Build Analyzer                  |
| **Initial CSS Bundle Size**               | < 30 KB gzipped        | < 30 KB gzipped         | Vite Build Analyzer                  |

### What is Cold-Start-to-Usable (CSU)?

CSU measures the elapsed time from initial HTML document navigation until:

1. Local IndexedDB is unlocked.
2. The user's cryptographic identity session is restored.
3. The conversation list and active chat viewport are fully mounted and interactive.

---

## 3. Optimization Techniques

1. **Virtualized Message Rendering:** `@tanstack/vue-virtual` dynamically recycles message DOM nodes, maintaining < 40 active DOM elements even with 10,000+ conversation history items.
2. **Non-Blocking Cryptographic Web Worker:** Heavy key derivation (Argon2id) and ratchet turns execute in a dedicated Web Worker to prevent UI thread frame drops.
3. **WebRTC DataChannel Streaming & Backpressure:** File transfers use 16 KB / 64 KB chunks, respecting `bufferedAmountLowThreshold` (pausing transmissions if buffer exceeds 1 MB).
4. **Optimistic UI Updates:** Messages immediately render in state `SAVED_LOCALLY` before network transmission, guaranteeing instant perceived responsiveness.
