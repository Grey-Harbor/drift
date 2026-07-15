import type Database from 'better-sqlite3';
import type { ListOptions, Page, TraverseInput } from '../../contracts/types.js';
import { decodeCursor, encodeCursor } from './mappers.js';

export type GraphTable = 'vertices' | 'edges';

/**
 * Low-level SQL bridge for graph tables. It intentionally knows table and
 * column names, but no Drift domain behavior or TypeScript domain models.
 */
export class SqliteGraphStore {
  constructor(private readonly db: Database.Database) {}

  list<T>(
    table: GraphTable,
    map: (row: unknown) => T,
    tenantId: string,
    options: ListOptions,
  ): Page<T> {
    const where = ['tenant_id=@tenantId'];
    const parameters: Record<string, unknown> = { tenantId, limit: options.limit + 1 };
    if (!options.includeDeleted) where.push('deleted_at IS NULL');
    if (options.type) addFilter(where, parameters, 'type', options.type);
    if (options.status) addFilter(where, parameters, 'status', options.status);
    if (table === 'edges') addEdgeFilters(where, parameters, options);

    const cursor = decodeCursor(options.cursor);
    if (cursor) addFilter(where, parameters, 'id>@cursor', cursor, 'cursor');

    const rows = this.db
      .prepare(`SELECT * FROM ${table} WHERE ${where.join(' AND ')} ORDER BY id ASC LIMIT @limit`)
      .all(parameters);
    const items = rows.slice(0, options.limit).map(map);
    return {
      items,
      nextCursor:
        rows.length > options.limit ? encodeCursor((items.at(-1) as { id: string }).id) : null,
    };
  }

  update<T>(
    table: GraphTable,
    map: (row: unknown) => T,
    tenantId: string,
    id: string,
    version: number,
    columns: Record<string, unknown>,
    updatedAt: string,
    current: () => T | null,
  ): T | null {
    const assignments = Object.keys(columns).map((column) => `${column}=@${column}`);
    if (!assignments.length) return current();

    assignments.push('updated_at=@updatedAt', 'version=version+1');
    const row = this.db
      .prepare(
        `UPDATE ${table} SET ${assignments.join(',')} WHERE tenant_id=@tenantId AND id=@id AND deleted_at IS NULL AND version=@version RETURNING *`,
      )
      .get({ ...columns, tenantId, id, version, updatedAt });
    return row ? map(row) : null;
  }

  findConnected<T>(
    map: (row: unknown) => T,
    tenantId: string,
    vertexIds: string[],
    direction: TraverseInput['direction'],
    edgeTypes: string[] | undefined,
    includeDeleted: boolean,
  ): T[] {
    if (!vertexIds.length) return [];
    const placeholders = vertexIds.map(() => '?').join(',');
    const endpointClause = endpointWhereClause(direction, placeholders);
    const endpointParameters = direction === 'both' ? [...vertexIds, ...vertexIds] : vertexIds;
    let sql = `SELECT * FROM edges WHERE tenant_id=? AND ${endpointClause}`;
    if (!includeDeleted) sql += ' AND deleted_at IS NULL';
    if (edgeTypes?.length) sql += ` AND type IN (${edgeTypes.map(() => '?').join(',')})`;
    return this.db
      .prepare(sql)
      .all(tenantId, ...endpointParameters, ...(edgeTypes ?? []))
      .map(map);
  }
}

function addFilter(
  where: string[],
  parameters: Record<string, unknown>,
  expression: string,
  value: string,
  parameter = expression,
) {
  where.push(expression.includes('@') ? expression : `${expression}=@${parameter}`);
  parameters[parameter] = value;
}

function addEdgeFilters(
  where: string[],
  parameters: Record<string, unknown>,
  options: ListOptions,
) {
  if (options.fromVertexId) addFilter(where, parameters, 'from_vertex_id', options.fromVertexId);
  if (options.toVertexId) addFilter(where, parameters, 'to_vertex_id', options.toVertexId);
}

function endpointWhereClause(direction: TraverseInput['direction'], placeholders: string) {
  if (direction === 'out') return `from_vertex_id IN (${placeholders})`;
  if (direction === 'in') return `to_vertex_id IN (${placeholders})`;
  return `(from_vertex_id IN (${placeholders}) OR to_vertex_id IN (${placeholders}))`;
}
