import { deflateSync, inflateSync } from 'node:zlib';
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export const MAX_PNG_BYTES = 1_048_576;
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length); result.write(type, 4, 4, 'ascii'); data.copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
  return result;
}
/** Strict canvas PNG subset. Strip all ancillary data and rebuild checked pixels. */
export function canonicalPng(bytes) {
  const invalid = () => { throw new Error('Invalid PNG screenshot'); };
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_PNG_BYTES || bytes.length < 57 || !bytes.subarray(0, 8).equals(SIGNATURE)) invalid();
  let position = 8, count = 0, header = null, ended = false, dataEnded = false;
  const pieces = [];
  while (position < bytes.length) {
    if (++count > 64 || position + 12 > bytes.length || ended) invalid();
    const length = bytes.readUInt32BE(position);
    if (length > MAX_PNG_BYTES || position + 12 + length > bytes.length) invalid();
    const type = bytes.toString('latin1', position + 4, position + 8);
    if (!/^[A-Za-z]{4}$/u.test(type) || type[2] !== type[2].toUpperCase()) invalid();
    const payload = bytes.subarray(position + 8, position + 8 + length);
    if (crc32(bytes.subarray(position + 4, position + 8 + length)) !== bytes.readUInt32BE(position + 8 + length)) invalid();
    if (!header && type !== 'IHDR') invalid();
    if (type === 'IHDR') {
      if (header || length !== 13) invalid();
      header = Buffer.from(payload);
      const width = header.readUInt32BE(0), height = header.readUInt32BE(4);
      if (!width || !height || width > 1600 || height > 1200 || width * height > 1_920_000 || header[8] !== 8 || ![2, 6].includes(header[9]) || header[10] || header[11] || header[12]) invalid();
    } else if (type === 'IDAT') {
      if (dataEnded) invalid();
      pieces.push(payload);
    } else if (type === 'IEND') {
      if (length || !pieces.length) invalid();
      ended = true;
    } else {
      if (type[0] === type[0].toUpperCase()) invalid();
      if (pieces.length) dataEnded = true;
    }
    position += 12 + length;
  }
  if (!ended) invalid();
  const stride = 1 + header.readUInt32BE(0) * (header[9] === 6 ? 4 : 3);
  const expected = stride * header.readUInt32BE(4);
  const compressed = Buffer.concat(pieces);
  let result;
  try { result = inflateSync(compressed, { maxOutputLength: expected, info: true }); } catch { invalid(); }
  if (result.buffer.length !== expected || result.engine.bytesWritten !== compressed.length) invalid();
  for (let row = 0; row < result.buffer.length; row += stride) if (result.buffer[row] > 4) invalid();
  const encoded = Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(result.buffer, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
  if (encoded.length > MAX_PNG_BYTES) invalid();
  return encoded;
}
