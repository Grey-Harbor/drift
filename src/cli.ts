import { openRepository } from './adapters/repository-factory.js';
import { migrateSqliteToPostgres } from './adapters/postgres/sqlite-import.js';
import { DriftService } from './core/service.js';
const [command, ...args] = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

async function main() {
  if (command === 'migrate-data') {
    const connectionString = process.env.DRIFT_POSTGRES_URL;
    if (!connectionString) throw new Error('DRIFT_POSTGRES_URL is required for migrate-data');
    const result = await migrateSqliteToPostgres(
      process.env.DRIFT_DATABASE_PATH ?? './data/drift.sqlite',
      connectionString,
    );
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const repository = await openRepository();
  const service = new DriftService(repository);
  try {
    if (command === 'migrate') console.log('Migrations applied.');
    else if (command === 'bootstrap') {
      const slug = option('--slug'),
        name = option('--name');
      if (!slug || !name)
        throw new Error(
          'Usage: npm run cli -- bootstrap --slug <slug> --name <name> [--label <label>]',
        );
      const result = await service.bootstrap(slug, name, option('--label') ?? 'bootstrap admin');
      console.log(JSON.stringify(result, null, 2));
    } else throw new Error('Usage: drift <migrate|migrate-data|bootstrap>');
  } finally {
    await service.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
