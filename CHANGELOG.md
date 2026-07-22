# Changelog

All notable Drift releases are recorded here. Drift follows semantic versioning
for its service release and versioned `/v1` HTTP contract.

## [0.1.0] - 2026-07-22

### Added

- Tenant-safe vertices, edges, scoped API keys, optimistic versions, and soft deletion.
- Bounded list, traversal, and declarative retrieval APIs under `/v1`.
- SQLite persistence behind the `DriftRepository` interface.
- Docker images for `linux/amd64` and `linux/arm64` at
  `ghcr.io/grey-harbor/drift`.

### Operational notes

- Pin deployments to `v0.1.0` or an image digest. `latest` is a convenience tag.
- The image runs as a non-root user and stores SQLite data at `/data/drift.sqlite`.
- v0.1.0 does not publish an npm package or generated typed client SDK. That work
  is explicitly deferred to a later release.
