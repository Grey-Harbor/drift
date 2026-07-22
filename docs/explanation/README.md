# Explanation

Explanation documents the decisions behind Drift's bounded, portable persistence model.

- [Storage adapters](./adapters.md) — why the core depends on a repository port rather than a specific database.
- [Tenancy and API keys](./tenancy-and-api-keys.md) — how service credentials establish isolation.
- [Retrieval](./retrieval.md) — why declarative reads are constrained and synchronous.
