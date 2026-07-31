# API reference

Use this reference when you need the exact HTTP inputs, outputs, defaults, authorization rules, or failure behavior for a Drift client. For a guided first request, use the [getting-started tutorial](../tutorial/getting-started.md).

The machine-readable OpenAPI document at `GET /v1/openapi.json` is the canonical, versioned HTTP contract for client generation, validation, and compatibility testing. This page explains that contract for human readers; when the two differ, treat the published OpenAPI document as authoritative and report the documentation defect.

## Contract guarantees

The following behavior is guaranteed across storage adapters for the `/v1` contract:

- Every graph and key-administration request uses `Authorization: Bearer <key>`.
- Drift derives the tenant and scopes from the key. A client never supplies `tenantId` for a graph operation.
- Request path, query, and body values are validated. Mutation bodies reject undeclared fields.
- Drift owns IDs, tenant ownership, versions, timestamps, and deletion markers.
- Graph reads cannot return another tenant's records, even when a caller supplies a valid foreign record ID.
- Normal reads exclude soft-deleted records. Only an admin key may request them or restore them.

The SQLite file format, SQL queries, and cursor encoding are adapter-specific implementation details. Clients must treat cursors as opaque and must not depend on SQLite representation.

## Routes and ownership

| Resource           | Operations                                                                                 | Required scope                                         |
| ------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Health             | `GET /health`                                                                              | none                                                   |
| OpenAPI            | `GET /v1/openapi.json`                                                                     | none                                                   |
| Vertices           | Collection and `/{id}` CRUD; `POST /v1/vertices/{id}/restore`                              | GET: read; create/mutate/delete: write; restore: admin |
| Edges              | Collection and `/{id}` CRUD; `POST /v1/edges/{id}/restore`                                 | GET: read; create/mutate/delete: write; restore: admin |
| Graph reads        | `GET /v1/vertices/{id}/in`, `/out`, `/neighbors`; `POST /v1/traverse`                      | read                                                   |
| Retrieval          | `POST /v1/retrieve`                                                                        | read                                                   |
| Key administration | `GET/POST /v1/admin/keys`, `DELETE /v1/admin/keys/{id}`, `POST /v1/admin/keys/{id}/rotate` | admin                                                  |

`read` permits active-record lists, record reads, adjacency, traversal, and retrieval. `write` permits create, patch, and soft-delete operations. `admin` includes both capabilities and adds key management, `includeDeleted=true`, and restore. The authenticated key owns the tenant context; a supplied resource ID never changes it.

## Health and readiness

`GET /health` requires no key and returns:

```json
{
  "status": "ok"
}
```

This confirms that the HTTP process can answer a request. It does not guarantee downstream client health, backup freshness, available disk capacity, or successful graph mutation. Operators should monitor those concerns separately.

## Create, update, delete, and restore

Create a vertex with `POST /v1/vertices` or an edge with `POST /v1/edges`. The [persisted model reference](./model.md) defines every client-owned and Drift-owned field.

PATCH replaces only the fields present in the body. PATCH, DELETE, and restore require the current positive integer `version`. For example, a complete vertex update request is:

```bash
curl -fsS -X PATCH "$DRIFT_URL/v1/vertices/$VERTEX_ID" \
  -H "Authorization: Bearer $DRIFT_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "version": 3,
    "title": "Renamed service",
    "status": "active"
  }'
```

A restore body contains only the version of the deleted record:

```json
{
  "version": 4
}
```

Successful create and mutation operations return the complete persisted record. A successful mutation increments `version`. Drift returns `409 Conflict` without applying the requested mutation when the supplied version is stale or the active/deleted state does not match the operation.

Deleting a vertex atomically soft-deletes its active incident edges. Restoring the vertex does not restore those edges; restore each edge explicitly after both endpoints are active. These are guaranteed service invariants, not SQLite conveniences.

## Lists and deleted data

`GET /v1/vertices` accepts `type`, `status`, `limit`, `cursor`, and `includeDeleted`. `GET /v1/edges` accepts the same values plus `fromVertexId` and `toVertexId`.

| Input            | Default | Contract                                                              |
| ---------------- | ------- | --------------------------------------------------------------------- |
| `limit`          | `50`    | Integer from `1` through `100`.                                       |
| `cursor`         | omitted | Opaque continuation value from the preceding page's `nextCursor`.     |
| `includeDeleted` | `false` | `true` requires admin scope.                                          |
| filters          | omitted | Each supplied filter narrows records inside the authenticated tenant. |

Results use deterministic ID order and return this shape:

```json
{
  "items": [],
  "nextCursor": null
}
```

`nextCursor` is `null` when no later page exists. Clients may retain a cursor only as a continuation token; they must not parse, edit, or infer ordering semantics from it.

