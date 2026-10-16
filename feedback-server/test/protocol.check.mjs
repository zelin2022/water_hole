import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSubmission } from '../protocol.mjs';

const base = { idempotencyKey: '5f135af1-1aa0-4474-b665-cb9f039549d0', version: '0.1.24', turnstileToken: 'token' };
test('report rejects empty message and unknown fields before persistence', () => {
  assert.throws(() => normalizeSubmission('report', { ...base, message: '', diagnostics: '' }), /message/);
  assert.throws(() => normalizeSubmission('report', { ...base, message: 'Broken tunnel', diagnostics: '', file: 'untrusted' }), /unknown/);
});
test('survey requires integer stars between one and five', () => {
  for (const rating of [0, 6, 2.5, '5']) assert.throws(() => normalizeSubmission('survey', { ...base, rating, suggestions: '', diagnostics: '' }), /rating/);
  const value = normalizeSubmission('survey', { ...base, rating: 4, suggestions: 'Nice water', diagnostics: '' });
  assert.equal(value.rating, 4);
  assert.equal(value.kind, 'survey');
  assert.equal(value.turnstileToken, 'token');
});
test('report allows omitted screenshot and bounds text', () => {
  const value = normalizeSubmission('report', { ...base, message: ' Broken tunnel ', diagnostics: 'seed: 3' });
  assert.equal(value.message, 'Broken tunnel');
  assert.equal(value.screenshot, null);
  assert.throws(() => normalizeSubmission('report', { ...base, message: 'x'.repeat(10001), diagnostics: '' }), /message/);
  assert.throws(() => normalizeSubmission('report', { ...base, message: 'x', diagnostics: 'x'.repeat(16001) }), /diagnostics/);
});
test('rejects cheap text failures before processing an image',()=>{
  assert.throws(()=>normalizeSubmission('report',{...base,message:'',screenshot:{mimeType:'image/png',data:'AAAA'}}),/message/);
});
