# AGENTS.md

## Working Rules

- Use Conventional Commits: `<type>(<scope>): <description>`, imperative and under 72 characters.
- Keep one logical change per commit. Do not prefix branches with an agent name.
- Preserve user changes and avoid destructive git commands unless explicitly requested.
- Keep `ARCHITECTURE.md` and user-facing docs aligned with behavioral changes.
- Format all edited TypeScript, JSON, YAML, and Markdown with Prettier before handoff; use the repository's `.prettierrc.json` and do not leave compressed one-line implementation code.
- Prefer focused modules with one clear responsibility. Extract cohesive concerns—such as authentication, request parsing, schemas, persistence mapping, or query transformation—before a file becomes a mixed-responsibility implementation. Keep public orchestration types and entrypoints small, and preserve behavior with focused tests when moving code.

## Design Principles

- Prefer explicit behavior over convenience.
- Preserve stable contracts over implementation details.
- Prefer composition to inheritance.
- Add capabilities through extension, not special cases.
- Every abstraction should remove complexity, not relocate it.

## Architecture Rules

> Gang of Four taught us to recognize patterns. Roy Fielding taught us that good constraints create good systems. Drift explores both ideas applied to persisted application data.

1. HTTP handlers contain no business logic.
2. All mutations flow through `DriftService`.
3. Core services depend only on interfaces, never concrete storage.
4. Adapters are persistence bridges only: they map records and execute storage queries, but do not own traversal, retrieval, authorization, or other domain algorithms.
5. SQLite is an adapter, not the application architecture.
6. API contracts are versioned and stable; contract tests define compatibility.
7. Framework-specific logic must not leak into core services.
8. Convenience helpers may not bypass the service/repository boundary.
9. Public API compatibility takes precedence over internal implementation
   convenience. Breaking API changes require an explicit API version increment and
   documentation update.

## Documentation

- Use Diátaxis under `docs/`: tutorial, how-to, reference, explanation.
- Keep the root README a short landing page.
- Write in the Grey Harbor voice: calm, practical, independent, and technically confident.
