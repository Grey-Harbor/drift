# Run Drift with Docker

Docker Compose is the supported way to run a self-contained local Drift service. The Compose volume keeps the SQLite database outside the container lifecycle, so rebuilding or restarting the service does not discard tenants, API keys, or graph records.

## Start the service

Build and start Drift in the foreground:

```bash
docker compose up --build
```

Use `docker compose up --build -d` if you prefer it to run in the background. Drift listens on `http://localhost:3000`; confirm that it is ready in another terminal:

```bash
curl http://localhost:3000/health
```

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

The service is now running and `DRIFT_KEY` is available. Continue at [step 2 of the getting-started tutorial](../tutorial/getting-started.md#2-create-a-host-vertex) to create the host and service vertices, connect them, traverse the graph, and run a retrieval aggregate.

## Persistence and backups

The Compose volume stores the SQLite database at `/data/drift.sqlite` inside the container. It persists across normal `docker compose down` and later `up` commands. Back up the volume/database while the service is stopped, or use SQLite's online backup tooling for a live deployment.

To remove the service container but preserve data:

```bash
docker compose down
```

To intentionally discard all local Drift data, remove the Compose volume as well. This is destructive and removes tenants, API keys, and graph records:

```bash
docker compose down -v
```
