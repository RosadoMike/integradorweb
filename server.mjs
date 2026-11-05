import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeReport } from './report-validation.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const DATA_DIRECTORY = join(ROOT, 'data');
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8']
]);

export { normalizeReport };

async function readReports(dataDirectory) {
  const reportsFile = join(dataDirectory, 'reports.json');
  try {
    return JSON.parse(await readFile(reportsFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readRequestBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 16_384) throw new RangeError('El cuerpo de la solicitud supera el límite permitido.');
  }
  return JSON.parse(body);
}

async function handleApi(request, response, pathname, dataDirectory) {
  if (pathname === '/api/health' && request.method === 'GET') {
    await sendJson(response, 200, { status: 'ok' });
    return true;
  }
  if (pathname !== '/api/reports') return false;
  if (request.method === 'GET') {
    await sendJson(response, 200, await readReports(dataDirectory));
    return true;
  }
  if (request.method === 'POST') {
    let report;
    try {
      report = normalizeReport(await readRequestBody(request));
    } catch (error) {
      const status = error instanceof SyntaxError ? 400 : error instanceof RangeError ? 413 : 400;
      await sendJson(response, status, { error: error.message });
      return true;
    }
    const reports = await readReports(dataDirectory);
    const existing = reports.find((saved) => saved.id === report.id);
    if (existing) {
      await sendJson(response, 200, existing);
      return true;
    }
    reports.push(report);
    await mkdir(dataDirectory, { recursive: true });
    await writeFile(join(dataDirectory, 'reports.json'), `${JSON.stringify(reports, null, 2)}\n`, 'utf8');
    await sendJson(response, 201, report);
    return true;
  }
  response.setHeader('Allow', 'GET, POST');
  await sendJson(response, 405, { error: 'Método no permitido.' });
  return true;
}

async function handleRequest(request, response, dataDirectory) {
  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    if (await handleApi(request, response, url.pathname, dataDirectory)) return;
    await sendJson(response, 404, { error: 'Ruta de API no encontrada.' });
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400);
    response.end('Ruta no válida.');
    return;
  }
  const target = resolve(ROOT, `.${pathname}`);
  if (target !== ROOT && !target.startsWith(`${ROOT}${sep}`)) {
    response.writeHead(403);
    response.end('Acceso denegado.');
    return;
  }
  const file = pathname.endsWith('/') ? join(target, 'index.html') : target;
  try {
    const { size } = await stat(file);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES.get(extname(file)) ?? 'application/octet-stream',
      'Content-Length': size,
      'Cache-Control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600'
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).pipe(response);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      response.writeHead(404);
      response.end('No encontrado.');
      return;
    }
    throw error;
  }
}

export function startServer({ port = PORT, host = HOST, dataDirectory = DATA_DIRECTORY } = {}) {
  const server = createServer((request, response) => {
    handleRequest(request, response, dataDirectory).catch((error) => {
      console.error('Error al procesar solicitud:', error);
      if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'Error interno del servidor.' }));
    });
  });
  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      console.log(`CampoListo disponible en http://${host}:${server.address().port}`);
      resolveServer(server);
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer();
}
