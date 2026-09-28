import { openRepository } from './adapters/repository-factory.js';
import { buildApp } from './api/app.js';
import { DriftService } from './core/service.js';

async function main() {
  const repository = await openRepository();
  const app = buildApp(new DriftService(repository));
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => void app.close());
  try {
    await app.listen({
      port: Number(process.env.PORT ?? 3000),
      host: process.env.HOST ?? '0.0.0.0',
    });
  } catch (error) {
    app.log.error(error);
    await app.close();
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
