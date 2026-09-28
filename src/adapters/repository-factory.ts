import type { DriftRepository } from '../interfaces/repository.js';
import { PostgresDriftRepository } from './postgres/repository.js';
import { SqliteDriftRepository } from './sqlite/repository.js';

export type DriftStorage = 'sqlite' | 'postgres';

export async function openRepository(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<DriftRepository> {
  const storage = environment.DRIFT_STORAGE ?? 'sqlite';
  if (storage === 'sqlite')
    return new SqliteDriftRepository(environment.DRIFT_DATABASE_PATH ?? './data/drift.sqlite');
  if (storage === 'postgres') {
    const connectionString = environment.DRIFT_POSTGRES_URL;
    if (!connectionString) throw new Error('DRIFT_POSTGRES_URL is required in postgres mode');
    return await PostgresDriftRepository.open(connectionString);
  }
  throw new Error(`Unsupported DRIFT_STORAGE value: ${storage}`);
}
