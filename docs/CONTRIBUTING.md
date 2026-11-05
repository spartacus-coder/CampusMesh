# Contributing to CampusMesh

Thank you for your interest in contributing to CampusMesh! CampusMesh is an open-source, decentralized P2P communication platform committed to zero-cost, privacy-first engineering.

## Development Workflow

1. **Prerequisites:**
   - Node.js `>= 20.0.0`
   - pnpm `>= 9.0.0`
   - Git
2. **Setup:**
   ```bash
   git clone https://github.com/spartacus-coder/CampusMesh.git
   cd CampusMesh
   pnpm install
   ```
3. **Feature Branching:**
   All work must be performed on dedicated short-lived branches created from `main`:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/your-feature-name
   ```
4. **Testing & Linting:**
   Before creating a PR, verify:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   pnpm format:check
   ```
5. **Commit Messages:**
   Use Conventional Commits: `<type>(<scope>): <description>`
   Example: `feat(crypto): add ed25519 identity key generation`
6. **Pull Requests:**
   Open a PR targeting `main` using the provided Pull Request template. Ensure all CI checks pass.
