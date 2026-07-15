# Run Drift with Docker

Start a persistent local instance:

```bash
docker compose up --build
```

The Compose volume stores the SQLite database. Bootstrap a tenant before clients use the API:

```bash
docker compose exec drift node dist/cli.js bootstrap --slug acme --name Acme
```

Back up the volume/database while the service is stopped, or use SQLite's online backup tooling for production operations.
