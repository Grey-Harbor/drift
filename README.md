# Drift

Drift is a compact, tenant-safe graph persistence service for connected application data.

It gives client applications a calm, stable path to store things, connect them, traverse relationships, and retrieve bounded aggregates—without making SQLite the application architecture.

## Start here

- [Getting started tutorial](./docs/tutorial/getting-started.md) — bootstrap a tenant, create a graph, traverse it, and run an aggregate.
- [Tenant and key administration tutorial](./docs/tutorial/administering-tenants-and-keys.md) — create isolated tenants and manage scoped service credentials.
- [Data model reference](./docs/reference/model.md) — every persisted field and its purpose.
- [API reference](./docs/reference/api.md) — routes, request rules, scopes, and errors.
- [Release guide](./docs/how-to/release.md) — the verified GHCR publishing path.
- [Architecture](./ARCHITECTURE.md) — the boundary and portability decisions behind the service.
- [Project plan](./PLAN.md) — the original MVP intent, completed phases, and remaining delivery work.

## Run the public image

Drift releases are Docker images at `ghcr.io/grey-harbor/drift` for
`linux/amd64` and `linux/arm64`. Follow the [Docker guide](./docs/how-to/docker.md)
to start a pinned image, bootstrap its tenant, and preserve the one-time admin-key
secret.

## Why it exists

Most application teams do not need a graph platform. They need a small, dependable persistence layer for connected content: inventory, services, dependencies, documents, work, and other resources that already relate to one another.

Drift keeps that layer explicit:

- vertices are things;
- edges are typed relationships;
- API keys establish tenant boundaries;
- JSON carries evolving application payloads;
- versions protect concurrent mutations; and
- storage remains behind an adapter boundary.

## What it is not

Drift is not a hosted graph platform, workflow engine, identity provider, arbitrary code execution environment, or unbounded query engine. It is deliberately boring CRUD, traversal, and declarative retrieval infrastructure.
