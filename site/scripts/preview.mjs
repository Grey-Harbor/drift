import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(currentDirectory, '..', 'out');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

function getContentType(filePath) {
  return contentTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
}

async function resolvePath(urlPath) {
  const normalized = decodeURIComponent(urlPath.split('?')[0] || '/');
  const safePath = path.normalize(normalized).replace(/^(\.\.(\/|\\|$))+/, '');
  const candidate = path.join(root, safePath);

  try {
    const candidateStat = await stat(candidate);
    if (candidateStat.isDirectory()) {
      const indexPath = path.join(candidate, 'index.html');
      await access(indexPath);
      return indexPath;
    }

    return candidate;
  } catch {
    if (!path.extname(candidate)) {
      const htmlCandidate = path.join(root, safePath, 'index.html');
      await access(htmlCandidate);
      return htmlCandidate;
    }

    throw new Error('Not found');
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const filePath = await resolvePath(request.url || '/');
    response.writeHead(200, { 'Content-Type': getContentType(filePath) });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(`Previewing exported site at http://${host}:${port}`);
});
