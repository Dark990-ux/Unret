// Serves the exported web build of the mobile app and proxies /api and /socket.io (incl. websockets) to the API.
// Usage: node scripts/serve-web.js dist   (env: PORT=8081, API_HOST=127.0.0.1, API_PORT=4000)
const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');

const root = path.resolve(process.argv[2] ?? 'dist');
const API = { host: process.env.API_HOST ?? '127.0.0.1', port: Number(process.env.API_PORT ?? 4000) };
const PORT = Number(process.env.PORT ?? 8081);
const types = { '.js': 'application/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.css': 'text/css' };
const isApi = (u) => u.startsWith('/api/') || u.startsWith('/socket.io/');

const server = http.createServer((req, res) => {
  if (isApi(req.url)) {
    const p = http.request({ ...API, path: req.url, method: req.method, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    p.on('error', () => { res.writeHead(502); res.end('API unavailable'); });
    return req.pipe(p);
  }
  let f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html');
  res.setHeader('Content-Type', types[path.extname(f)] ?? 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
});

server.on('upgrade', (req, socket, head) => {
  const up = net.connect(API.port, API.host, () => {
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
    up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
});

server.listen(PORT, () => console.log(`UNRET mobile app (web build) on http://localhost:${PORT}`));
