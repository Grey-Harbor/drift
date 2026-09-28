# Run Drift with PostgreSQL

Use this guide when a Drift deployment needs PostgreSQL connection pooling, managed-database operations, or migration from an existing SQLite database. PostgreSQL is a peer implementation of Drift's repository contract; changing adapters does not change the `/v1` API or tenant model.

Drift supports PostgreSQL 16 and newer. Automated compatibility checks cover PostgreSQL 16, 17, and 18. SQLite remains the default when `DRIFT_STORAGE` is omitted.

## Configure a new Postgres deployment

Create a dedicated database and credential with permission to connect and create or alter objects in that database. Supply the credential through your deployment secret manager:

```bash
export DRIFT_STORAGE=postgres
export DRIFT_POSTGRES_URL='postgresql://drift:<password>@db.example.test:5432/drift?sslmode=require'
```

`DRIFT_POSTGRES_URL` is required in Postgres mode. Drift does not log it. Use the certificate verification and TLS policy required by your database provider; `sslmode=require` above is only an illustrative placeholder, not a universal production policy.

Apply migrations explicitly before a deployment:

```bash
npm run cli -- migrate
```

The server also applies pending migrations before it begins listening. Migrations are ordered, checksummed, transactional, and serialized with a database advisory lock. Startup fails when the connection is unavailable, PostgreSQL is older than version 16, or an applied migration's checksum has changed.

Start the server only after the migration command succeeds:

```bash
npm start
```

For local evaluation, the repository includes a Compose overlay:

```bash
docker compose -f compose.yaml -f compose.postgres.yaml up --build
```

The overlay's password is development-only. Do not reuse it outside an isolated local environment.

## Migrate an existing SQLite deployment

The migration is an offline cutover. It copies into an empty Postgres destination and does not support dual-write or automatic reverse synchronization.

1. Record the deployed Drift image version and take a verified SQLite backup.
2. Stop Drift or otherwise stop every writer to the SQLite database.
3. Create an empty Postgres database and configure its credential.
4. Run the copier from the Drift version being deployed:

```bash
DRIFT_DATABASE_PATH=/absolute/path/to/drift.sqlite \
DRIFT_POSTGRES_URL='postgresql://drift:<password>@db.example.test:5432/drift?sslmode=require' \
npm run cli -- migrate-data
```

The command applies the Postgres schema, reads a stable SQLite snapshot, and copies tenants, API keys, vertices, and edges in dependency order. It preserves identifiers, key hashes, scopes, JSON, timestamps, versions, tenant ownership, and deletion state.

Before committing, the copier compares normalized row counts and SHA-256 digests for every application table. Success prints a summary shaped like:

```json
{
  "verified": true,
  "tables": {
    "tenants": {
      "count": 1,
      "sha256": "<digest>"
    },
    "api_keys": {
      "count": 3,
      "sha256": "<digest>"
    },
    "vertices": {
      "count": 25,
      "sha256": "<digest>"
    },
    "edges": {
      "count": 31,
      "sha256": "<digest>"
    }
  }
}
```

The command never prints records, key hashes, or connection strings. A mapping, insertion, count, or digest failure rolls back all destination application rows and exits nonzero. A populated destination is rejected rather than merged or overwritten.

## Verify and cut over

Keep writes stopped after the copier succeeds. Start Drift with `DRIFT_STORAGE=postgres`, then verify:

- `/health` responds;
- a narrow test key authenticates;
- representative active and deleted records have the expected versions;
- list pagination and graph traversal return expected results; and
- database logs and connection counts show no unexpected errors.

Only then reopen client traffic. `/health` proves that the HTTP process responds; it does not prove database integrity, backup freshness, replica health, or successful client operations.

## Roll back

If verification fails before Postgres accepts authoritative writes, stop Drift and restart the prior deployment against the preserved SQLite database:

```bash
export DRIFT_STORAGE=sqlite
export DRIFT_DATABASE_PATH=/absolute/path/to/drift.sqlite
npm start
```

Do not roll back to SQLite after Postgres has accepted writes unless a reviewed reverse-migration procedure identifies the authoritative dataset and preserves IDs, versions, timestamps, tenant ownership, and deletion state. Drift does not provide that reverse migration.

## Operate and secure Postgres

Postgres owns its backup, restore, replication, capacity, and certificate lifecycle. Monitor connection use, query latency, transaction failures, migration duration, disk capacity, replication lag where applicable, and verified backup age using database-native tooling.

The database contains API-key hashes, tenant data, and application payloads. Restrict the Drift credential to its database, require encrypted network transport appropriate to the environment, rotate credentials through the deployment secret manager, and test restores in isolation.

Automation may create an empty destination, run the approved migration command, compare its verification summary, and apply reviewed configuration. A human operator must choose the authoritative source, approve downtime and rollback thresholds, and decide when Postgres is ready to accept production writes.
