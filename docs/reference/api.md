# API reference

All graph requests use `Authorization: Bearer <key>` and live under `/v1`.

| Resource           | Operations                                                                             |
| ------------------ | -------------------------------------------------------------------------------------- |
| Vertices           | `POST/GET /vertices`, `GET/PATCH/DELETE /vertices/{id}`, `POST /vertices/{id}/restore` |
| Edges              | `POST/GET /edges`, `GET/PATCH/DELETE /edges/{id}`, `POST /edges/{id}/restore`          |
| Graph reads        | `GET /vertices/{id}/in`, `/out`, `/neighbors`; `POST /traverse`                        |
| Retrieval          | `POST /retrieve`                                                                       |
| Key administration | `GET/POST /admin/keys`, `DELETE /admin/keys/{id}`, `POST /admin/keys/{id}/rotate`      |

PATCH and DELETE bodies include the current `version`. A stale write returns `409`. Standard collection filters are `type`, `status`, `limit`, `cursor`, and edge endpoint IDs. Administrators can use `includeDeleted=true` and restore one resource at a time.

`POST /retrieve` accepts a `source` (`vertices` or `edges`), first-class filters, projected fields, optional group keys, aggregates, sorting, and a result limit. It is a bounded synchronous data-retrieval API; it does not run client code.

The machine-readable contract is available at `GET /v1/openapi.json`.
