import { SqliteDriftRepository } from '../src/adapters/sqlite/repository.js';
import { runRepositoryConformance } from './support/repository-conformance.js';

runRepositoryConformance('SQLite', async () => new SqliteDriftRepository(':memory:'));
