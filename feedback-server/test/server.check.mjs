import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { createFeedbackServer } from '../server.mjs';
import { FeedbackStore } from '../store.mjs';
import { AbuseLimiter } from '../abuse.mjs';
const payload={idempotencyKey:'5f135af1-1aa0-4474-b665-cb9f039549d0',version:'0.1.24',message:'Wall problem',diagnostics:'seed 4',turnstileToken:'token'};
async function fixture(options={}) {
  const store=new FeedbackStore(':memory:');
  const server=createFeedbackServer({store,...options});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {store,url:`http://127.0.0.1:${server.address().port}`,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();}};
}
function post(url,body=payload,headers={}) {return fetch(`${url}/api/reports`,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});}
test('production API is disabled by default without anti-abuse configuration',async()=>{
  const app=await fixture();try{assert.equal((await post(app.url)).status,503);assert.equal(app.store.list().length,0);}finally{await app.close();}
});
test('API accepts report/survey after real verification adapter and deduplicates retries',async()=>{
  const actions=[];const app=await fixture({enabled:true,verify:async value=>{actions.push(value.action);return value.token==='token';}});
  try{
    const first=await post(app.url);assert.equal(first.status,201);const result=await first.json();assert.equal(result.received,true);
    const second=await post(app.url);assert.equal(second.status,200);assert.equal((await second.json()).id,result.id);
    const survey=await fetch(`${app.url}/api/surveys`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,idempotencyKey:'8de27c59-884b-417f-9fc1-115de26ffedf',message:undefined,rating:5,suggestions:'Nice'})});
    assert.equal(survey.status,201);assert.deepEqual(actions,['bug_report','bug_report','demo_survey']);
    assert.equal((await post(app.url,{...payload,turnstileToken:'bad'})).status,403);
    assert.equal((await fetch(`${app.url}/api/reports`)).status,404);
  }finally{await app.close();}
});
test('API rejects oversized/text bodies and forged proxy identities; limits all attempts',async()=>{
  const app=await fixture({enabled:true,verify:async()=>true,limiter:new AbuseLimiter({perIp:2})});
  try{
    assert.equal((await post(app.url,{...payload,message:''},{'cf-connecting-ip':'1.1.1.1'})).status,400);
    assert.equal((await post(app.url,{...payload,message:''},{'cf-connecting-ip':'2.2.2.2'})).status,400);
    const limited=await post(app.url,payload,{'cf-connecting-ip':'3.3.3.3'});assert.equal(limited.status,429);assert.ok(limited.headers.get('retry-after'));
  }finally{await app.close();}
  const other=await fixture({enabled:true,verify:async()=>true});
  try{
    const oversized = await new Promise((resolve, reject) => {
      const request = http.request(`${other.url}/api/reports`, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '1500001' } }, response => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject); request.end('x');
    });
    assert.equal(oversized,413);
    assert.equal((await fetch(`${other.url}/api/reports`,{method:'POST',headers:{'content-type':'text/plain'},body:'hello'})).status,415);
    assert.equal((await post(other.url,payload,{origin:'https://attacker.example'})).status,403);
  }finally{await other.close();}
});
test('verification iframe exposes public site key only and validates nonce/action in separate JS',async()=>{
  const app=await fixture({enabled:true,siteKey:'0x-public-key',verify:async()=>true});
  try{
    const page=await fetch(`${app.url}/verify`);assert.equal(page.status,200);assert.match(await page.text(),/0x-public-key/);
    assert.match(page.headers.get('content-security-policy'),/challenges.cloudflare.com/);
    const script=await fetch(`${app.url}/verify.js`);assert.equal(script.status,200);assert.match(await script.text(),/water-hole-feedback-verified/);
  }finally{await app.close();}
});
test('configured verification remains testable while submissions stay closed',async()=>{
  let verificationCalls=0;
  const app=await fixture({enabled:false,siteKey:'0x-public-key',verify:async()=>{verificationCalls++;return true;}});
  try{
    const health=await fetch(`${app.url}/health`);assert.deepEqual(await health.json(),{ok:true,accepting:false});
    const page=await fetch(`${app.url}/verify`);assert.equal(page.status,200);
    assert.match(await page.text(),/data-sitekey="0x-public-key"/);
    assert.match(page.headers.get('content-security-policy'),/default-src 'none'/);
    assert.equal((await post(app.url)).status,503);
    const survey=await fetch(`${app.url}/api/surveys`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,rating:5,suggestions:'Test'})});
    assert.equal(survey.status,503);assert.equal(verificationCalls,0);assert.equal(app.store.list().length,0);
  }finally{await app.close();}
});
test('verification page stays unavailable without a valid public site key',async()=>{
  for(const siteKey of ['', 'invalid"site-key', 'a'.repeat(129)]){
    const app=await fixture({enabled:false,siteKey});
    try{assert.equal((await fetch(`${app.url}/verify`)).status,404);}finally{await app.close();}
  }
});
test('in-flight cap rejects overload before another verification call',async()=>{
  let release;const hold=new Promise(resolve=>{release=resolve;});let entered;
  const ready=new Promise(resolve=>{entered=resolve;});let calls=0;
  const app=await fixture({enabled:true,maxInFlight:1,verify:async()=>{calls++;entered();await hold;return true;}});
  try{
    const first=post(app.url);await ready;
    const second=await post(app.url,{...payload,idempotencyKey:'8de27c59-884b-417f-9fc1-115de26ffedf'});
    assert.equal(second.status,503);assert.equal(calls,1);release();assert.equal((await first).status,201);
  }finally{release();await app.close();}
});
test('trusted proxy mode requires real IP and never accepts forwarded chains',async()=>{
  const app=await fixture({enabled:true,trustedCloudflareProxy:true,verify:async()=>true});
  try{
    assert.equal((await post(app.url,payload,{'cf-connecting-ip':'1.1.1.1, 2.2.2.2'})).status,400);
    assert.equal((await post(app.url,payload,{'cf-connecting-ip':'not-an-ip'})).status,400);
    assert.equal((await post(app.url,payload)).status,400);
    assert.equal((await post(app.url,payload,{'cf-connecting-ip':'2001:db8::123'})).status,201);
  }finally{await app.close();}
});
