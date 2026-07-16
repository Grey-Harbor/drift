# Getting started: model a small service graph

This tutorial creates a tenant, starts Drift, stores a host and a service, connects them, traverses the relationship, and calculates a small aggregate. It uses `curl` so the API remains visible.

## 1. Install, bootstrap, and run

```bash
npm install
npm run cli -- bootstrap --slug homelab --name "Home Lab"
npm run dev
```

The bootstrap command prints a secret once. Copy it into a shell variable before it disappears from your terminal history:

```bash
export DRIFT_KEY='drift_<prefix>.<secret>'
export DRIFT_URL='http://localhost:3000'
```

Check the service:

```bash
curl "$DRIFT_URL/health"
```

## 2. Create a host vertex

A vertex is a typed thing. Keep common display and lifecycle fields at the top level; place evolving product-specific fields in `data`.

```bash
HOST_ID="$(curl -fsS -X POST "$DRIFT_URL/v1/vertices" \
  -H "Authorization: Bearer $DRIFT_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "type": "host",
    "slug": "wally",
    "title": "Wally",
    "data": { "ip": "10.0.0.10", "cores": 8 },
    "metadata": { "source": "manual" }
  }' | jq -r '.id')"

echo "$HOST_ID"
```

This command requires [`jq`](https://jqlang.org/) and saves the returned ID in `HOST_ID` for later commands. If `jq` is unavailable, run the `curl` command without the surrounding `HOST_ID="$(...)"` and `| jq -r '.id'`, then copy the response's `id` into your shell:

```bash
export HOST_ID='the-returned-host-id'
```

## 3. Create a service vertex

```bash
SERVICE_ID="$(curl -fsS -X POST "$DRIFT_URL/v1/vertices" \
  -H "Authorization: Bearer $DRIFT_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "type": "service",
    "slug": "gitea",
    "title": "Gitea",
    "data": { "port": 3000, "replicas": 1 },
    "metadata": { "source": "manual" }
  }' | jq -r '.id')"

echo "$SERVICE_ID"
```

The service ID is now available to the edge and traversal commands below. Without `jq`, copy the response's `id` as described for `HOST_ID`:

```bash
export SERVICE_ID='the-returned-service-id'
```

## 4. Connect the graph

Edges are typed, directed relationships. Drift verifies that both endpoints are active and belong to the API key's tenant.

```bash
curl -fsS -X POST "$DRIFT_URL/v1/edges" \
  -H "Authorization: Bearer $DRIFT_KEY" \
  -H 'content-type: application/json' \
  -d "{
    \"fromVertexId\": \"$HOST_ID\",
    \"toVertexId\": \"$SERVICE_ID\",
    \"type\": \"runs\",
    \"data\": { \"runtime\": \"container\" }
  }"
```

## 5. Traverse from the host

```bash
curl -sS -X POST "$DRIFT_URL/v1/traverse" \
  -H "Authorization: Bearer $DRIFT_KEY" \
  -H 'content-type: application/json' \
  -d "{
    \"start\": \"$HOST_ID\",
    \"direction\": \"out\",
    \"edgeTypes\": [\"runs\"],
    \"depth\": 1,
    \"limit\": 20,
    \"includeDeleted\": false
  }"
```

The result contains the start host, the Gitea vertex, and the `runs` edge.

## 6. Retrieve an aggregate

`/retrieve` is an optional, declarative read method. This query counts vertices by type without shipping every full record to the client.

```bash
curl -sS -X POST "$DRIFT_URL/v1/retrieve" \
  -H "Authorization: Bearer $DRIFT_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "source": "vertices",
    "projection": [{ "field": "type" }],
    "groupBy": ["type"],
    "aggregates": [{ "op": "count", "as": "count" }],
    "sort": [{ "field": "type", "direction": "asc" }],
    "includeDeleted": false
  }'
```

Next, read the [model reference](../reference/model.md) to understand which fields are persisted and the [API reference](../reference/api.md) for updates, deletion, key management, and failure responses.

## 7. Clean up the tutorial data

The tutorial creates only records in Drift's local SQLite database. It does not create containers, DNS entries, files, or other external resources.

To remove the graph from ordinary reads, soft-delete the host and service vertices. A newly created vertex has version `1`; deleting the host also soft-deletes its active `runs` edge.

```bash
curl -fsS -X DELETE "$DRIFT_URL/v1/vertices/$HOST_ID" \
  -H "Authorization: Bearer $DRIFT_KEY" \
  -H 'content-type: application/json' \
  -d '{ "version": 1 }'

curl -fsS -X DELETE "$DRIFT_URL/v1/vertices/$SERVICE_ID" \
  -H "Authorization: Bearer $DRIFT_KEY" \
  -H 'content-type: application/json' \
  -d '{ "version": 1 }'
```

Soft-deleted records remain available to an admin key with `includeDeleted=true` and may be restored. If this is a disposable local installation and you want to remove the tenant, API key, and all tutorial records entirely, stop Drift and delete the local database file:

```bash
rm -rf data
```

The default database path is `./data/drift.sqlite`; do not use this reset command for an installation that contains data you want to keep.
