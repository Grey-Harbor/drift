# Implement a storage adapter

Use this guide when adding a persistence backend behind Drift's existing repository port. The goal is to preserve every service and HTTP guarantee while isolating connection, mapping, query, transaction, and migration mechanics inside the new adapter.

Read [why Drift uses storage adapters](../explanation/adapters.md), [Architecture](../../ARCHITECTURE.md), the canonical `src/interfaces/repository.ts` port, and the SQLite adapter before changing code. A new adapter is not an opportunity to redesign the public contract.

## Define the rollout decision

Before implementation, have a maintainer or operator explicitly choose:

- the target storage system and supported versions;
- migration and rollback ownership;
- acceptable consistency, latency, backup, and recovery requirements;
- credential and network-security controls; and
- the production observability needed to approve rollout.

Automation may scaffold files, map explicitly corresponding fields, run conformance tests, and format configuration. It must not infer data-retention policy, consistency tradeoffs, production cutover timing, credential scope, or whether a failed migration is safe to retry.

## Implement the repository port

Add the adapter under `src/adapters/<storage>/` with focused modules for connection lifecycle, migrations, record mapping, and repository operations. Implement in this order:

1. Tenant and API-key persistence so authentication can run through the adapter.
2. Vertex and edge reads and writes, including tenant-scoped lookup and atomic version-aware mutation.
3. Filtered lists with deterministic ordering and opaque pagination.
4. `findConnectedEdges` with direction, edge-type, tenant, and deleted-record filters.
5. Adapter lifecycle and migration entrypoints without importing adapter types into `src/core`, `src/contracts`, or `src/api`.

The adapter returns persistence outcomes such as a matching record or `null`; `DriftService` continues to own authorization, traversal, retrieval, optimistic-concurrency policy, and public errors.

## Preserve the compatibility invariants

Verify all of the following before the adapter can be considered compatible:

- tenant isolation applies to every read and write;
- API-key secrets remain hashed and are never returned from lookup;
- JSON payloads round-trip as valid Drift `Json` values;
- IDs, timestamps, statuses, nullability, and versions map without loss;
- update, soft deletion, and restore are atomic with version checks;
- deleting a vertex and its active incident edges is one transaction;
- active graph reads hide deleted records unless explicitly requested by an admin;
- lists paginate deterministically and connected-edge lookup respects its filters; and
- no storage-specific type crosses the repository boundary.

Promote the current SQLite integration scenarios into a reusable repository conformance suite when a second adapter is introduced. Add adapter-specific tests for migrations, connection failure, transaction rollback, JSON representation, indexes, and database-version compatibility.

## Verify the implementation

From the repository root, format and run the complete service checks:

```bash
npm run format
npm run ci
```

Run the shared conformance suite against both SQLite and the new adapter. Then exercise the HTTP contract without changing route or core code. A failure that requires special casing in an HTTP handler or `DriftService` is evidence that the adapter has not preserved the port.

## Roll out and observe

Recommended rollout practice is to start with a disposable or copied dataset, apply migrations, and verify counts, tenant isolation, JSON round trips, graph traversal, key authentication, and mutation versions. Observe connection failures, query latency, transaction failures, migration duration, capacity, and backup freshness using the target platform's native signals.

The `/health` response proves only that Drift's HTTP process can answer; it is not a storage-integrity or backup check. Add an operator-owned readiness check appropriate to the backend before production cutover.

Back up the authoritative dataset before migration and record the exact application, adapter, schema, and database versions. Keep the prior Drift deployment and its compatible data snapshot until the new adapter has passed verification under real workload.

## Roll back safely

Stop writes before rollback. Restore the pre-cutover snapshot into the previous backend and deploy the application version known to understand that schema. Do not copy post-cutover records backward unless a reviewed reverse-migration procedure defines how to preserve IDs, versions, timestamps, deletion state, and tenant ownership.

Rollback timing and acceptable data loss are operational decisions. Automation may execute an approved, versioned rollback procedure, but it must not decide which dataset is authoritative or discard a newer dataset.
