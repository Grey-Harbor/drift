/** Minimal typed client; generated API types can replace this surface without changing callers. */
export class DriftClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        ...init.headers,
      },
    });
    const body = await response.json();
    if (!response.ok)
      throw Object.assign(new Error(body.error?.message ?? 'Drift request failed'), body.error);
    return body as T;
  }
  listVertices(query = '') {
    return this.request(`/v1/vertices${query}`);
  }
  createVertex(body: unknown) {
    return this.request('/v1/vertices', { method: 'POST', body: JSON.stringify(body) });
  }
  getVertex(id: string) {
    return this.request(`/v1/vertices/${id}`);
  }
  patchVertex(id: string, body: unknown) {
    return this.request(`/v1/vertices/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  listEdges(query = '') {
    return this.request(`/v1/edges${query}`);
  }
  createEdge(body: unknown) {
    return this.request('/v1/edges', { method: 'POST', body: JSON.stringify(body) });
  }
  traverse(body: unknown) {
    return this.request('/v1/traverse', { method: 'POST', body: JSON.stringify(body) });
  }
  retrieve(body: unknown) {
    return this.request('/v1/retrieve', { method: 'POST', body: JSON.stringify(body) });
  }
}
