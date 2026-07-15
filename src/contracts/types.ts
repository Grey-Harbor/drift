export type Scope = 'read' | 'write' | 'admin';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Status = string;

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
}
export interface ApiKey {
  id: string;
  tenantId: string;
  label: string;
  prefix: string;
  scopes: Scope[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}
export interface Vertex {
  id: string;
  tenantId: string;
  type: string;
  slug: string | null;
  externalId: string | null;
  title: string | null;
  status: Status;
  data: Json;
  metadata: Json;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface Edge {
  id: string;
  tenantId: string;
  fromVertexId: string;
  toVertexId: string;
  type: string;
  status: Status;
  data: Json;
  metadata: Json;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export type GraphRecord = Vertex | Edge;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
export interface ListOptions {
  type?: string;
  status?: string;
  fromVertexId?: string;
  toVertexId?: string;
  cursor?: string;
  limit: number;
  includeDeleted: boolean;
}
export interface TraverseInput {
  start: string;
  direction: 'in' | 'out' | 'both';
  edgeTypes?: string[];
  vertexTypes?: string[];
  depth: number;
  limit: number;
  includeDeleted: boolean;
}
export interface TraverseResult {
  vertices: Vertex[];
  edges: Edge[];
}
export interface RetrieveInput {
  source: 'vertices' | 'edges';
  filters?: { type?: string; status?: string; ids?: string[] };
  projection?: Array<{ field: string; as?: string }>;
  groupBy?: string[];
  aggregates?: Array<{ op: 'count' | 'sum' | 'min' | 'max' | 'avg'; field?: string; as: string }>;
  sort?: Array<{ field: string; direction?: 'asc' | 'desc' }>;
  limit?: number;
  includeDeleted: boolean;
}
export interface RetrieveResult {
  rows: Array<Record<string, Json>>;
  scanned: number;
}

export class DriftError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}
