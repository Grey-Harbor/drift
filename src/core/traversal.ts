import type { TraverseInput, TraverseResult, Vertex } from '../contracts/types.js';
import type { DriftRepository } from '../interfaces/repository.js';

export function traverseGraph(
  repository: DriftRepository,
  tenantId: string,
  input: TraverseInput,
): TraverseResult {
  const seenVertexIds = new Set([input.start]);
  const traversedEdges = [];
  let frontier = [input.start];

  for (let depth = 0; depth < input.depth && frontier.length; depth++) {
    if (traversedEdges.length >= input.limit) break;
    const edges = repository.findConnectedEdges(
      tenantId,
      frontier,
      input.direction,
      input.edgeTypes,
      input.includeDeleted,
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

  const vertices = loadVertices(repository, tenantId, seenVertexIds, input);
  return { vertices: vertices.slice(0, input.limit), edges: traversedEdges.slice(0, input.limit) };
}

function loadVertices(
  repository: DriftRepository,
  tenantId: string,
  vertexIds: Set<string>,
  input: TraverseInput,
): Vertex[] {
  const start = repository.getVertex(tenantId, input.start, input.includeDeleted);
  const related = [...vertexIds]
    .filter((id) => id !== input.start)
    .map((id) => repository.getVertex(tenantId, id, input.includeDeleted))
    .filter((vertex): vertex is Vertex => Boolean(vertex))
    .filter((vertex) => !input.vertexTypes?.length || input.vertexTypes.includes(vertex.type));

  return start ? [start, ...related] : related;
}
