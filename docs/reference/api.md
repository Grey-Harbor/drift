# API reference

All graph requests use `Authorization: Bearer <key>` and live under `/v1`. The tenant is derived from that key; graph request bodies do not contain `tenantId`.

Drift publishes its HTTP contract using the [OpenAPI Specification](https://spec.openapis.org/oas/latest.html). The machine-readable OpenAPI document at `GET /v1/openapi.json` is the versioned API-contract artifact for client generation, validation, and compatibility testing.

Every `/v1` route validates its path, query, and body against that contract. Write
requests reject undeclared fields; identifiers, tenant ownership, versions, timestamps,
and deletion markers are always managed by Drift.

## Routes

| Resource           | Operations                                                                             |
| ------------------ | -------------------------------------------------------------------------------------- |
| Health             | `GET /health`                                                                          |
| Vertices           | `POST/GET /vertices`, `GET/PATCH/DELETE /vertices/{id}`, `POST /vertices/{id}/restore` |
| Edges              | `POST/GET /edges`, `GET/PATCH/DELETE /edges/{id}`, `POST /edges/{id}/restore`          |
| Graph reads        | `GET /vertices/{id}/in`, `/out`, `/neighbors`; `POST /traverse`                        |
| Retrieval          | `POST /retrieve`                                                                       |
| Key administration | `GET/POST /admin/keys`, `DELETE /admin/keys/{id}`, `POST /admin/keys/{id}/rotate`      |

`GET /v1/openapi.json` returns the machine-readable OpenAPI contract.

## Scopes

| Scope   | Allowed operations                                                           |
| ------- | ---------------------------------------------------------------------------- |
| `read`  | Lists, record reads, adjacency, traversal, and retrieval of active data.     |
| `write` | Create, patch, and soft-delete vertices and edges.                           |
| `admin` | Read/write plus key management, `includeDeleted=true`, and explicit restore. |

## Create and update

Create a vertex with `POST /v1/vertices` and an edge with `POST /v1/edges`. Field definitions are in the [model reference](./model.md).

PATCH and DELETE requests must include the current `version`:

```json
{ "version": 3, "title": "Renamed service", "status": "active" }
```

The same version requirement applies to restore requests:

```json
{ "version": 4 }
```

The service returns `409 Conflict` when the record was modified, deleted, restored, or otherwise changed since the client read its version.

## Lists and deleted data

`GET /v1/vertices` accepts `type`, `status`, `limit`, `cursor`, and `includeDeleted`. `GET /v1/edges` accepts those filters plus `fromVertexId` and `toVertexId`. Results are ordered by ID and return an opaque `nextCursor` when another page exists.

Normal reads always exclude soft-deleted records. Only an admin key may set `includeDeleted=true` or call a restore endpoint.

## Traversal

`POST /v1/traverse` accepts a constrained graph walk:

```json
{
  "start": "vertex-id",
  "direction": "out",
  "edgeTypes": ["contains", "runs"],
  "vertexTypes": ["service"],
  "depth": 2,
  "limit": 100,
  "includeDeleted": false
}
```

`direction` is `in`, `out`, or `both`. The server caps depth and results. The convenience adjacency routes perform depth-one reads from a vertex.

## Declarative retrieval

`POST /v1/retrieve` is a synchronous alternative to lists and traversal. It reads either `vertices` or `edges`, first filters by `type`, `status`, or explicit `ids`, then projects, groups, aggregates, sorts, and limits bounded results. The server caps a request at 5,000 scanned records, 1,000 groups, 1,000 results, and a cooperative 250 ms budget.

```json
{
  "source": "vertices",
  "filters": { "type": "device", "status": "active" },
  "projection": [{ "field": "type" }, { "field": "data.cost", "as": "cost" }],
  "groupBy": ["type"],
  "aggregates": [
    { "op": "count", "as": "count" },
    { "op": "sum", "field": "cost", "as": "totalCost" }
  ],
  "sort": [{ "field": "type", "direction": "asc" }],
  "limit": 100,
  "includeDeleted": false
}
```

Allowed aggregate operators are `count`, `sum`, `min`, `max`, and `avg`. Explicit `data.*` and `metadata.*` paths may be projected, but not filtered or grouped. Retrieval cannot execute code, join sources, traverse relationships, create jobs, or persist its results.

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

Common statuses are `401` invalid/missing key, `403` insufficient scope, `404` unavailable active resource, `409` optimistic-concurrency conflict, and `422` query limit exceeded.
