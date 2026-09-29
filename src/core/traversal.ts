import type { TraverseInput, TraverseResult, Vertex } from '../contracts/types.js';
import type { DriftRepository } from '../interfaces/repository.js';

export async function traverseGraph(
  repository: DriftRepository,
  tenantId: string,
  input: TraverseInput,
): Promise<TraverseResult> {
  const seenVertexIds = new Set([input.start]);
  const traversedEdges = [];
  let frontier = [input.start];

  for (let depth = 0; depth < input.depth && frontier.length; depth++) {
    if (traversedEdges.length >= input.limit) break;
    const edges = await repository.findConnectedEdges(
      tenantId,
      frontier,
      input.direction,
      input.edgeTypes,
      input.includeDeleted,
      input.limit - traversedEdges.length,
    );
    const nextFrontier: string[] = [];

    for (const edge of edges) {
      if (traversedEdges.length >= input.limit) break;
      traversedEdges.push(edge);
      for (const vertexId of [edge.fromVertexId, edge.toVertexId]) {
        if (!seenVertexIds.has(vertexId)) {
          seenVertexIds.add(vertexId);
          nextFrontier.push(vertexId);
        }
      }
    }
    frontier = nextFrontier;
  }

  const vertices = await loadVertices(repository, tenantId, seenVertexIds, input);
  return { vertices: vertices.slice(0, input.limit), edges: traversedEdges.slice(0, input.limit) };
}

async function loadVertices(
  repository: DriftRepository,
  tenantId: string,
  vertexIds: Set<string>,
  input: TraverseInput,
): Promise<Vertex[]> {
  const vertices = (
    await repository.listVertices(tenantId, {
      ids: [...vertexIds],
      limit: vertexIds.size,
      includeDeleted: input.includeDeleted,
    })
  ).items;
  const start = vertices.find((vertex) => vertex.id === input.start);
  const related = vertices
    .filter((vertex) => vertex.id !== input.start)
    .filter((vertex) => !input.vertexTypes?.length || input.vertexTypes.includes(vertex.type));

  return start ? [start, ...related] : related;
}
