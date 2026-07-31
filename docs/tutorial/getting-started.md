# Getting started: model a small commerce graph

Use this tutorial when you want to learn Drift by building and querying a complete graph. You will create an Acme Inc. tenant, start Drift, store a product and an invoice, connect them, traverse the relationship, and calculate a small aggregate. The invoice records an Anvil purchased by Wile E. Coyote. The tutorial uses `curl` so the API remains visible.

## 1. Install, bootstrap, and run

```bash
npm install
npm run cli -- bootstrap --slug acme --name "Acme Inc."
npm run dev
```

The bootstrap command creates the `acme` tenant and its first admin key, then prints that key's secret once. Copy it into a shell variable before it disappears from your terminal history:

```bash
export DRIFT_KEY='drift_<prefix>.<secret>'
export DRIFT_URL='http://localhost:3000'
```

Bootstrap with a different unique slug creates another isolated tenant; bootstrap with `acme` again fails instead of making another key. Read [tenants, bootstrap, and API keys](../explanation/tenancy-and-api-keys.md) for the complete relationship and the correct way to add keys to an existing tenant.

Check the service:

```bash
curl "$DRIFT_URL/health"
```

## 2. Create a product vertex

A vertex is a typed thing. Keep common display and lifecycle fields at the top level; place evolving product-specific fields in `data`.

```bash
PRODUCT_ID="$(curl -fsS -X POST "$DRIFT_URL/v1/vertices" \
  -H "Authorization: Bearer $DRIFT_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "type": "product",
    "slug": "anvil",
    "title": "Acme Anvil",
    "data": {
      "sku": "ACME-ANVIL-001",
      "unitPrice": 99.95
    },
    "metadata": {
      "source": "catalog"
    }
  }' | jq -r '.id')"

echo "$PRODUCT_ID"
```

This command requires [`jq`](https://jqlang.org/) and saves the returned ID in `PRODUCT_ID` for later commands. If `jq` is unavailable, run the `curl` command without the surrounding `PRODUCT_ID="$(...)"` and `| jq -r '.id'`, then copy the response's `id` into your shell:

```bash
export PRODUCT_ID='the-returned-product-id'
```

## 3. Create an invoice vertex

```bash
INVOICE_ID="$(curl -fsS -X POST "$DRIFT_URL/v1/vertices" \
  -H "Authorization: Bearer $DRIFT_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "type": "invoice",
    "slug": "acme-1001",
    "title": "Invoice ACME-1001",
    "data": {
      "number": "ACME-1001",
      "customer": "Wile E. Coyote",
      "total": 99.95
    },
    "metadata": {
      "source": "sales"
    }
  }' | jq -r '.id')"

echo "$INVOICE_ID"
```

The invoice ID is now available to the edge and traversal commands below. Without `jq`, copy the response's `id` as described for `PRODUCT_ID`:

```bash
export INVOICE_ID='the-returned-invoice-id'
```

## 4. Connect the graph

Edges are typed, directed relationships. Drift verifies that both endpoints are active and belong to the API key's tenant.

```bash
curl -fsS -X POST "$DRIFT_URL/v1/edges" \
  -H "Authorization: Bearer $DRIFT_KEY" \
  -H 'content-type: application/json' \
  -d "{
    \"fromVertexId\": \"$PRODUCT_ID\",
    \"toVertexId\": \"$INVOICE_ID\",
    \"type\": \"appears_on\",
    \"data\": {
      \"quantity\": 1,
      \"unitPrice\": 99.95
    }
  }"
```

## 5. Traverse from the product

```bash
curl -sS -X POST "$DRIFT_URL/v1/traverse" \
  -H "Authorization: Bearer $DRIFT_KEY" \
  -H 'content-type: application/json' \
  -d "{
    \"start\": \"$PRODUCT_ID\",
    \"direction\": \"out\",
    \"edgeTypes\": [\"appears_on\"],
    \"depth\": 1,
    \"limit\": 20,
    \"includeDeleted\": false
  }"
```

The result contains the Acme Anvil product, its invoice, and the `appears_on` edge.

## 6. Retrieve an aggregate

`/retrieve` is an optional, declarative read method. This query counts vertices by type without shipping every full record to the client.

```bash
curl -sS -X POST "$DRIFT_URL/v1/retrieve" \
  -H "Authorization: Bearer $DRIFT_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "source": "vertices",
    "projection": [
      {
        "field": "type"
      }
    ],
    "groupBy": ["type"],
    "aggregates": [
      {
        "op": "count",
        "as": "count"
      }
    ],
    "sort": [
      {
        "field": "type",
        "direction": "asc"
      }
    ],
    "includeDeleted": false
  }'
```

Next, read the [model reference](../reference/model.md) to understand which fields are persisted and the [API reference](../reference/api.md) for updates, deletion, key management, and failure responses.

## 7. Clean up the tutorial data

The tutorial creates only records in Drift's local SQLite database. It does not create containers, DNS entries, files, or other external resources.

To remove the graph from ordinary reads, soft-delete the product and invoice vertices. A newly created vertex has version `1`; deleting the product also soft-deletes its active `appears_on` edge.

```bash
curl -fsS -X DELETE "$DRIFT_URL/v1/vertices/$PRODUCT_ID" \
  -H "Authorization: Bearer $DRIFT_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "version": 1
  }'

curl -fsS -X DELETE "$DRIFT_URL/v1/vertices/$INVOICE_ID" \
  -H "Authorization: Bearer $DRIFT_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "version": 1
  }'
```

Soft-deleted records remain available to an admin key with `includeDeleted=true` and may be restored. If this is a disposable local installation and you want to remove the tenant, API key, and all tutorial records entirely, stop Drift and delete the local database file:

```bash
rm -rf data
```

The default database path is `./data/drift.sqlite`; do not use this reset command for an installation that contains data you want to keep.
