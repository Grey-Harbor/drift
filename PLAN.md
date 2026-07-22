# Drift MVP Plan

## Product intent

Drift is a durable, resource-oriented persistence service for connected application content. It gives client-facing and backend services stable APIs for things, relationships, bounded graph reads, and bounded aggregate reads.

The MVP is deliberately an application chassis, not a hosted graph platform:

- TypeScript service with SQLite as the first adapter, not the architecture.
- Stable REST/OpenAPI v1 API and a TypeScript client surface.
- Tenant isolation derived from scoped API keys.
- Vertices and edges as the persisted graph model.
- Lists, traversal, and declarative retrieval as complementary read methods.

It does not include a UI, end-user sessions, files, events, billing, GraphQL, unbounded graph queries, arbitrary transform code, or persisted ETL jobs.

## Architectural commitments

These rules are implementation constraints, not future aspirations:

1. HTTP handlers contain transport concerns only.
2. All mutations flow through `DriftService`.
3. Core services depend on repository interfaces, never SQLite or Fastify.
4. Storage implementations satisfy `DriftRepository`.
5. SQLite owns SQL and migrations; a future adapter must preserve repository behavior.
6. API contracts are versioned at `/v1` and tested as stable contracts.
7. Breaking public-contract changes require a new major API version.
8. No helper may bypass the service/repository boundary.

## Phased delivery

### Phase 1 — Foundation [complete]

- [x] TypeScript project layout: contracts, core, interfaces, SQLite adapter, API, migrations, tests.
- [x] SQLite migrations for tenants, API keys, vertices, and edges.
- [x] UUIDv7 public IDs, timestamps, JSON storage, indexes, and transactions.
- [x] Operator CLI for migrations and tenant/bootstrap-admin-key creation.
- [x] Repository port that keeps core graph behavior independent of SQLite.

### Phase 2 — Tenant-safe graph API [complete]

- [x] Bearer API key authentication with hashed, one-time-visible secrets.
- [x] Read, write, and admin scopes; tenant identity always derives from the key.
- [x] Vertex and edge CRUD, filtered cursor lists, versioned PATCH/DELETE, and soft deletion.
- [x] Atomic soft deletion of active incident edges when a vertex is deleted.
- [x] Admin-only deleted-record visibility and explicit, non-cascading restore.
- [x] Same-tenant, active-endpoint validation for edges.
- [x] Incoming, outgoing, neighboring, and bounded traversal reads.

### Phase 3 — Declarative retrieval [complete]

- [x] `POST /v1/retrieve` as an optional client retrieval method.
- [x] Vertex or edge source, first-class filters, projection, grouping, standard aggregates, sort, and bounded result sets.
- [x] Explicit JSON-path projection from `data` and `metadata`.
- [x] No JSON-path predicates, joins, traversal within retrieval, user code, job queue, or derived-data persistence.
- [x] Server limits on traversal depth/results and retrieval scan, group, result, and execution budgets.

### Phase 4 — Delivery and learning materials [in progress]

- [x] Node server, Docker image, Compose development setup, health endpoint, and OpenAPI document.
- [x] Unit, adapter-integration, HTTP-contract, and mocked-client-target tests.
- [x] MPL-2.0 license, project governance, root README, architecture record, and Diátaxis documentation.
- [-] GitHub verification workflow for formatting, type checks, tests, build, and container persistence smoke tests; pending its first GitHub run.
- [-] Tag-driven GHCR release process for multi-architecture images, provenance, and release notes; pending the first `v0.1.0` tag.
- [x] Docker-only v0.1.0 distribution decision. The npm package remains private and the generated typed SDK is deferred.

## Acceptance criteria

The MVP is complete when a new operator can bootstrap a tenant, a client can create and connect graph records using only the documented API, and each behavioral guarantee above has contract or integration coverage. The current implementation is ready for GitHub verification and first-tag review; no image is public until the release workflow completes.

## Deferred enhancements

The first release deliberately supports Node.js and Docker/Compose only. The following are explicit future-enhancement candidates, not implied MVP work:

- hosted Drift service and operational control plane;
- browser UI or administrative console;
- end-user sessions, user records, memberships, and identity-provider integration;
- immutable event/audit log;
- file storage and file-to-vertex relationships;
- arbitrary code execution, including user-supplied map/reduce functions;
- asynchronous ETL jobs, queues, retries, schedules, and persisted derived datasets;
- GraphQL, unrestricted graph query languages, joins, and JSON-path predicates;
- additional storage adapters after the SQLite repository contract is proven in production;
- generated, separately versioned typed client SDK and npm distribution;
- ORM or query-builder adoption when a concrete second-adapter or shared-dialect need exists. Any such tool must remain inside adapters and must not move domain algorithms out of core.

Any future phase that introduces one of these capabilities must state its tenancy, authorization, persistence, API-versioning, operational-limit, and contract-test implications before implementation.
