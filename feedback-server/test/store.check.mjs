import assert from 'node:assert/strict';
import test from 'node:test';
import { FeedbackStore } from '../store.mjs';
const report = {kind:'report',idempotencyKey:'5f135af1-1aa0-4474-b665-cb9f039549d0',version:'0.1.24',message:'A bug',diagnostics:'seed: 4',turnstileToken:'never-store',screenshot:null};
test('store persists private reports, deduplicates retries and rejects changed replay',()=>{
  const store=new FeedbackStore(':memory:');
  try {
    const first=store.insert(report,1000);
    assert.equal(first.duplicate,false);
    const again=store.insert({...report,turnstileToken:'fresh-token'},1001);
    assert.equal(again.duplicate,true);
    assert.equal(again.id,first.id);
    assert.equal(store.list().length,1);
    assert.equal(JSON.stringify(store.get(first.id)).includes('never-store'),false);
    assert.throws(()=>store.insert({...report,message:'Different'},1002),/conflict/);
  } finally {store.close();}
});
test('store enforces storage/count budgets and deletes expired reports',()=>{
  const store=new FeedbackStore(':memory:',{maxReports:1,maxBytes:1024,retentionMs:100});
  try {
    store.insert(report,1000);
    assert.throws(()=>store.insert({...report,idempotencyKey:'8de27c59-884b-417f-9fc1-115de26ffedf'},1001),/capacity/);
    assert.equal(store.insert({...report,idempotencyKey:'8de27c59-884b-417f-9fc1-115de26ffedf'},1200).duplicate,false);
    assert.equal(store.list().length,1);
    store.setStatus(store.list()[0].id,'resolved');
    assert.equal(store.list()[0].status,'resolved');
    assert.throws(()=>store.setStatus(store.list()[0].id,'arbitrary'),/status/);
  } finally {store.close();}
});
