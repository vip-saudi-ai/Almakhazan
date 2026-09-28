// A static server for the repository that sends the production security
// headers generated from nazm.config.js (tools/security-policy.mjs), so the
// app is exercised under the policy it ships with, not merely inspected.
//
// Plain http on 127.0.0.1: `upgrade-insecure-requests` (which would rewrite
// every request to https) and HSTS (ignored over http) are the only headers
// left out; everything else is sent exactly as firebase.json sends it.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, securityHeaders } from '../../tools/security-policy.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

export function localHeaders(config = loadConfig()) {
  const headers = { ...securityHeaders(config) };
  delete headers['Strict-Transport-Security'];
  headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace(/;\s*upgrade-insecure-requests/, '');
  return headers;
}

export function startSecureServer(port = 8124, config = loadConfig()) {
  const headers = localHeaders(config);
  const server = createServer(async (request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(ROOT, path || 'index.html');
    if (!file.startsWith(ROOT)) { response.writeHead(403).end(); return; }
    try {
      const info = await stat(file);
      const target = info.isDirectory() ? join(file, 'index.html') : file;
      const body = await readFile(target);
      response.writeHead(200, { 'Content-Type': TYPES[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...headers });
      response.end(body);
    } catch {
      response.writeHead(404, headers).end();
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
