'use strict';

const http = require('node:http');

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Enclave Telemetry &amp; Diagnostic Interface</title>
  <style>
    body{font:16px system-ui,sans-serif;max-width:760px;margin:3rem auto;padding:0 1rem;background:#10131b;color:#e7eaf2}
    main{border:1px solid #34394a;border-radius:12px;padding:1.5rem;background:#171b26}
    code,pre{color:#d78cff}pre{white-space:pre-wrap;background:#0b0d12;padding:1rem;border-radius:8px;overflow-wrap:anywhere}
    a{color:#d78cff}
  </style>
</head>
<body><main>
  <h1>Enclave Telemetry &amp; Diagnostic Interface</h1>
  <p>Isolated runtime diagnostics for this team instance.</p>
  <p>Runtime report: <a href="/api/diagnostics/runtime">/api/diagnostics/runtime</a></p>
  <pre id="report">Loading runtime report…</pre>
  <script>
    fetch('/api/diagnostics/runtime').then(r => r.json()).then(data => {
      document.getElementById('report').textContent = JSON.stringify(data, null, 2);
    }).catch(() => {
      document.getElementById('report').textContent = 'Runtime report unavailable';
    });
  </script>
</main></body>
</html>`;

const server = http.createServer((req, res) => {
  const path = new URL(req.url || '/', 'http://localhost').pathname;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'healthy' }));
    return;
  }

  if (req.method === 'GET' && path === '/api/diagnostics/runtime') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      instance: process.env.CHALLENGE_INSTANCE_ID || 'isolated-enclave',
      status: 'healthy',
      network: 'isolated-team-instance',
      memory_usage: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
      sandbox_token: process.env.RUNTIME_ESCAPE_FLAG || 'unavailable',
    }));
    return;
  }

  if (req.method === 'GET' && path === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ statusCode: 404, error: 'Not Found' }));
});

server.listen(Number(process.env.CHALLENGE_PORT || 8080), '0.0.0.0');
