import { canonicalPng } from './png.mjs';
export const MAX_BODY_BYTES = 1_500_000;
const fields = {
  report: new Set(['idempotencyKey', 'version', 'turnstileToken', 'message', 'diagnostics', 'screenshot']),
  survey: new Set(['idempotencyKey', 'version', 'turnstileToken', 'rating', 'suggestions', 'diagnostics']),
};
function string(value, name, limit, required = false) {
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) throw new Error(name);
  const result = value.trim();
  if (required && !result) throw new Error(name);
  return result;
}
export function normalizeSubmission(kind, input) {
  if (!fields[kind] || !input || typeof input !== 'object' || Array.isArray(input)) throw new Error('submission');
  for (const key of Object.keys(input)) if (!fields[kind].has(key)) throw new Error('unknown field');
  if (typeof input.idempotencyKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(input.idempotencyKey)) throw new Error('idempotencyKey');
  const value = {
    kind,
    idempotencyKey: input.idempotencyKey.toLowerCase(),
    version: string(input.version, 'version', 32, true),
    turnstileToken: string(input.turnstileToken, 'turnstileToken', 2048, true),
    diagnostics: string(input.diagnostics ?? '', 'diagnostics', 16000),
  };
  if (kind === 'survey') {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new Error('rating');
    return { ...value, rating: input.rating, suggestions: string(input.suggestions ?? '', 'suggestions', 10000) };
  }
  const message = string(input.message, 'message', 10000, true);
  let screenshot = null;
  if (input.screenshot != null) {
    const image = input.screenshot;
    if (typeof image !== 'object' || Array.isArray(image) || Object.keys(image).some(key => !['mimeType', 'data'].includes(key)) || image.mimeType !== 'image/png' || typeof image.data !== 'string' || image.data.length > 1_400_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(image.data)) throw new Error('screenshot');
    screenshot = canonicalPng(Buffer.from(image.data, 'base64'));
  }
  return { ...value, message, screenshot };
}

