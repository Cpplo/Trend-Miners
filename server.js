const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

function safePath(requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const routedPath = decoded === '/manus-routes.json' ? '/public/manus-routes.json' : decoded;
  const normalized = path.normalize(routedPath).replace(/^([.][.][\\/])+/, '');
  return path.join(root, normalized === '/' ? 'index.html' : normalized);
}

const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('ok');
    return;
  }

  let filePath;
  try {
    filePath = safePath(request.url || '/');
  } catch {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      'Content-Type': types[extension] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(response);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`ReviewLab preview listening on http://0.0.0.0:${port}`);
});
