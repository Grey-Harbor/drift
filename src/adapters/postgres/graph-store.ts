import type { ListOptions, Page, TraverseInput } from '../../contracts/types.js';
import type { PostgresQueryable } from './connection.js';
import { decodeCursor, encodeCursor } from './mappers.js';

export type GraphTable = 'vertices' | 'edges';

export class PostgresGraphStore {
  constructor(private readonly db: PostgresQueryable) {}

  async list<T>(
    table: GraphTable,
    map: (row: unknown) => T,
    tenantId: string,
    options: ListOptions,
  ): Promise<Page<T>> {
    const values: unknown[] = [tenantId];
    const parameter = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    const where = ['tenant_id=$1'];
    if (!options.includeDeleted) where.push('deleted_at IS NULL');
    if (options.type) where.push(`type=${parameter(options.type)}`);
    if (options.status) where.push(`status=${parameter(options.status)}`);
    if (options.ids?.length) where.push(`id::text=ANY(${parameter(options.ids)}::text[])`);
    if (table === 'edges') {
      if (options.fromVertexId)
        where.push(`from_vertex_id::text=${parameter(options.fromVertexId)}`);
      if (options.toVertexId) where.push(`to_vertex_id::text=${parameter(options.toVertexId)}`);
    }
    const cursor = decodeCursor(options.cursor);
    if (cursor) where.push(`id::text>${parameter(cursor)}`);
    const limit = parameter(options.limit + 1);
    const rows = (
      await this.db.query(
        `SELECT * FROM ${table} WHERE ${where.join(' AND ')} ORDER BY id::text ASC LIMIT ${limit}`,
        values,
      )
    ).rows;
    const items = rows.slice(0, options.limit).map(map);
    return {
      items,
      nextCursor:
        rows.length > options.limit ? encodeCursor((items.at(-1) as { id: string }).id) : null,
    };
  }

  async update<T>(
    table: GraphTable,
    map: (row: unknown) => T,
    tenantId: string,
    id: string,
    version: number,
    columns: Record<string, unknown>,
    updatedAt: string,
  ): Promise<T | null> {
    if (!Object.keys(columns).length) {
      const current = await this.db.query(
        `SELECT * FROM ${table}
         WHERE tenant_id=$1 AND id::text=$2 AND deleted_at IS NULL AND version=$3`,
        [tenantId, id, version],
      );
      return current.rows[0] ? map(current.rows[0]) : null;
    }
    const values: unknown[] = [];
    const assignments = Object.entries(columns).map(([column, value]) => {
      values.push(value);
      const cast = column === 'data' || column === 'metadata' ? '::jsonb' : '';
      return `${column}=$${values.length}${cast}`;
    });
    values.push(updatedAt, tenantId, id, version);
    assignments.push(`updated_at=$${values.length - 3}`, 'version=version+1');
    const result = await this.db.query(
      `UPDATE ${table} SET ${assignments.join(',')} WHERE tenant_id=$${values.length - 2} AND id::text=$${values.length - 1} AND deleted_at IS NULL AND version=$${values.length} RETURNING *`,
      values,
    );
    return result.rows[0] ? map(result.rows[0]) : null;
  }

  async findConnected<T>(
    map: (row: unknown) => T,
    tenantId: string,
    vertexIds: string[],
    direction: TraverseInput['direction'],
    edgeTypes: string[] | undefined,
    includeDeleted: boolean,
    limit: number,
  ): Promise<T[]> {
    if (!vertexIds.length) return [];
    const values: unknown[] = [tenantId, vertexIds];
    const endpoint =
      direction === 'out'
        ? 'from_vertex_id::text=ANY($2::text[])'
        : direction === 'in'
          ? 'to_vertex_id::text=ANY($2::text[])'
          : '(from_vertex_id::text=ANY($2::text[]) OR to_vertex_id::text=ANY($2::text[]))';
    const where = ['tenant_id=$1', endpoint];
    if (!includeDeleted) where.push('deleted_at IS NULL');
    if (edgeTypes?.length) {
      values.push(edgeTypes);
      where.push(`type=ANY($${values.length}::text[])`);
    }
    values.push(limit);
    const result = await this.db.query(
      `SELECT * FROM edges WHERE ${where.join(' AND ')} ORDER BY id::text ASC LIMIT $${values.length}`,
      values,
    );
    return result.rows.map(map);
  }
}
