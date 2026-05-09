const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(__dirname);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const CACHE_EXTS = new Set(['.js', '.css', '.svg', '.png', '.ico']);

function serve(filePath, res) {
  const ext = path.extname(filePath);
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
  if (CACHE_EXTS.has(ext)) {
    headers['Cache-Control'] = 'public, max-age=3600';
  }
  if (path.basename(filePath) === 'index.html') {
    headers['Service-Worker-Allowed'] = '/';
  }
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const start = Date.now();
  const _end = res.end.bind(res);
  res.end = function (...args) {
    const elapsed = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} ${elapsed}ms`);
    return _end(...args);
  };

  if (req.method !== 'GET') {
    res.writeHead(405);
    return res.end();
  }

  let url = req.url.split('?')[0].replace(/\/$/, '') || '/';
  let filePath = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // SPA fallback
        return fs.createReadStream(path.join(ROOT, 'index.html'))
          .on('error', () => { res.writeHead(404); res.end('Not Found'); })
          .pipe(res);
      }
      res.writeHead(500);
      return res.end('Internal Server Error');
    }
    if (stat.isDirectory()) {
      return fs.stat(path.join(filePath, 'index.html'), (e2) => {
        if (e2) { res.writeHead(404); return res.end('Not Found'); }
        serve(path.join(filePath, 'index.html'), res);
      });
    }
    serve(filePath, res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[tomato-clock] Server running at http://${HOST}:${PORT}/`);
});
