import http from 'node:http';
import { isIP } from 'node:net';
import { readFileSync } from 'node:fs';
import { AbuseLimiter } from './abuse.mjs';
import { normalizeSubmission, MAX_BODY_BYTES } from './protocol.mjs';
const verificationScript = readFileSync(new URL('./verify.js', import.meta.url));
const SECURITY = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
const CSP = "default-src 'none'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src https://challenges.cloudflare.com; style-src 'self'; base-uri 'none'; form-action 'none'";
function readBody(request) {
  return new Promise((resolve, reject) => {
    let length = 0, done = false; const chunks = [];
    const finish = (error) => { if (done) return; done = true; clearTimeout(deadline); error ? reject(error) : resolve(Buffer.concat(chunks).toString('utf8')); };
    const deadline = setTimeout(() => { finish(Object.assign(new Error('timeout'), { status: 408 })); }, 8000); deadline.unref();
    request.setTimeout(5000, () => finish(Object.assign(new Error('timeout'), { status: 408 })));
    request.on('data', chunk => { if (done) return; length += chunk.length; if (length > MAX_BODY_BYTES) finish(Object.assign(new Error('size'), { status: 413 })); else chunks.push(chunk); });
    request.on('end', () => finish()); request.on('error', () => finish(new Error('body'))); request.on('aborted', () => finish(new Error('body')));
  });
}
function clientIp(request, trustedCloudflareProxy) {
  const peer = request.socket.remoteAddress ?? 'unknown';
  if (trustedCloudflareProxy && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer)) {
    const header = request.headers['cf-connecting-ip'];
    if (typeof header === 'string' && isIP(header)) return header;
    return null;
  }
  return peer;
}
export function createFeedbackServer({ store, enabled = false, verify = async () => false, siteKey = '', origins = ['null'], trustedCloudflareProxy = false, limiter = new AbuseLimiter(), maxInFlight = 4 } = {}) {
  let inFlight = 0;
  const server = http.createServer({ maxHeaderSize: 8192, requestTimeout: 8000, headersTimeout: 5000, keepAliveTimeout: 2000 }, async (request, response) => {
    let occupied = false;
    const headers = { ...SECURITY };
    const origin = request.headers.origin;
    if (typeof origin === 'string' && origins.includes(origin)) { headers['access-control-allow-origin'] = origin; headers.vary = 'Origin'; }
    const send = (status, value, extra = {}) => {
      if (response.destroyed || response.writableEnded) return;
      if (!request.complete) headers.connection = 'close';
      response.writeHead(status, { ...headers, 'content-type': 'application/json; charset=utf-8', ...extra }); response.end(JSON.stringify(value));
    };
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' && pathname === '/health') return send(200, { ok: true, accepting: enabled });
      if (request.method === 'GET' && pathname === '/verify' && enabled && /^[A-Za-z0-9_-]{1,128}$/u.test(siteKey)) {
        response.writeHead(200, { ...headers, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP });
        return response.end(`<!doctype html><html lang="en" data-sitekey="${siteKey}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Water Hole verification</title><link rel="stylesheet" href="/verify.css"><script src="/verify.js" defer></script><script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&amp;onload=waterHoleVerificationReady" defer></script></head><body><div id="challenge"></div><p id="verification-status">Complete the check to send your feedback.</p></body></html>`);
      }
      if (request.method === 'GET' && pathname === '/verify.js') { response.writeHead(200, { ...headers, 'content-type': 'text/javascript; charset=utf-8' }); return response.end(verificationScript); }
      if (request.method === 'GET' && pathname === '/verify.css') { response.writeHead(200, { ...headers, 'content-type': 'text/css; charset=utf-8' }); return response.end('body{margin:12px;background:#15252a;color:#e1e6df;font:14px system-ui}p{margin:8px 0}'); }
      const kind = pathname === '/api/reports' ? 'report' : pathname === '/api/surveys' ? 'survey' : null;
      if (!kind) return send(404, { error: 'not_found' });
      if (origin !== undefined && (typeof origin !== 'string' || !origins.includes(origin))) return send(403, { error: 'invalid_origin' });
      if (request.method === 'OPTIONS') return send(204, null, { 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'Content-Type', 'access-control-max-age': '600' });
      if (request.method !== 'POST') return send(404, { error: 'not_found' });
      if (!enabled) return send(503, { error: 'unavailable' });
      const ip = clientIp(request, trustedCloudflareProxy);
      if (!ip) return send(400, { error: 'invalid_request' });
      const limit = limiter.take(ip);
      if (!limit.allowed) return send(429, { error: 'rate_limited', retryAfter: limit.retryAfter }, { 'retry-after': String(limit.retryAfter) });
      if (inFlight >= maxInFlight) return send(503, { error: 'unavailable' }, { 'retry-after': '5' });
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers['content-type'] ?? '') || request.headers['content-encoding']) return send(415, { error: 'invalid_request' });
      const length = Number(request.headers['content-length']);
      if (Number.isFinite(length) && length > MAX_BODY_BYTES) return send(413, { error: 'invalid_request' });
      inFlight++; occupied = true;
      const body = await readBody(request);
      const submission = normalizeSubmission(kind, JSON.parse(body));
      const valid = await verify({ token: submission.turnstileToken, ip, action: kind === 'report' ? 'bug_report' : 'demo_survey', idempotencyKey: submission.idempotencyKey });
      if (!valid) return send(403, { error: 'verification_failed' });
      const result = store.insert(submission);
      return send(result.duplicate ? 200 : 201, { id: result.id, received: true });
    } catch (error) {
      if (error.message === 'capacity') return send(503, { error: 'unavailable' });
      if (error.message === 'conflict') return send(409, { error: 'invalid_request' });
      if (error.code?.startsWith('ERR_SQLITE') || error.code === 'ENOSPC') return send(503, { error: 'unavailable' });
      return send(error.status ?? 400, { error: 'invalid_request' });
    } finally { if (occupied) inFlight--; }
  });
  server.maxConnections = 32; server.maxHeadersCount = 32; server.maxRequestsPerSocket = 10;
  return server;
}

