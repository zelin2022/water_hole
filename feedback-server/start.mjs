import { mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { FeedbackStore } from './store.mjs';
import { verifyTurnstile } from './abuse.mjs';
import { createFeedbackServer } from './server.mjs';
const config = loadConfig();
process.umask(0o077);
mkdirSync(path.dirname(config.databasePath), { recursive: true, mode: 0o700 });
const store = new FeedbackStore(config.databasePath);
chmodSync(config.databasePath, 0o600);
store.prune();
const server = createFeedbackServer({ ...config, store, verify: value => verifyTurnstile({ ...value, secret: config.secret, hostname: config.hostname }) });
server.listen(config.port, config.host, () => console.log(`Feedback service listening on localhost:${config.port}; submissions ${config.enabled ? 'enabled' : 'disabled (configure HTTPS and Turnstile)'}.`));
function stop() { server.close(() => { store.close(); process.exit(0); }); server.closeAllConnections(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
