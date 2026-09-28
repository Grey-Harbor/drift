import pg, { type PoolClient, type QueryResultRow } from 'pg';

const { Pool } = pg;

export type PostgresPool = InstanceType<typeof Pool>;
export interface PostgresQueryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<R>>;
}

export function createPostgresPool(connectionString: string): PostgresPool {
  const pool = new Pool({ connectionString, max: 10 });
  pool.on('error', (error) => {
    console.error('Unexpected PostgreSQL pool error', error);
  });
  return pool;
}

export async function withTransaction<T>(
  pool: PostgresPool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
