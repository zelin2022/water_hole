import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync, inflateSync } from 'node:zlib';
import { canonicalPng } from '../png.mjs';
const signature = Buffer.from([137,80,78,71,13,10,26,10]);
function crc(bytes) {
  let result = 0xffffffff;
  for (const byte of bytes) { result ^= byte; for (let i=0;i<8;i++) result = (result >>> 1) ^ (0xedb88320 & -(result & 1)); }
  return (result ^ 0xffffffff) >>> 0;
}
export function chunk(type, data = Buffer.alloc(0)) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length); result.write(type,4,4,'ascii'); data.copy(result,8); result.writeUInt32BE(crc(result.subarray(4,-4)),result.length-4);
  return result;
}
export function png({ width=2,height=2,color=6,raw=null,extra=[],trailing=Buffer.alloc(0) }={}) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=color;
  return Buffer.concat([signature,chunk('IHDR',header),...extra,chunk('IDAT',deflateSync(raw ?? Buffer.alloc(height*(1+width*(color===6?4:3))))),chunk('IEND'),trailing]);
}
test('PNG input is decoded with bounds and rebuilt without metadata', () => {
  const original=png({extra:[chunk('tEXt',Buffer.from('secret\0metadata'))]});
  const result=canonicalPng(original);
  assert.equal(result.includes(Buffer.from('metadata')),false);
  assert.equal(result.includes(Buffer.from('tEXt')),false);
  assert.deepEqual(canonicalPng(result),result);
  assert.equal(inflateSync(result.subarray(41,result.length-16)).length,18);
});
test('PNG rejects hostile dimensions, malformed CRC/chunks, extra bytes and invalid filters', () => {
  assert.throws(()=>canonicalPng(png({width:50000,height:50000,raw:Buffer.alloc(1)})),/PNG/);
  assert.throws(()=>canonicalPng(png({color:3})),/PNG/);
  assert.throws(()=>canonicalPng(png({trailing:Buffer.from('payload')})),/PNG/);
  assert.throws(()=>canonicalPng(png({raw:Buffer.from([5,...Array(17).fill(0)])})),/PNG/);
  assert.throws(()=>canonicalPng(png({raw:Buffer.alloc(17)})),/PNG/);
  assert.throws(()=>canonicalPng(png({extra:[chunk('ABCD')]})),/PNG/);
  const corrupt=png();corrupt[corrupt.length-1]^=1;assert.throws(()=>canonicalPng(corrupt),/PNG/);
  const malformed=png();malformed.writeUInt32BE(0xffffffff,8);assert.throws(()=>canonicalPng(malformed),/PNG/);
});
test('PNG rejects decompression bombs and too many chunks within encoded cap',()=>{
  assert.throws(()=>canonicalPng(png({raw:Buffer.alloc(8_000_000)})),/PNG/);
  assert.throws(()=>canonicalPng(png({extra:Array.from({length:65},()=>chunk('tEXt',Buffer.from('x')))})),/PNG/);
  assert.throws(()=>canonicalPng(Buffer.alloc(1_048_577)),/PNG/);
});
test('large valid screenshots stay supported within the one MiB bound',async()=>{
  const {randomBytes}=await import('node:crypto');
  const {normalizeSubmission}=await import('../protocol.mjs');
  const width=400,height=400,stride=width*4+1,raw=randomBytes(height*stride);
  for(let row=0;row<height;row++)raw[row*stride]=0;
  const bytes=png({width,height,raw});
  const result=normalizeSubmission('report',{idempotencyKey:'5f135af1-1aa0-4474-b665-cb9f039549d0',version:'0.1.24',message:'Image test',diagnostics:'',turnstileToken:'token',screenshot:{mimeType:'image/png',data:bytes.toString('base64')}});
  assert.ok(result.screenshot.length>600000);
});
