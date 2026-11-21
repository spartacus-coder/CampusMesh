# Contributing to CampusMesh

Thank you for your interest in contributing to CampusMesh! CampusMesh is an open-source, decentralized P2P communication platform committed to zero-cost, privacy-first engineering.

## Development Workflow & Multi-Branching Model

CampusMesh follows an enterprise-grade Gitflow / Multi-Branch model designed for high-velocity open-source collaboration and automated CI/CD:

1. **Branch Roles:**
   - **`main`:** Protected production branch. Every commit corresponds to a verified release tag (`vX.Y.Z`) with compiled native artifacts.
   - **`develop`:** Primary integration and staging branch. All ongoing feature PRs merge here after passing CI gates.
   - **`feat/<slug>`:** Feature branches branched off `develop`.
   - **`fix/<slug>`:** Bug fix branches with regression tests.
   - **`release/<version>`:** Release staging branch for final version bump and artifact verification before merging into `main`.
2. **Setup:**
   ```bash
   git clone https://github.com/spartacus-coder/CampusMesh.git
   cd CampusMesh
   pnpm install
   ```
3. **Feature Branching:**
   All work must be performed on dedicated branches created from `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feat/your-feature-name
   ```
4. **Testing & Quality Gates:**
   Before creating a PR, verify all gates locally:
   ```bash
   pnpm format:check
   pnpm lint
   pnpm typecheck
   pnpm test
   ```
5. **Commit Conventions:**
   Use Conventional Commits: `<type>(<scope>): <description>`
   - `feat(...)`: New user-facing or platform functionality
   - `fix(...)`: Bug fix or patch
   - `docs(...)`: Documentation or ADR updates
   - `chore(...)`: Tooling, dependencies, or workflows
   - `refactor(...)`: Internal code improvement without behavioral change
   - `test(...)`: Unit, integration, or benchmark tests
6. **Pull Requests:**
   Open a PR targeting `develop` using the provided Pull Request template. Ensure all automated CI checks pass. Releases merge from `develop` into `main` with semantic tags.
