import type { ListOptions } from '../contracts/types.js';

type Query = Record<string, unknown>;

export function parseListOptions(query: Query): ListOptions {
  return {
    type: stringValue(query.type),
    status: stringValue(query.status),
    fromVertexId: stringValue(query.fromVertexId),
    toVertexId: stringValue(query.toVertexId),
    cursor: stringValue(query.cursor),
    limit: Math.min(Math.max(Number(query.limit ?? 50), 1), 100),
    includeDeleted: query.includeDeleted === 'true',
  };
}

export function includesDeleted(query: Query) {
  return query.includeDeleted === 'true';
}

export function parsePatch(body: Record<string, unknown>) {
  const { version, ...changes } = body;
  return { version: Number(version), changes };
}

export function parseEdgeTypes(query: Query) {
  const edgeType = stringValue(query.edgeType);
  return edgeType ? edgeType.split(',') : undefined;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}
