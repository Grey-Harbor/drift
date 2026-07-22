import Fastify, { type FastifyRequest } from 'fastify';
import swagger from '@fastify/swagger';
import { DriftError } from '../contracts/types.js';
import { DriftService, type Principal } from '../core/service.js';
import {
  includesDeleted,
  parseEdgeTypes,
  parseListOptions,
  parsePatch,
} from './request-parsing.js';
import {
  adjacencySchema,
  createEdgeSchema,
  createKeySchema,
  createVertexSchema,
  deleteEdgeSchema,
  deleteVertexSchema,
  edgeByIdSchema,
  healthSchema,
  listEdgesSchema,
  listKeysSchema,
  listVerticesSchema,
  openApiSchema,
  patchEdgeSchema,
  patchVertexSchema,
  restoreEdgeSchema,
  restoreVertexSchema,
  retrieveSchema,
  revokeKeySchema,
  rotateKeySchema,
  traverseSchema,
  vertexByIdSchema,
} from './schemas.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}

export function buildApp(service: DriftService) {
  const app = Fastify({
    logger: true,
    ajv: { customOptions: { removeAdditional: false } },
  });
  app.register(swagger, {
    openapi: {
      info: { title: 'Drift API', version: '1.0.0' },
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
    },
  });
  app.after((error) => {
    if (error) throw error;
    app.setErrorHandler((error, request, reply) => {
      const validationError = typeof error === 'object' && error !== null && 'validation' in error;
      if (!(error instanceof DriftError) && !validationError) request.log.error(error);
      const e =
        error instanceof DriftError
          ? error
          : validationError
            ? new DriftError('validation_error', 'Request validation failed', 400)
            : new DriftError('internal_error', 'Internal server error', 500);
      reply
        .status(e.statusCode)
        .send({ error: { code: e.code, message: e.message, details: e.details } });
    });
    app.get(
      '/health',
      {
        schema: healthSchema,
      },
      async () => ({ status: 'ok' }),
    );
    app.addHook('preHandler', async (request, reply) => {
      if (!request.url.startsWith('/v1') || request.url.startsWith('/v1/openapi.json')) return;
      const auth = request.headers.authorization;
      if (!auth?.startsWith('Bearer ')) {
        reply
          .status(401)
          .send({ error: { code: 'unauthorized', message: 'Bearer API key required' } });
        return reply;
      }
      request.principal = service.authenticate(auth.slice(7));
    });
    const p = (r: FastifyRequest) => r.principal!;
    app.get('/v1/openapi.json', { schema: openApiSchema }, async () => app.swagger());
    app.get('/v1/vertices', { schema: listVerticesSchema }, async (r) =>
      service.listVertices(p(r), parseListOptions(r.query as any)),
    );
    app.post('/v1/vertices', { schema: createVertexSchema }, async (r) =>
      service.createVertex(p(r), {
        ...(r.body as any),
        status: (r.body as any).status ?? 'active',
        data: (r.body as any).data ?? {},
        metadata: (r.body as any).metadata ?? {},
      }),
    );
    app.get('/v1/vertices/:id', { schema: vertexByIdSchema }, async (r) =>
      service.getVertex(p(r), (r.params as any).id, includesDeleted(r.query as any)),
    );
    app.patch('/v1/vertices/:id', { schema: patchVertexSchema }, async (r) => {
      const x = parsePatch(r.body as any);
      return service.patchVertex(p(r), (r.params as any).id, x.version, x.changes);
    });
    app.delete('/v1/vertices/:id', { schema: deleteVertexSchema }, async (r) =>
      service.deleteVertex(p(r), (r.params as any).id, (r.body as any).version),
    );
    app.post('/v1/vertices/:id/restore', { schema: restoreVertexSchema }, async (r) =>
      service.restoreVertex(p(r), (r.params as any).id, (r.body as any).version),
    );
    for (const [suffix, direction] of [
      ['out', 'out'],
      ['in', 'in'],
      ['neighbors', 'both'],
    ] as const)
      app.get(`/v1/vertices/:id/${suffix}`, { schema: adjacencySchema }, async (r) =>
        service.traverse(p(r), {
          start: (r.params as any).id,
          direction,
          depth: 1,
          limit: Math.min(Number((r.query as any).limit ?? 100), 500),
          edgeTypes: parseEdgeTypes(r.query as any),
          includeDeleted: includesDeleted(r.query as any),
        }),
      );
    app.get('/v1/edges', { schema: listEdgesSchema }, async (r) =>
      service.listEdges(p(r), parseListOptions(r.query as any)),
    );
    app.post('/v1/edges', { schema: createEdgeSchema }, async (r) =>
      service.createEdge(p(r), {
        ...(r.body as any),
        status: (r.body as any).status ?? 'active',
        data: (r.body as any).data ?? {},
        metadata: (r.body as any).metadata ?? {},
      }),
    );
    app.get('/v1/edges/:id', { schema: edgeByIdSchema }, async (r) =>
      service.getEdge(p(r), (r.params as any).id, includesDeleted(r.query as any)),
    );
    app.patch('/v1/edges/:id', { schema: patchEdgeSchema }, async (r) => {
      const x = parsePatch(r.body as any);
      return service.patchEdge(p(r), (r.params as any).id, x.version, x.changes);
    });
    app.delete('/v1/edges/:id', { schema: deleteEdgeSchema }, async (r) =>
      service.deleteEdge(p(r), (r.params as any).id, (r.body as any).version),
    );
    app.post('/v1/edges/:id/restore', { schema: restoreEdgeSchema }, async (r) =>
      service.restoreEdge(p(r), (r.params as any).id, (r.body as any).version),
    );
    app.post('/v1/traverse', { schema: traverseSchema }, async (r) =>
      service.traverse(p(r), r.body as any),
    );
    app.post('/v1/retrieve', { schema: retrieveSchema }, async (r) =>
      service.retrieve(p(r), r.body as any),
    );
    app.get('/v1/admin/keys', { schema: listKeysSchema }, async (r) => service.listKeys(p(r)));
    app.post('/v1/admin/keys', { schema: createKeySchema }, async (r) => {
      const b = r.body as any;
      return service.createKey(p(r), b.label, b.scopes);
    });
    app.delete('/v1/admin/keys/:id', { schema: revokeKeySchema }, async (r) => {
      service.revokeKey(p(r), (r.params as any).id);
      return { ok: true };
    });
    app.post('/v1/admin/keys/:id/rotate', { schema: rotateKeySchema }, async (r) => {
      const b = r.body as any;
      return service.rotateKey(p(r), (r.params as any).id, b.label, b.scopes);
    });
  });
  return app;
}
