import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestFeedbackVerification, verifiedFeedbackToken } from './feedback-verification';

const source = {};
const expected = { source, origin: 'https://feedback.example.test', nonce: 'random-verification-nonce', action: 'bug_report' as const };
const message = () => ({ source, origin: expected.origin, data: {
  type: 'water-hole-feedback-verified', nonce: expected.nonce, action: expected.action, token: 'verified-token',
} });

describe('feedback verification message validation', () => {
  it('accepts only a token from the exact requested frame, origin, nonce, and action', () => {
    expect(verifiedFeedbackToken(message(), expected)).toBe('verified-token');
    for (const invalid of [
      { ...message(), source: {} },
      { ...message(), source: null },
      { ...message(), origin: 'https://feedback.example.test.attacker.test' },
      { ...message(), data: { ...message().data, type: 'other-event' } },
      { ...message(), data: { ...message().data, nonce: 'another-request' } },
      { ...message(), data: { ...message().data, action: 'demo_survey' } },
      { ...message(), data: null },
      { ...message(), data: [] },
      { ...message(), data: { ...message().data, token: '' } },
      { ...message(), data: { ...message().data, token: 'x'.repeat(2049) } },
      { ...message(), data: { ...message().data, token: 123 } },
    ]) expect(verifiedFeedbackToken(invalid, expected)).toBeNull();
    expect(verifiedFeedbackToken({ ...message(), source: null }, { ...expected, source: null })).toBeNull();
  });

  it('accepts the survey action only when that action was requested', () => {
    const survey = { ...message(), data: { ...message().data, action: 'demo_survey' } };
    expect(verifiedFeedbackToken(survey, { ...expected, action: 'demo_survey' })).toBe('verified-token');
    expect(verifiedFeedbackToken(survey, expected)).toBeNull();
  });
});

class FakeElement {
  children: FakeElement[] = [];
  className = '';
  id = '';
  textContent = '';
  src = '';
  title = '';
  type = '';
  referrerPolicy = '';
  inert = false;
  removed = false;
  contentWindow = {};
  attributes = new Map<string, string>();
  listeners = new Map<string, (event: any) => void>();
  focus = vi.fn();
  constructor(readonly tag: string) {}
  append(...children: FakeElement[]) { this.children.push(...children); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  addEventListener(type: string, listener: (event: any) => void) { this.listeners.set(type, listener); }
  remove() { this.removed = true; }
}

function browser() {
  const elements: FakeElement[] = [];
  const background = new FakeElement('main');
  const alreadyInert = new FakeElement('aside');
  alreadyInert.inert = true;
  const body = new FakeElement('body');
  body.append(background, alreadyInert);
  const previous = new FakeElement('button');
  const listeners = new Map<string, (event: any) => void>();
  vi.stubGlobal('document', { body, activeElement: previous,
    createElement: (tag: string) => { const element = new FakeElement(tag); elements.push(element); return element; },
    querySelector: () => null,
  });
  vi.stubGlobal('window', {
    addEventListener: (type: string, listener: (event: any) => void) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
  });
  vi.stubGlobal('crypto', { randomUUID: () => expected.nonce });
  return { elements, background, alreadyInert, previous, listeners, frame: () => elements.find(item => item.tag === 'iframe')!,
    cancel: () => elements.find(item => item.tag === 'button')!, overlay: () => elements[0] };
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('feedback verification dialog', () => {
  it('constructs a limited frame and restores focus and background after a verified response', async () => {
    const page = browser();
    const result = requestFeedbackVerification('https://feedback.example.test/', 'bug');
    const frame = page.frame();
    const url = new URL(frame.src);
    expect(url.pathname).toBe('/verify');
    expect(url.searchParams.get('nonce')).toBe(expected.nonce);
    expect(url.searchParams.get('action')).toBe('bug_report');
    expect(frame.attributes.get('sandbox')).toBe('allow-scripts allow-same-origin allow-forms');
    expect(frame.title).toBeTruthy();
    expect(page.background.inert).toBe(true);
    page.listeners.get('message')!({ ...message(), source: {} });
    expect(page.overlay().removed).toBe(false);
    page.listeners.get('message')!({ ...message(), source: frame.contentWindow });
    await expect(result).resolves.toBe('verified-token');
    expect(page.overlay().removed).toBe(true);
    expect(page.background.inert).toBe(false);
    expect(page.alreadyInert.inert).toBe(true);
    expect(page.previous.focus).toHaveBeenCalledOnce();
    expect(page.listeners.size).toBe(0);
  });

  it('cancels without accepting a later message and clears its timeout', async () => {
    vi.useFakeTimers();
    const page = browser();
    const result = requestFeedbackVerification('https://feedback.example.test/', 'survey');
    expect(new URL(page.frame().src).searchParams.get('action')).toBe('demo_survey');
    page.cancel().listeners.get('click')!({});
    await expect(result).rejects.toThrow('Verification cancelled');
    expect(page.overlay().removed).toBe(true);
    expect(page.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out after two minutes and restores the player draft panel', async () => {
    vi.useFakeTimers();
    const page = browser();
    const result = requestFeedbackVerification('https://feedback.example.test/', 'bug');
    const rejected = expect(result).rejects.toThrow('Verification timed out');
    await vi.advanceTimersByTimeAsync(120_000);
    await rejected;
    expect(page.overlay().removed).toBe(true);
    expect(page.background.inert).toBe(false);
    expect(page.listeners.size).toBe(0);
  });

  it('rejects an unsafe endpoint before creating a frame', async () => {
    const page = browser();
    await expect(requestFeedbackVerification('http://feedback.example.test/', 'bug')).rejects.toThrow('Feedback verification is unavailable');
    expect(page.elements).toHaveLength(0);
  });

  it('uses a dedicated HTTPS port without changing the expected verification origin', async () => {
    const page = browser();
    const result = requestFeedbackVerification('https://feedback.example.test:8443/', 'bug');
    expect(new URL(page.frame().src).origin).toBe('https://feedback.example.test:8443');
    const response = { ...message(), source: page.frame().contentWindow };
    page.listeners.get('message')!(response);
    expect(page.overlay().removed).toBe(false);
    page.listeners.get('message')!({ ...response, origin: 'https://feedback.example.test:8443' });
    await expect(result).resolves.toBe('verified-token');
  });
});
