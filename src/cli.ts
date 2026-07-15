import { SqliteDriftRepository } from './adapters/sqlite/repository.js';
import { DriftService } from './core/service.js';
const [command, ...args] = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const repo = new SqliteDriftRepository(process.env.DRIFT_DATABASE_PATH ?? './data/drift.sqlite');
if (command === 'migrate') console.log('Migrations applied.');
else if (command === 'bootstrap') {
  const slug = option('--slug'),
    name = option('--name');
  if (!slug || !name)
    throw new Error(
      'Usage: npm run cli -- bootstrap --slug <slug> --name <name> [--label <label>]',
    );
  const result = new DriftService(repo).bootstrap(
    slug,
    name,
    option('--label') ?? 'bootstrap admin',
  );
  console.log(JSON.stringify(result, null, 2));
} else throw new Error('Usage: drift <migrate|bootstrap>');
