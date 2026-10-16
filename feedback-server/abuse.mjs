export class AbuseLimiter {
  constructor({ perIp = 10, global = 360, windowMs = 3600_000, maxClients = 4096 } = {}) {
    this.perIp = perIp; this.global = global; this.windowMs = windowMs; this.maxClients = maxClients;
    this.clients = new Map(); this.period = null;
  }
  take(ip, now = Date.now()) {
    if (!this.period || now >= this.period.expires) this.period = { count: 0, expires: now + this.windowMs };
    const retryAfter = Math.max(1, Math.ceil((this.period.expires - now) / 1000));
    if (this.period.count >= this.global) return { allowed: false, retryAfter };
    let client = this.clients.get(ip);
    if (!client || now >= client.expires) {
      if (!client && this.clients.size >= this.maxClients) {
        for (const [key, value] of this.clients) if (now >= value.expires) this.clients.delete(key);
        if (this.clients.size >= this.maxClients) return { allowed: false, retryAfter };
      }
      client = { count: 0, expires: now + this.windowMs }; this.clients.set(ip, client);
    }
    if (client.count >= this.perIp) return { allowed: false, retryAfter: Math.max(1, Math.ceil((client.expires - now) / 1000)) };
    this.period.count++;
    client.count++;
    return { allowed: true };
  }
}
export async function verifyTurnstile({ secret, hostname, token, ip, action, idempotencyKey, now = Date.now(), fetcher = fetch }) {
  if (!secret || !hostname || !token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: ip, idempotency_key: idempotencyKey });
    const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(4000) });
    if (!response.ok) return false;
    if (!response.body) return false;
    const reader = response.body.getReader(), chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) { await reader.cancel(); return false; }
      chunks.push(Buffer.from(value));
    }
    const text = Buffer.concat(chunks).toString('utf8');
    const value = JSON.parse(text), time = Date.parse(value.challenge_ts);
    return value.success === true && value.hostname === hostname && value.action === action && Number.isFinite(time) && now - time >= -30_000 && now - time <= 300_000;
  } catch { return false; }
}
