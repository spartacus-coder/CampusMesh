# ADR-004: Design System Stack: Vue 3, Tailwind CSS, shadcn-vue & Reka UI

## Status

Accepted

## Context

CampusMesh requires a polished, production-grade visual design and accessible UX that rivals modern messengers (Telegram, Discord, Element). It must support desktop multi-pane layouts with command palettes as well as mobile-first touch interfaces with gesture navigation.

## Alternatives Considered

1. **Generic Bootstrap / Admin Dashboard Template:** Rejected; feels dated, enterprise-heavy, and unsuited for a modern communication product.
2. **Custom Component Library from Scratch:** High maintenance overhead, prone to accessibility oversights.
3. **shadcn-vue with Reka UI primitives & Tailwind CSS:** Selected.

## Decision

We select **Vue 3 + Vite + Tailwind CSS + shadcn-vue + Reka UI + Lucide Icons**:

- **Reka UI** provides headless, unstyled, fully accessible (WAI-ARIA) component primitives.
- **shadcn-vue** provides copy-and-own, highly customizable components integrated with Tailwind CSS design tokens.
- **Tailwind CSS** enables fluid dark/light theming, high-contrast support, and consistent spacing/typography scales.

## Consequences

- High-velocity frontend development with enterprise-grade accessibility (WCAG 2.2 AA).
- Unbloated bundle size with full tree-shaking.
- Consistent visual language across Web, Desktop (Tauri), and Mobile (Capacitor).
