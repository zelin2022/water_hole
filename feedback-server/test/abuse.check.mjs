import assert from 'node:assert/strict';
import test from 'node:test';
import { AbuseLimiter, verifyTurnstile } from '../abuse.mjs';
test('rate limits cover all attempts, expire, and cannot grow client table without bound',()=>{
  const limiter=new AbuseLimiter({perIp:2,global:4,windowMs:1000,maxClients:2});
  assert.equal(limiter.take('1.1.1.1',0).allowed,true);
  assert.equal(limiter.take('1.1.1.1',1).allowed,true);
  assert.equal(limiter.take('1.1.1.1',2).allowed,false);
  assert.equal(limiter.take('2.2.2.2',3).allowed,true);
  assert.equal(limiter.take('3.3.3.3',4).allowed,false);
  assert.equal(limiter.clients.size,2);
  assert.equal(limiter.take('3.3.3.3',1001).allowed,true);
});
test('challenge verification requires valid token, hostname, action and nonexpired time',async()=>{
  const now=Date.now();
  const success={success:true,hostname:'feedback.example.com',action:'report',challenge_ts:new Date(now-1000).toISOString()};
  const options={secret:'server-only',hostname:'feedback.example.com',token:'human-token',ip:'1.1.1.1',action:'report',idempotencyKey:'uuid',now};
  const fetcher=async(_url,request)=>{assert.equal(request.body.get('secret'),'server-only');return new Response(JSON.stringify(success));};
  assert.equal(await verifyTurnstile({...options,fetcher}),true);
  for(const patch of [{hostname:'attacker.example'},{action:'survey'},{success:false},{challenge_ts:new Date(now-301000).toISOString()}]) {
    assert.equal(await verifyTurnstile({...options,fetcher:async()=>new Response(JSON.stringify({...success,...patch}))}),false);
  }
  assert.equal(await verifyTurnstile({...options,secret:''}),false);
  assert.equal(await verifyTurnstile({...options,fetcher:async()=>{throw new Error('network');}}),false);
});
test('exhausted IP cannot burn global allowance for other addresses',()=>{
  const limiter=new AbuseLimiter({perIp:1,global:3,windowMs:1000});
  assert.equal(limiter.take('1.1.1.1',0).allowed,true);
  for(let i=0;i<10;i++)assert.equal(limiter.take('1.1.1.1',i+1).allowed,false);
  assert.equal(limiter.take('2.2.2.2',20).allowed,true);
  assert.equal(limiter.take('3.3.3.3',21).allowed,true);
  assert.equal(limiter.take('4.4.4.4',22).allowed,false);
});
