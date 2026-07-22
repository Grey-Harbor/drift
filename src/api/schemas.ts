import { Type } from '@sinclair/typebox';

const jsonValue = Type.Any({ description: 'Any valid JSON value.' });
const scope = Type.Union([Type.Literal('read'), Type.Literal('write'), Type.Literal('admin')]);
const id = Type.String({ minLength: 1 });
const includeDeleted = Type.Optional(Type.Boolean({ default: false }));

const apiKey = Type.Object({
  id,
  tenantId: id,
  label: Type.String(),
  prefix: Type.String(),
  scopes: Type.Array(scope),
  createdAt: Type.String({ format: 'date-time' }),
  lastUsedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  revokedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
});

const vertex = Type.Object({
  id,
  tenantId: id,
  type: Type.String({ minLength: 1 }),
  slug: Type.Union([Type.String(), Type.Null()]),
  externalId: Type.Union([Type.String(), Type.Null()]),
  title: Type.Union([Type.String(), Type.Null()]),
  status: Type.String(),
  data: jsonValue,
  metadata: jsonValue,
  version: Type.Integer({ minimum: 1 }),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
  deletedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
});

const edge = Type.Object({
  id,
  tenantId: id,
  fromVertexId: id,
  toVertexId: id,
  type: Type.String({ minLength: 1 }),
  status: Type.String(),
  data: jsonValue,
  metadata: jsonValue,
  version: Type.Integer({ minimum: 1 }),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
  deletedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
});

const error = Type.Object({
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
    details: Type.Optional(Type.Any()),
  }),
});

const errors = {
  400: error,
  401: error,
  403: error,
  404: error,
  409: error,
  422: error,
  500: error,
};

const authenticated = { security: [{ bearerAuth: [] }] };
const idParams = Type.Object({ id }, { additionalProperties: false });
const versionBody = Type.Object(
  { version: Type.Integer({ minimum: 1 }) },
  { additionalProperties: false },
);
const listQuery = Type.Object(
  {
    type: Type.Optional(Type.String()),
    status: Type.Optional(Type.String()),
    fromVertexId: Type.Optional(id),
    toVertexId: Type.Optional(id),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 50 })),
    cursor: Type.Optional(Type.String()),
    includeDeleted,
  },
  { additionalProperties: false },
);

const vertexBody = Type.Object(
  {
    type: Type.String({ minLength: 1 }),
    slug: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    externalId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    title: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    status: Type.Optional(Type.String()),
    data: Type.Optional(jsonValue),
    metadata: Type.Optional(jsonValue),
  },
  { additionalProperties: false },
);

const vertexPatchBody = Type.Object(
  {
    version: Type.Integer({ minimum: 1 }),
    type: Type.Optional(Type.String({ minLength: 1 })),
    slug: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    externalId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    title: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    status: Type.Optional(Type.String()),
    data: Type.Optional(jsonValue),
    metadata: Type.Optional(jsonValue),
  },
  { additionalProperties: false },
);

const edgeBody = Type.Object(
  {
    fromVertexId: id,
    toVertexId: id,
    type: Type.String({ minLength: 1 }),
    status: Type.Optional(Type.String()),
    data: Type.Optional(jsonValue),
    metadata: Type.Optional(jsonValue),
  },
  { additionalProperties: false },
);

const edgePatchBody = Type.Object(
  {
    version: Type.Integer({ minimum: 1 }),
    fromVertexId: Type.Optional(id),
    toVertexId: Type.Optional(id),
    type: Type.Optional(Type.String({ minLength: 1 })),
    status: Type.Optional(Type.String()),
    data: Type.Optional(jsonValue),
    metadata: Type.Optional(jsonValue),
  },
  { additionalProperties: false },
);

const page = (item: typeof vertex | typeof edge) =>
  Type.Object({ items: Type.Array(item), nextCursor: Type.Union([Type.String(), Type.Null()]) });

export const healthSchema = {
  tags: ['health'],
  response: { 200: Type.Object({ status: Type.Literal('ok') }) },
};
export const openApiSchema = { response: { 200: Type.Object({}, { additionalProperties: true }) } };
export const listVerticesSchema = {
  ...authenticated,
  querystring: listQuery,
  response: { 200: page(vertex), ...errors },
};
export const createVertexSchema = {
  ...authenticated,
  body: vertexBody,
  response: { 200: vertex, ...errors },
};
export const vertexByIdSchema = {
  ...authenticated,
  params: idParams,
  querystring: Type.Object({ includeDeleted }, { additionalProperties: false }),
  response: { 200: vertex, ...errors },
};
export const patchVertexSchema = {
  ...authenticated,
  params: idParams,
  body: vertexPatchBody,
  response: { 200: vertex, ...errors },
};
export const deleteVertexSchema = {
  ...authenticated,
  params: idParams,
  body: versionBody,
  response: { 200: vertex, ...errors },
};
export const restoreVertexSchema = deleteVertexSchema;

