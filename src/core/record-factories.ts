import { v7 as uuidv7 } from 'uuid';
import type { Edge, Vertex } from '../contracts/types.js';

export type VertexInput = Omit<
  Vertex,
  'id' | 'tenantId' | 'version' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;
export type EdgeInput = Omit<
  Edge,
  'id' | 'tenantId' | 'version' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;

export function createVertexRecord(
  tenantId: string,
  input: VertexInput,
  createdAt: string,
): Vertex {
  return {
    ...input,
    id: uuidv7(),
    tenantId,
    slug: input.slug ?? null,
    externalId: input.externalId ?? null,
    title: input.title ?? null,
    status: input.status ?? 'active',
    data: input.data ?? {},
    metadata: input.metadata ?? {},
    version: 1,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}

export function createEdgeRecord(tenantId: string, input: EdgeInput, createdAt: string): Edge {
  return {
    ...input,
    id: uuidv7(),
    tenantId,
    status: input.status ?? 'active',
    data: input.data ?? {},
    metadata: input.metadata ?? {},
    version: 1,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}
