import path from 'node:path';
function secureOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash ? url.origin : null;
  } catch { return null; }
}
export function loadConfig(env = process.env) {
  const port = Number(env.PORT ?? 3210);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('port must be an unprivileged localhost port');
  if (env.TRUST_PROXY && env.TRUST_PROXY !== 'cloudflare-tunnel') throw new Error('proxy must be explicitly cloudflare-tunnel or unset');
  const publicOrigin = secureOrigin(env.PUBLIC_ORIGIN);
  const hostname = env.TURNSTILE_HOSTNAME ?? '';
  const siteKey = env.TURNSTILE_SITE_KEY ?? '';
  const secret = env.TURNSTILE_SECRET_KEY ?? '';
  const enabled = Boolean(env.SUBMISSIONS_ENABLED === '1' && publicOrigin && hostname === new URL(publicOrigin).hostname && /^[A-Za-z0-9_-]{1,128}$/u.test(siteKey) && secret.trim());
  const origins = ['null'];
  for (const origin of (env.ALLOWED_WEB_ORIGINS ?? '').split(',').filter(Boolean)) {
    const normalized = secureOrigin(origin);
    if (!normalized) throw new Error('web origins must be HTTPS origins');
    origins.push(normalized);
  }
  return { host: '127.0.0.1', port, publicOrigin, hostname, siteKey, secret, enabled, origins,
    trustedCloudflareProxy: env.TRUST_PROXY === 'cloudflare-tunnel',
    databasePath: path.resolve(env.FEEDBACK_DB ?? 'feedback-server/data/feedback.sqlite'),
  };
}