## Adjacency and traversal

The `/in`, `/out`, and `/neighbors` routes perform depth-one reads from a vertex. Their optional `edgeType` narrows relationships, `limit` defaults to `100` and accepts `1` through `500`, and `includeDeleted` defaults to `false`.

`POST /v1/traverse` performs a bounded graph walk:

```bash
curl -fsS -X POST "$DRIFT_URL/v1/traverse" \
  -H "Authorization: Bearer $DRIFT_KEY" \
  -H 'content-type: application/json' \
  -d "{
    \"start\": \"$VERTEX_ID\",
    \"direction\": \"out\",
    \"edgeTypes\": [\"contains\", \"runs\"],
    \"vertexTypes\": [\"service\"],
    \"depth\": 2,
    \"limit\": 100,
    \"includeDeleted\": false
  }"
```

`start`, `direction`, `depth`, and `limit` are required. `direction` is `in`, `out`, or `both`; `depth` is `1` through `5`; and `limit` is `1` through `500`. Type filters are optional. The output is `{ "vertices": [...], "edges": [...] }`, bounded independently to the requested limit. An unavailable start vertex returns `404`; invalid input fails validation; and a configured server ceiling exceeded by a core caller returns `422 limit_exceeded`.

## Declarative retrieval

Use `POST /v1/retrieve` when the service should project or aggregate one bounded collection without transferring every full record. It reads either `vertices` or `edges`, filters first-class fields, projects rows, groups, aggregates, sorts, and limits the result. See [why retrieval is declarative](../explanation/retrieval.md) for the processing model and design constraints.

```bash
curl -fsS -X POST "$DRIFT_URL/v1/retrieve" \
  -H "Authorization: Bearer $DRIFT_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "source": "vertices",
    "filters": {
      "type": "device",
      "status": "active"
    },
    "projection": [
      {
        "field": "type"
      },
      {
        "field": "data.cost",
        "as": "cost"
      }
    ],
    "groupBy": ["type"],
    "aggregates": [
      {
        "op": "count",
        "as": "count"
      },
      {
        "op": "sum",
        "field": "cost",
        "as": "totalCost"
      }
    ],
    "sort": [
      {
        "field": "type",
        "direction": "asc"
      }
    ],
    "limit": 100,
    "includeDeleted": false
  }'
```

Only `source` is required. `limit` defaults to `100` and accepts `1` through `1,000`; `includeDeleted` defaults to `false`; omitted sort direction is ascending. Allowed aggregate operators are `count`, `sum`, `min`, `max`, and `avg`. Explicit `data.*` and `metadata.*` paths may be projected but not filtered or grouped.

The response contains `rows` and `scanned`. `scanned` is the number of tenant-owned source records considered, not the number of rows returned. Default server ceilings are 5,000 scanned records, 1,000 groups, 1,000 result rows, and a cooperative 250 ms budget. Exceeding a ceiling returns `422 limit_exceeded`; no result is persisted.

Retrieval cannot execute code, join sources, traverse relationships, create jobs, or persist its results. Automation may safely construct a request from explicit fields and operations. It must not infer grouping, financial meaning, retention policy, or other business decisions from field names.

## Key administration

Admin routes always operate inside the calling key's tenant. `POST /v1/admin/keys` and rotation require a non-empty `label` and at least one explicit scope. They return key metadata plus a raw `secret` exactly once. List responses never contain a secret.

Rotation immediately revokes the old key and creates a replacement; revocation is also immediate and cannot be undone. These calls do not modify graph records. Use the [tenant and key tutorial](../tutorial/administering-tenants-and-keys.md) for a coordinated operational sequence.

## Error responses

Errors use this envelope:

```json
{
  "error": {
    "code": "conflict",
    "message": "Vertex was changed, deleted, or not found"
  }
}
```

`details` may be present for additional machine-readable context. Clients should branch on HTTP status and `error.code`, not the human message.

| Status | Meaning and recovery                                                                    |
| ------ | --------------------------------------------------------------------------------------- |
| `400`  | Malformed request. Correct the transport input; do not retry unchanged.                 |
| `401`  | Missing, malformed, revoked, or invalid key. Replace or correct the credential.         |
| `403`  | The authenticated key lacks the required scope. Do not infer or broaden scopes.         |
| `404`  | The active resource is unavailable in this tenant. Do not infer cross-tenant existence. |
| `409`  | Optimistic-concurrency or state conflict. Re-read the record before deciding a retry.   |
| `422`  | A bounded-query limit was exceeded. Narrow the request or lower its requested bound.    |
| `500`  | Unexpected server failure. Treat the mutation outcome as unknown until verified.        |
