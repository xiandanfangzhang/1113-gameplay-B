import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const useDist = process.argv.includes('--dist');
const root = useDist ? join(projectRoot, 'dist') : projectRoot;
const port = Number(process.env.PORT || 4173);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = normalize(join(root, relative));
    if (target !== root && !target.startsWith(root + sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(target);
    if (!info.isFile()) throw new Error('Not a file');
    const body = await readFile(target);
    response.writeHead(200, {
      'Content-Type': mime[extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`彩球接驳 demo： http://127.0.0.1:${port}/ (${useDist ? 'dist' : 'source'})`);
});
