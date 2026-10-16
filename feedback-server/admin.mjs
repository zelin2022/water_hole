import { writeFileSync } from 'node:fs';
import { loadConfig } from './config.mjs';
import { FeedbackStore } from './store.mjs';
const [command = 'list', id, argument] = process.argv.slice(2);
const store = new FeedbackStore(loadConfig().databasePath);
try {
  if (command === 'list') console.log(JSON.stringify(store.list(), null, 2));
  else if (command === 'show' && id) {
    const report = store.get(id); if (!report) throw new Error('Unknown report');
    const { screenshot, ...body } = report;
    console.log(JSON.stringify({ ...body, screenshotBytes: screenshot?.length ?? 0 }, null, 2));
  } else if (command === 'status' && id && argument) console.log(JSON.stringify({ updated: store.setStatus(id, argument) }));
  else if (command === 'screenshot' && id && argument) {
    const bytes = store.get(id)?.screenshot; if (!bytes) throw new Error('No screenshot');
    writeFileSync(argument, bytes, { flag: 'wx', mode: 0o600 }); console.log('Screenshot exported to the requested local file.');
  } else if (command === 'prune') console.log(JSON.stringify({ deleted: store.prune() }));
  else throw new Error('Usage: admin.mjs list | show ID | status ID new|reviewed|resolved|spam | screenshot ID OUTPUT.png | prune');
} finally { store.close(); }
