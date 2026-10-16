import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
const STATES = new Set(['new', 'reviewed', 'resolved', 'spam']);
export class FeedbackStore {
  constructor(path, { maxReports = 5000, maxBytes = 256 * 1024 ** 2, retentionMs = 90 * 86400_000 } = {}) {
    this.maxReports = maxReports; this.maxBytes = maxBytes; this.retentionMs = retentionMs;
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=DELETE; PRAGMA cache_size=-2048; PRAGMA busy_timeout=1000; PRAGMA max_page_count=${Math.max(32, Math.ceil(maxBytes / 4096))};
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, replay_key TEXT NOT NULL UNIQUE, digest TEXT NOT NULL,
        created INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'new', body TEXT NOT NULL, image BLOB, bytes INTEGER NOT NULL
      ); CREATE INDEX IF NOT EXISTS feedback_created ON feedback(created);`);
  }
  insert(submission, now = Date.now()) {
    const { turnstileToken: _token, screenshot: image = null, idempotencyKey, ...body } = submission;
    const encoded = JSON.stringify(body);
    const digest = createHash('sha256').update(encoded).update(image ?? Buffer.alloc(0)).digest('hex');
    const prior = this.db.prepare('SELECT id,digest FROM feedback WHERE replay_key=?').get(idempotencyKey);
    if (prior) {
      if (prior.digest !== digest) throw new Error('conflict');
      return { id: prior.id, duplicate: true };
    }
    this.db.prepare('DELETE FROM feedback WHERE created<?').run(now - this.retentionMs);
    const usage = this.db.prepare('SELECT count(*) AS count,coalesce(sum(bytes),0) AS bytes FROM feedback').get();
    const bytes = Buffer.byteLength(encoded) + (image?.length ?? 0) + 256;
    if (usage.count >= this.maxReports || usage.bytes + bytes > this.maxBytes) throw new Error('capacity');
    const id = randomUUID();
    try { this.db.prepare('INSERT INTO feedback(id,kind,replay_key,digest,created,body,image,bytes) VALUES(?,?,?,?,?,?,?,?)').run(id, body.kind, idempotencyKey, digest, now, encoded, image, bytes); }
    catch (error) { if (error.code === 'ERR_SQLITE_ERROR' && /full/iu.test(error.message)) throw new Error('capacity'); throw error; }
    return { id, duplicate: false };
  }
  list(limit = 100) { return this.db.prepare('SELECT id,kind,created,status,bytes FROM feedback ORDER BY created DESC LIMIT ?').all(Math.min(Math.max(limit, 1), 500)); }
  get(id) {
    const row = this.db.prepare('SELECT id,created,status,body,image FROM feedback WHERE id=?').get(id);
    return row ? { id: row.id, created: row.created, status: row.status, ...JSON.parse(row.body), screenshot: row.image ? Buffer.from(row.image) : null } : null;
  }
  setStatus(id, status) {
    if (!STATES.has(status)) throw new Error('status');
    return this.db.prepare('UPDATE feedback SET status=? WHERE id=?').run(status, id).changes;
  }
  prune(now = Date.now()) { return this.db.prepare('DELETE FROM feedback WHERE created<?').run(now - this.retentionMs).changes; }
  close() { this.db.close(); }
}
