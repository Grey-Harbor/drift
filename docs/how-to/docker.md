# Run Drift with Docker

Use this guide when you need a self-contained Drift service with durable local data. A Docker volume keeps the SQLite database outside the container lifecycle, so rebuilding or restarting the service does not discard tenants, API keys, or graph records. Public releases are available at `ghcr.io/grey-harbor/drift` for `linux/amd64` and `linux/arm64`.

The examples bind Drift to `127.0.0.1:3000`. Drift does not terminate TLS; choose an authenticated, encrypted ingress and an operator-approved exposure policy before making it reachable beyond the local host.

## Run a published release

Create a durable volume and start an explicit image version:

```bash
docker volume create drift-data
docker run --detach --name drift --publish 127.0.0.1:3000:3000 \
  --volume drift-data:/data \
  ghcr.io/grey-harbor/drift:v0.1.0
```

Use a release tag for a readable deployment pin, or the digest recorded in the GitHub
release for an immutable one. `latest` is convenient for evaluation but is not the
recommended production pin. Verify the service, then bootstrap through the same volume:

```bash
curl http://localhost:3000/health
docker exec drift node dist/cli.js bootstrap --slug acme --name "Acme Inc."
```

## Start the service

Build and start Drift in the foreground:

```bash
docker compose up --build
```

Use `docker compose up --build -d` if you prefer it to run in the background. Drift listens on `http://localhost:3000`; confirm that it is ready in another terminal:

```bash
curl http://localhost:3000/health
```

The repository's Compose file publishes port 3000 on host interfaces. Restrict that mapping or place it behind an approved ingress before using Compose on a shared or production host.

## Bootstrap the first tenant

Before a client can use the API, Drift needs a tenant and an API key. The bootstrap command creates both:

```bash
docker compose exec drift node dist/cli.js bootstrap \
  --slug acme \
  --name "Acme Inc."
```

The tenant slug is the operator-facing identifier. The command creates the first `admin` API key for that tenant and prints its complete secret exactly once. Drift stores only a cryptographic hash of the secret, so it cannot be displayed or recovered later.

Copy the returned `secret` immediately into a password manager, deployment-secret store, or a temporary shell variable. Do not commit it to a repository, add it to an image, or place it in documentation:

```bash
export DRIFT_KEY='drift_<prefix>.<secret>'
export DRIFT_URL='http://localhost:3000'
```

The bootstrap key is powerful: it can read and write graph data, manage tenant keys, view soft-deleted records, and restore them. Create narrower `read` or `write` keys for client services through the admin API after setup.

To create another isolated tenant, run bootstrap again with a different unique slug and store its separate secret. Bootstrap with an existing slug fails rather than creating another key for that tenant; use the tenant's admin API to add or rotate keys. [Tenants, bootstrap, and API keys](../explanation/tenancy-and-api-keys.md) explains this relationship in detail.

## Continue with the first graph

The service is now running and `DRIFT_KEY` is available. Continue at [step 2 of the getting-started tutorial](../tutorial/getting-started.md#2-create-a-product-vertex) to create product and invoice vertices, connect them, traverse the graph, and run a retrieval aggregate.

## Persist, back up, and restore

The Compose volume stores the SQLite database at `/data/drift.sqlite` inside the container. It persists across normal `docker compose down` and later `up` commands. Back up the volume/database while the service is stopped, or use SQLite's online backup tooling for a live deployment. Before replacing a pinned image version, take a backup and retain the prior image tag so you can roll back the container if needed.

For the named `drift` container used above, make a consistent offline copy:

```bash
docker stop drift
docker cp drift:/data/drift.sqlite ./drift.sqlite.backup
docker start drift
curl -fsS http://localhost:3000/health
```

Store the backup under an operator-approved retention and access policy. The database contains tenant records, API-key hashes, graph data, and metadata. A file copy is not verified until an operator restores and tests it in an isolated environment.

To restore, stop Drift, preserve the current database for investigation, copy an explicitly selected backup into the volume, and restart:

```bash
docker stop drift
docker cp drift:/data/drift.sqlite ./drift.sqlite.before-restore
docker cp ./drift.sqlite.backup drift:/data/drift.sqlite
docker run --rm --user root --volume drift-data:/data \
  --entrypoint chown ghcr.io/grey-harbor/drift:v0.1.0 \
  node:node /data/drift.sqlite
docker start drift
curl -fsS http://localhost:3000/health
```

Choosing the authoritative backup, acceptable recovery point, and restore window is an operator decision. Automation may execute these commands only with an explicitly selected source and target; it must not choose a backup or overwrite a database based on filename alone.

## Roll out, roll back, and observe

Before changing a pinned image, record its tag or digest and take a verified backup. Pull and start the new image against a copy of production data first when possible. After rollout, check container health, `docker logs drift`, authentication with a non-admin smoke-test key, and representative reads and writes.

The image health check and `/health` response show that the HTTP process responds. They do not prove backup freshness, available disk capacity, graph correctness, or client success. Monitor Docker health, restarts, logs, host/volume capacity, request failures, and backup verification using operator-owned tooling.

To roll back, stop writes, stop the new container, start the previously pinned image, and restore the pre-rollout database if the newer version changed persisted state incompatibly. Do not infer schema compatibility from a healthy process; use release notes and an approved migration plan.

To remove the service container but preserve data:

```bash
docker compose down
```

To intentionally discard all local Drift data, remove the Compose volume as well. This is destructive and removes tenants, API keys, and graph records:

```bash
docker compose down -v
```

Volume removal is irreversible through Drift. Confirm the exact Compose project and backup status before running it.