export const listEdgesSchema = {
  ...authenticated,
  querystring: listQuery,
  response: { 200: page(edge), ...errors },
};
export const createEdgeSchema = {
  ...authenticated,
  body: edgeBody,
  response: { 200: edge, ...errors },
};
export const edgeByIdSchema = {
  ...authenticated,
  params: idParams,
  querystring: Type.Object({ includeDeleted }, { additionalProperties: false }),
  response: { 200: edge, ...errors },
};
export const patchEdgeSchema = {
  ...authenticated,
  params: idParams,
  body: edgePatchBody,
  response: { 200: edge, ...errors },
};
export const deleteEdgeSchema = {
  ...authenticated,
  params: idParams,
  body: versionBody,
  response: { 200: edge, ...errors },
};
export const restoreEdgeSchema = deleteEdgeSchema;

export const adjacencySchema = {
  ...authenticated,
  params: idParams,
  querystring: Type.Object(
    {
      edgeType: Type.Optional(Type.String()),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500, default: 100 })),
      includeDeleted,
    },
    { additionalProperties: false },
  ),
  response: {
    200: Type.Object({ vertices: Type.Array(vertex), edges: Type.Array(edge) }),
    ...errors,
  },
};

export const traverseSchema = {
  ...authenticated,
  body: Type.Object(
    {
      start: id,
      direction: Type.Union([Type.Literal('in'), Type.Literal('out'), Type.Literal('both')]),
      edgeTypes: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
      vertexTypes: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
      depth: Type.Integer({ minimum: 1, maximum: 5 }),
      limit: Type.Integer({ minimum: 1, maximum: 500 }),
      includeDeleted,
    },
    { additionalProperties: false },
  ),
  response: {
    200: Type.Object({ vertices: Type.Array(vertex), edges: Type.Array(edge) }),
    ...errors,
  },
};

export const retrieveSchema = {
  ...authenticated,
  body: Type.Object(
    {
      source: Type.Union([Type.Literal('vertices'), Type.Literal('edges')]),
      filters: Type.Optional(
        Type.Object(
          {
            type: Type.Optional(Type.String()),
            status: Type.Optional(Type.String()),
            ids: Type.Optional(Type.Array(id)),
          },
          { additionalProperties: false },
        ),
      ),
      projection: Type.Optional(
        Type.Array(
          Type.Object(
            {
              field: Type.String({ minLength: 1 }),
              as: Type.Optional(Type.String({ minLength: 1 })),
            },
            { additionalProperties: false },
          ),
        ),
      ),
      groupBy: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
      aggregates: Type.Optional(
        Type.Array(
          Type.Object(
            {
              op: Type.Union([
                Type.Literal('count'),
                Type.Literal('sum'),
                Type.Literal('min'),
                Type.Literal('max'),
                Type.Literal('avg'),
              ]),
              field: Type.Optional(Type.String({ minLength: 1 })),
              as: Type.String({ minLength: 1 }),
            },
            { additionalProperties: false },
          ),
        ),
      ),
      sort: Type.Optional(
        Type.Array(
          Type.Object(
            {
              field: Type.String({ minLength: 1 }),
              direction: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')])),
            },
            { additionalProperties: false },
          ),
        ),
      ),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000, default: 100 })),
      includeDeleted,
    },
    { additionalProperties: false },
  ),
  response: {
    200: Type.Object({
      rows: Type.Array(Type.Object({}, { additionalProperties: true })),
      scanned: Type.Integer({ minimum: 0 }),
    }),
    ...errors,
  },
};

const keyBody = Type.Object(
  { label: Type.String({ minLength: 1 }), scopes: Type.Array(scope, { minItems: 1 }) },
  { additionalProperties: false },
);
const issuedKey = Type.Object({ apiKey, secret: Type.String({ minLength: 1 }) });

export const listKeysSchema = {
  ...authenticated,
  response: { 200: Type.Array(apiKey), ...errors },
};
export const createKeySchema = {
  ...authenticated,
  body: keyBody,
  response: { 200: issuedKey, ...errors },
};
export const revokeKeySchema = {
  ...authenticated,
  params: idParams,
  response: { 200: Type.Object({ ok: Type.Literal(true) }), ...errors },
};
export const rotateKeySchema = {
  ...authenticated,
  params: idParams,
  body: keyBody,
  response: { 200: issuedKey, ...errors },
};
