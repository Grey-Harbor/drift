# Getting started

Install dependencies, create a local database, bootstrap a tenant, then start Drift:

```bash
npm install
npm run cli -- bootstrap --slug acme --name "Acme Inc."
npm run dev
```

Save the displayed key: Drift never shows it again. Create a vertex with it:

```bash
curl -X POST http://localhost:3000/v1/vertices \
  -H "Authorization: Bearer $DRIFT_KEY" -H 'content-type: application/json' \
  -d '{"type":"device","title":"Wally","data":{"ip":"10.0.0.10"}}'
```

Continue with the [API reference](../reference/api.md) to connect vertices and traverse the graph.
