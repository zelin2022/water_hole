import { APP_VERSION } from './release-info';

export interface GameScreenshot { mimeType: 'image/png'; data: string; width: number; height: number }
export interface FeedbackDraft {
  kind: 'bug' | 'survey'; description: string; diagnostics: string;
  screenshot?: GameScreenshot | null; rating?: number; submissionId?: string; challengeToken?: string;
}
export interface FeedbackSubmission {
  kind: 'bug' | 'survey'; version: string; description: string; diagnostics: string;
  screenshot?: GameScreenshot; rating?: number; submissionId: string; challengeToken?: string;
}
export interface BugReportDraft { description: string; diagnostics: string; screenshot: GameScreenshot | null; submissionId: string }
export const MAX_SCREENSHOT_BYTES = 1024 * 1024;

/** HTTPS is mandatory; the public service may use a dedicated nonstandard port. */
export function normalizeFeedbackEndpoint(value: string | undefined): string | null {
  if (!value || value.trim() !== value || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
    return url.href;
  } catch { return null; }
}
export function screenshotDimensions(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, 1280 / Math.max(1, width), 800 / Math.max(1, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
/** Captures only our game canvas, never the desktop or a user-selected file. */
export function captureGameScreenshot(source: HTMLCanvasElement): GameScreenshot | null {
  try {
    const target = document.createElement('canvas');
    const dimensions = screenshotDimensions(source.width, source.height);
    target.width = dimensions.width; target.height = dimensions.height;
    const context = target.getContext('2d');
    if (!context) return null;
    context.drawImage(source, 0, 0, target.width, target.height);
    const url = target.toDataURL('image/png'), data = url.split(',')[1];
    if (url.startsWith('data:image/png;base64,') && data && data.length <= Math.ceil(MAX_SCREENSHOT_BYTES / 3) * 4) {
      return { mimeType: 'image/png', data, ...dimensions };
    }
  } catch { /* A failed capture must not block a text report. */ }
  return null;
}
export function createSubmission(draft: FeedbackDraft): FeedbackSubmission {
  const description = draft.description.trim();
  if (draft.kind === 'bug' && !description) throw new Error('Please describe what happened.');
  if (description.length > 10000) throw new Error('Please keep your message within 10,000 characters.');
  if (draft.diagnostics.length > 16000) throw new Error('The game details are too long. Please shorten them.');
  if (draft.kind === 'survey' && (!Number.isInteger(draft.rating) || draft.rating! < 1 || draft.rating! > 5)) throw new Error('Please choose a rating from one to five stars.');
  const result: FeedbackSubmission = {
    kind: draft.kind, version: APP_VERSION, description, diagnostics: draft.diagnostics,
    submissionId: draft.submissionId && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(draft.submissionId) ? draft.submissionId : crypto.randomUUID(),
  };
  if (draft.kind === 'survey') result.rating = draft.rating;
  else if (draft.screenshot) {
    const image = draft.screenshot;
    if (image.mimeType !== 'image/png' || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)
      || image.data.length > Math.ceil(MAX_SCREENSHOT_BYTES / 3) * 4 || image.data.length % 4 !== 0
      || !Number.isInteger(image.width) || !Number.isInteger(image.height)
      || image.width < 1 || image.width > 1280 || image.height < 1 || image.height > 800) throw new Error('The screenshot could not be attached. Remove it and try again.');
    result.screenshot = image;
  }
  if (draft.challengeToken) result.challengeToken = draft.challengeToken;
  return result;
}
/** Old or corrupt local drafts cannot inject arbitrary image URLs into the preview. */
export function readBugDraft(raw: string | null): BugReportDraft | null {
  try {
    const saved = JSON.parse(raw ?? 'null');
    if (!saved || typeof saved.description !== 'string' || saved.description.length > 10000
      || typeof saved.diagnostics !== 'string' || saved.diagnostics.length > 16000) return null;
    const result: BugReportDraft = { description: saved.description, diagnostics: saved.diagnostics, screenshot: null, submissionId: crypto.randomUUID() };
    const normalized = createSubmission({ kind: 'bug', description: saved.description || 'Draft', diagnostics: saved.diagnostics,
      submissionId: typeof saved.submissionId === 'string' ? saved.submissionId : undefined });
    result.submissionId = normalized.submissionId;
    if (saved.screenshot) {
      try { result.screenshot = createSubmission({ ...normalized, description: 'Draft', screenshot: saved.screenshot }).screenshot ?? null; }
      catch { /* Retain the text even when the image cannot be restored. */ }
    }
    return result;
  } catch { return null; }
}
export function feedbackErrorMessage(status: number): string {
  if (status === 429) return 'Too many reports right now. Please wait a little before trying again. Your draft is kept.';
  if (status === 413) return 'This report is too large. Remove the screenshot or shorten the text and try again.';
  if (status === 400 || status === 422) return 'The report was not accepted. Check the message and try again.';
  if (status === 401 || status === 403) return 'The report needs verification. Your draft is kept; please try again later.';
  return 'The feedback service is temporarily unavailable. Please try again later. Your draft is kept.';
}
export async function sendFeedback(endpoint: string | null, payload: FeedbackSubmission, fetcher: typeof fetch = fetch): Promise<void> {
  const url = normalizeFeedbackEndpoint(endpoint ?? undefined);
  if (!url) throw new Error('Feedback is not connected yet. You can copy or download your report.');
  if (!payload.challengeToken || payload.challengeToken.length > 2048) throw new Error('Please complete verification before sending. Your draft is kept.');
  const destination = new URL(`/api/${payload.kind === 'bug' ? 'reports' : 'surveys'}`, url).href;
  const shared = { idempotencyKey: payload.submissionId, version: payload.version, diagnostics: payload.diagnostics, turnstileToken: payload.challengeToken };
  const body = payload.kind === 'bug'
    ? { ...shared, message: payload.description, screenshot: payload.screenshot ? { mimeType: payload.screenshot.mimeType, data: payload.screenshot.data } : null }
    : { ...shared, rating: payload.rating, suggestions: payload.description };
  let response: Response;
  try {
    response = await fetcher(destination, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(12000),
    });
  } catch { throw new Error('Could not connect. Check your connection and try again. Your draft is kept.'); }
  if (!response.ok) throw new Error(feedbackErrorMessage(response.status));
  try {
    const acknowledgement: unknown = await response.json();
    if (!acknowledgement || typeof acknowledgement !== 'object'
      || !('received' in acknowledgement) || acknowledgement.received !== true
      || !('id' in acknowledgement) || typeof acknowledgement.id !== 'string' || !acknowledgement.id) throw new Error('Invalid acknowledgement');
  } catch { throw new Error('Could not confirm your feedback was received. Your draft is kept; please try again.'); }
}
