import { Type } from '@sinclair/typebox';

const jsonValue = Type.Any();

export const versionBody = Type.Object({ version: Type.Integer({ minimum: 1 }) });
export const vertexBody = Type.Object({
  type: Type.String({ minLength: 1 }),
  slug: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  externalId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  title: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  status: Type.Optional(Type.String()),
  data: Type.Optional(jsonValue),
  metadata: Type.Optional(jsonValue),
});
export const edgeBody = Type.Object({
  fromVertexId: Type.String(),
  toVertexId: Type.String(),
  type: Type.String({ minLength: 1 }),
  status: Type.Optional(Type.String()),
  data: Type.Optional(jsonValue),
  metadata: Type.Optional(jsonValue),
});
export const vertexPatchBody = Type.Intersect([Type.Partial(vertexBody), versionBody]);
export const edgePatchBody = Type.Intersect([Type.Partial(edgeBody), versionBody]);
export const healthSchema = {
  tags: ['health'],
  response: { 200: Type.Object({ status: Type.Literal('ok') }) },
};
