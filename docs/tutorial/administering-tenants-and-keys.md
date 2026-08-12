# Tutorial: administer tenants and API keys

Use this tutorial when you need to learn Drift's administration model before managing real credentials. You will create two isolated tenants, then use the companion [Drift CLI](https://drift-cli.greyharborsoftware.com/docs/) to issue a narrower service key, rotate it, and revoke a disposable key without hand-crafting HTTP requests or JSON.

Drift v1 does not expose a tenant-management HTTP API. Creating a tenant remains a server-local operator action through Drift's bundled `bootstrap` command. `drift-cli` wraps the existing admin HTTP contract for key management and recovery inside an already bootstrapped tenant; it cannot create, select, or enumerate tenants.

## Before you begin

Start Drift locally or with Docker. The bootstrap examples below run from a Drift source checkout; if you use Docker, substitute the server-local bootstrap command from the [Docker guide](../how-to/docker.md#bootstrap-the-first-tenant).

Build `drift-cli` with Rust 1.85 or newer by following its [operator tutorial](https://drift-cli.greyharborsoftware.com/docs/tutorial/), and make the resulting `drift` executable available on your `PATH`.

Set the endpoint for the companion CLI:

```bash
export DRIFT_ENDPOINT='http://localhost:3000'
drift status
```

The status command verifies Drift's HTTP health and published API contract. It does not require a credential and does not prove backup freshness, storage capacity, or graph correctness.

## 1. Create two isolated tenants

Bootstrap each tenant with a different unique slug. Save each printed secret separately: each is an admin credential for only the tenant created by that command.

```bash
npm run cli -- bootstrap --slug acme --name "Acme Inc."
npm run cli -- bootstrap --slug northwind --name "Northwind Traders"
```

Set the Acme secret from the first command as your current admin credential:

```bash
export ACME_ADMIN_KEY='drift_<acme-prefix>.<acme-secret>'
```

Running bootstrap again with `--slug acme` fails. It never issues an extra key for an existing tenant. That rule prevents accidental reinitialization; use `drift-cli` below to create or rotate Acme keys through the admin API.

Provide the Acme credential to the companion CLI:

```bash
export DRIFT_API_KEY="$ACME_ADMIN_KEY"
```

Avoid placing a real key directly in a command, where it can enter shell history. `drift-cli` also supports `--key-stdin` and named profiles whose configuration names a credential environment variable; it never stores raw credentials in its configuration file.

## 2. Inspect the tenant's key metadata

An admin key may list keys owned by its own tenant. The response contains metadata only—never a recoverable secret:

```bash
drift key list
```

The bootstrap key appears with `admin` scope. It cannot list Northwind keys because the tenant comes from the Acme credential, not from a request parameter.

## 3. Issue a client-service key

Create a key for a client service that needs graph reads and writes but no key administration:

```bash
drift key create \
  --label inventory-service \
  --scope read \
  --scope write
```

The command prints the new key ID and secret. Record the ID for lifecycle operations and store the secret in the client service's secret store immediately; the secret is returned once only. The service key can create and query Acme graph data, but it receives `403 Forbidden` if it calls `/v1/admin/keys`.

Set the printed ID for the remaining examples. Keep the admin credential in `DRIFT_API_KEY`; do not replace it with the narrower service key:

```bash
export SERVICE_KEY_ID='<inventory-service-key-id>'
```

## 4. Rotate a service key

Rotation immediately revokes the old key and returns a replacement key with the requested label and scopes. Coordinate the client update before running this command, then save the replacement secret as soon as it is printed:

```bash
drift key rotate "$SERVICE_KEY_ID" \
  --label inventory-service \
  --scope read \
  --scope write \
  --yes
```

The key returned in step 3 is now revoked and cannot authenticate. The command does not retry the mutation automatically. Distribute the new secret, then confirm the client service is healthy.

## 5. Revoke a disposable key

To revoke a key that is no longer needed, use its ID. This example creates a short-lived reporting key and immediately revokes it:

```bash
drift key create --label temporary-report --scope read
export TEMPORARY_KEY_ID='<temporary-report-key-id>'
drift key revoke "$TEMPORARY_KEY_ID" --yes
```

Revocation is immediate and does not affect graph records. An already revoked key cannot be restored; create a new key if a client needs access again.

## What this tutorial established

- `acme` and `northwind` are separate tenants with separate initial admin keys.
- An API key always determines the tenant for its request.
- Drift's server-local bootstrap command creates a new tenant; `drift-cli` calls admin endpoints to manage keys within an existing one.
- Admin keys should be kept for administrative work; client services should receive the narrowest scopes they need.

## Clean up the tutorial environment

The tutorial persists both tenants, their keys, and key lifecycle metadata in the
configured Drift database. Drift v1 has no tenant-deletion endpoint. If you used a
dedicated disposable local database, stop Drift and remove it only after confirming
that it contains no data you need:

```bash
rm -rf data
```

The default database is `./data/drift.sqlite`. Do not run this reset against a
shared or production checkout. Selecting whether a database is disposable is an
operator decision and must not be inferred by automation.

Continue with the [getting-started graph tutorial](./getting-started.md) to create tenant-scoped vertices and edges, see [tenants, bootstrap, and API keys](../explanation/tenancy-and-api-keys.md) for the model behind these commands, or use the companion CLI's [command reference](https://drift-cli.greyharborsoftware.com/docs/reference/commands/) for JSON output, named profiles, and soft-delete recovery.
