import { SqliteDriftRepository } from './adapters/sqlite/repository.js';
import { buildApp } from './api/app.js';
import { DriftService } from './core/service.js';
const repo = new SqliteDriftRepository(process.env.DRIFT_DATABASE_PATH ?? './data/drift.sqlite');
const app = buildApp(new DriftService(repo));
app
  .listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '0.0.0.0' })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
