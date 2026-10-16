import { describe, expect, it, vi } from 'vitest';
import { createSubmission, feedbackErrorMessage, normalizeFeedbackEndpoint, readBugDraft, screenshotDimensions, sendFeedback } from './report-client';

describe('feedback submission', () => {
  it('accepts only secure configured API destinations', () => {
    expect(normalizeFeedbackEndpoint('https://feedback.example/api/reports')).toBe('https://feedback.example/api/reports');
    for (const value of [undefined, '', 'http://203.0.113.1:3000', 'https://user:password@example.com', 'https://example.com/#secret']) {
      expect(normalizeFeedbackEndpoint(value)).toBeNull();
    }
  });
  it('bounds game screenshots without enlarging them', () => {
    expect(screenshotDimensions(3840, 2160)).toEqual({ width: 1280, height: 720 });
    expect(screenshotDimensions(800, 1200)).toEqual({ width: 533, height: 800 });
    expect(screenshotDimensions(320, 180)).toEqual({ width: 320, height: 180 });
  });
  it('restores bounded local drafts and discards unsafe attachments', () => {
    expect(readBugDraft('{bad')).toBeNull();
    const draft = readBugDraft(JSON.stringify({ description: 'Keep me', diagnostics: 'seed 5', screenshot: { mimeType: 'image/png', data: '<script>', width: 100, height: 100 } }));
    expect(draft?.description).toBe('Keep me');
    expect(draft?.screenshot).toBeNull();
    expect(readBugDraft(JSON.stringify({ description: 'x'.repeat(10001), diagnostics: '' }))).toBeNull();
  });
  it('requires a description for bugs and a 1–5 rating for surveys', () => {
    expect(() => createSubmission({ kind: 'bug', description: '   ', diagnostics: 'seed 42' })).toThrow(/describe/i);
    expect(() => createSubmission({ kind: 'bug', description: 'x'.repeat(10001), diagnostics: '' })).toThrow(/10,000/);
    expect(() => createSubmission({ kind: 'survey', description: '', diagnostics: '', rating: 0 })).toThrow(/rating/i);
    expect(() => createSubmission({ kind: 'survey', description: '', diagnostics: '', rating: 2.5 })).toThrow(/rating/i);
    expect(createSubmission({ kind: 'survey', description: ' Nice! ', diagnostics: 'seed 42', rating: 4 }).description).toBe('Nice!');
  });
  it('only includes a validated game screenshot on bugs', () => {
    const screenshot = { mimeType: 'image/png' as const, data: 'iVBORw0KGgo=', width: 640, height: 360 };
    expect(createSubmission({ kind: 'bug', description: 'Stuck', diagnostics: 'seed 42', screenshot }).screenshot).toEqual(screenshot);
    expect(createSubmission({ kind: 'survey', description: '', diagnostics: '', rating: 5, screenshot }).screenshot).toBeUndefined();
    expect(() => createSubmission({ kind: 'bug', description: 'Stuck', diagnostics: '', screenshot: { ...screenshot, data: '<script>' } })).toThrow(/screenshot/i);
  });
  it('sends bounded JSON with no cookies and keeps a retryable submission ID', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'accepted', received: true }), { status: 201 }));
    const draft = createSubmission({ kind: 'bug', description: 'Stuck', diagnostics: 'seed 42', submissionId: 'd7f3ed4e-f25c-4fbb-8ad1-3a053fe83044', challengeToken: 'verified-token' });
    await sendFeedback('https://feedback.example', draft, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://feedback.example/api/reports');
    expect(options.credentials).toBe('omit');
    expect(options.redirect).toBe('error');
    expect(JSON.parse(options.body)).toEqual({ idempotencyKey: draft.submissionId, version: draft.version, message: 'Stuck', diagnostics: 'seed 42', screenshot: null, turnstileToken: 'verified-token' });
  });
  it('sends surveys to their separate endpoint and refuses unverified submission', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'accepted', received: true }), { status: 201 }));
    const draft = createSubmission({ kind: 'survey', description: 'Nice caves', diagnostics: 'seed 42', rating: 5, challengeToken: 'verified-token' });
    await sendFeedback('https://feedback.example', draft, fetcher);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://feedback.example/api/surveys');
    expect(JSON.parse(options.body)).toMatchObject({ rating: 5, suggestions: 'Nice caves', turnstileToken: 'verified-token' });
    await expect(sendFeedback('https://feedback.example', { ...draft, challengeToken: undefined }, fetcher)).rejects.toThrow(/verification/i);
  });
  it('gives useful rate-limit and offline messages without destroying drafts', async () => {
    const draft = createSubmission({ kind: 'survey', description: 'Keep this text', diagnostics: '', rating: 5, challengeToken: 'verified-token' });
    await expect(sendFeedback(null, draft, vi.fn())).rejects.toThrow(/not connected/i);
    await expect(sendFeedback('https://feedback.example/api/reports', draft, vi.fn().mockResolvedValue(new Response('', { status: 429 })))).rejects.toThrow(/wait/i);
    await expect(sendFeedback('https://feedback.example/api/reports', draft, vi.fn().mockRejectedValue(new Error('network')))).rejects.toThrow(/connection/i);
    expect(draft.description).toBe('Keep this text');
    expect(feedbackErrorMessage(503)).toMatch(/try again/i);
  });
  it('requires an explicit acknowledgement before claiming feedback was received', async () => {
    const draft = createSubmission({ kind: 'survey', description: '', diagnostics: '', rating: 5, challengeToken: 'verified-token' });
    await expect(sendFeedback('https://feedback.example', draft, vi.fn().mockResolvedValue(new Response('<html>Wrong endpoint</html>', { status: 200 })))).rejects.toThrow(/confirm/i);
    await expect(sendFeedback('https://feedback.example', draft, vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))).rejects.toThrow(/confirm/i);
  });
});
