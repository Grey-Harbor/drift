# Tutorial: administer tenants and API keys

Use this tutorial when you need to learn Drift's administration model before managing real credentials. You will create two isolated tenants, use an admin key to issue a narrower service key, rotate it, and revoke a disposable key.

Drift v1 does not expose a tenant-management HTTP API. Creating a tenant is an operator action through `bootstrap`; managing API keys inside an existing tenant is an admin-key API action.

## Before you begin

Start Drift locally or with Docker, then set its URL:

```bash
export DRIFT_URL='http://localhost:3000'
```

The examples use [`jq`](https://jqlang.org/) to read JSON response fields.

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

Running bootstrap again with `--slug acme` fails. It never issues an extra key for an existing tenant. That rule prevents accidental reinitialization; use the admin API below to create or rotate Acme keys.

## 2. Inspect the tenant's key metadata

An admin key may list keys owned by its own tenant. The response contains metadata only—never a recoverable secret:

```bash
curl -fsS "$DRIFT_URL/v1/admin/keys" \
  -H "Authorization: Bearer $ACME_ADMIN_KEY" | jq
```

The bootstrap key appears with `admin` scope. It cannot list Northwind keys because the tenant comes from the Acme credential, not from a request parameter.

## 3. Issue a client-service key

Create a key for a client service that needs graph reads and writes but no key administration:

```bash
SERVICE_KEY_RESPONSE="$(curl -fsS -X POST "$DRIFT_URL/v1/admin/keys" \
  -H "Authorization: Bearer $ACME_ADMIN_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "label": "inventory-service",
    "scopes": ["read", "write"]
  }')"

export SERVICE_KEY_ID="$(printf '%s' "$SERVICE_KEY_RESPONSE" | jq -r '.apiKey.id')"
export SERVICE_KEY="$(printf '%s' "$SERVICE_KEY_RESPONSE" | jq -r '.secret')"
```

Store `SERVICE_KEY` in the client service's secret store. It is returned once only. The service key can create and query Acme graph data, but it receives `403 Forbidden` if it calls `/v1/admin/keys`.

## 4. Rotate a service key

Rotation revokes the old key and returns a replacement key with the requested label and scopes. Update the client service with the new secret before it needs to make another request:

```bash
ROTATED_KEY_RESPONSE="$(curl -fsS -X POST "$DRIFT_URL/v1/admin/keys/$SERVICE_KEY_ID/rotate" \
  -H "Authorization: Bearer $ACME_ADMIN_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "label": "inventory-service",
    "scopes": ["read", "write"]
  }')"

export SERVICE_KEY="$(printf '%s' "$ROTATED_KEY_RESPONSE" | jq -r '.secret')"
```

The key returned in step 3 is now revoked and cannot authenticate. Treat rotation as a coordinated deployment action: distribute the new secret, then confirm the service is healthy.

## 5. Revoke a disposable key

To revoke a key that is no longer needed, use its ID. This example creates a short-lived reporting key and immediately revokes it:

```bash
TEMPORARY_KEY_ID="$(curl -fsS -X POST "$DRIFT_URL/v1/admin/keys" \
  -H "Authorization: Bearer $ACME_ADMIN_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "label": "temporary-report",
    "scopes": ["read"]
  }' | jq -r '.apiKey.id')"

curl -fsS -X DELETE "$DRIFT_URL/v1/admin/keys/$TEMPORARY_KEY_ID" \
  -H "Authorization: Bearer $ACME_ADMIN_KEY"
```

Revocation is immediate and does not affect graph records. An already revoked key cannot be restored; create a new key if a client needs access again.

## What this tutorial established

- `acme` and `northwind` are separate tenants with separate initial admin keys.
- An API key always determines the tenant for its request.
- Bootstrap creates a new tenant; admin endpoints manage keys within an existing one.
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

Continue with the [getting-started graph tutorial](./getting-started.md) to create tenant-scoped vertices and edges, or see [tenants, bootstrap, and API keys](../explanation/tenancy-and-api-keys.md) for the model behind these commands.
