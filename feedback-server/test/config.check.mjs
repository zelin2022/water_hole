import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../config.mjs';
test('unconfigured startup binds only loopback and remains closed',()=>{
  const config=loadConfig({});assert.equal(config.enabled,false);assert.equal(config.host,'127.0.0.1');assert.equal(config.port,3210);
});
test('production configuration requires complete secure origin and exact hostname',()=>{
  const base={PUBLIC_ORIGIN:'https://feedback.example.com',TURNSTILE_HOSTNAME:'feedback.example.com',TURNSTILE_SITE_KEY:'public-key',TURNSTILE_SECRET_KEY:'server-only',SUBMISSIONS_ENABLED:'1'};
  assert.equal(loadConfig(base).enabled,true);
  for(const patch of [{PUBLIC_ORIGIN:'http://feedback.example.com'},{PUBLIC_ORIGIN:'https://a:b@feedback.example.com'},{PUBLIC_ORIGIN:'https://feedback.example.com/path'},{TURNSTILE_HOSTNAME:'other.example.com'},{TURNSTILE_SECRET_KEY:''},{TURNSTILE_SITE_KEY:''}])assert.equal(loadConfig({...base,...patch}).enabled,false);
  assert.throws(()=>loadConfig({...base,PORT:'443'}),/port/);
  assert.throws(()=>loadConfig({...base,TRUST_PROXY:'true'}),/proxy/);
  assert.equal(loadConfig({...base,SUBMISSIONS_ENABLED:'0'}).enabled,false);
});
test('production requires an explicit on switch and allows dedicated HTTPS ports',()=>{
  const base={PUBLIC_ORIGIN:'https://feedback.example.com:8443',TURNSTILE_HOSTNAME:'feedback.example.com',TURNSTILE_SITE_KEY:'public-key',TURNSTILE_SECRET_KEY:'server-only',SUBMISSIONS_ENABLED:'1'};
  assert.equal(loadConfig(base).enabled,true);
  for(const flag of [undefined,'','true','yes','0'])assert.equal(loadConfig({...base,SUBMISSIONS_ENABLED:flag}).enabled,false);
});
