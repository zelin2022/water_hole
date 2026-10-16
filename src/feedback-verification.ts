import { normalizeFeedbackEndpoint } from './report-client';

export type FeedbackVerificationAction = 'bug_report' | 'demo_survey';

interface VerificationMessage {
  source: unknown;
  origin: string;
  data: unknown;
}
interface ExpectedVerification {
  source: unknown;
  origin: string;
  nonce: string;
  action: FeedbackVerificationAction;
}

/** An unrelated frame, old request or forged parent-window message cannot complete a check. */
export function verifiedFeedbackToken(message: VerificationMessage, expected: ExpectedVerification): string | null {
  if (expected.source === null || expected.source === undefined
    || message.source !== expected.source || message.origin !== expected.origin) return null;
  const data = message.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const value = data as Record<string, unknown>;
  if (value.type !== 'water-hole-feedback-verified' || value.nonce !== expected.nonce
    || value.action !== expected.action || typeof value.token !== 'string'
    || value.token.length < 1 || value.token.length > 2048) return null;
  return value.token;
}

/** The server-hosted challenge keeps provider scripts out of the game's own renderer. */
export function requestFeedbackVerification(baseURL: string, kind: 'bug' | 'survey'): Promise<string> {
  const normalized = normalizeFeedbackEndpoint(baseURL);
  if (!normalized || document.querySelector('[data-feedback-verification]')) {
    return Promise.reject(new Error('Feedback verification is unavailable. Please try again.'));
  }
  const action: FeedbackVerificationAction = kind === 'bug' ? 'bug_report' : 'demo_survey';
  const nonce = crypto.randomUUID();
  const url = new URL('/verify', normalized);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('action', action);

  return new Promise<string>((resolve, reject) => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const background = Array.from(document.body.children).map(element => ({
      element: element as HTMLElement, inert: (element as HTMLElement).inert,
    }));
    const overlay = document.createElement('div');
    overlay.className = 'feedback-verification-overlay';
    overlay.setAttribute('data-feedback-verification', '');
    const dialog = document.createElement('div');
    dialog.className = 'feedback-verification-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'feedback-verification-title');
    const heading = document.createElement('h2');
    heading.id = 'feedback-verification-title';
    heading.textContent = 'One quick check';
    const description = document.createElement('p');
    description.textContent = 'Complete this check to help keep feedback free of spam. Your draft stays here if you cancel.';
    const frame = document.createElement('iframe');
    frame.className = 'feedback-verification-frame';
    frame.title = 'Feedback human verification';
    frame.src = url.href;
    frame.referrerPolicy = 'no-referrer';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'menu-button';
    cancel.textContent = 'Cancel';
    dialog.append(heading, description, frame, cancel);
    overlay.append(dialog);
    for (const item of background) item.element.inert = true;
    document.body.append(overlay);

    let settled = false;
    const finish = (token: string | null, error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      window.removeEventListener('keydown', onKey, true);
      for (const item of background) item.element.inert = item.inert;
      overlay.remove();
      previousFocus?.focus();
      if (token !== null) resolve(token);
      else reject(new Error(error));
    };
    const cancelVerification = () => finish(null, 'Verification cancelled. Your feedback draft has been kept.');
    const onMessage = (event: MessageEvent) => {
      const token = verifiedFeedbackToken(event, { source: frame.contentWindow, origin: url.origin, nonce, action });
      if (token !== null) finish(token);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelVerification();
    };
    const timer = setTimeout(() => finish(null,
      'Verification timed out. Your feedback draft has been kept; please try again.'), 120_000);
    window.addEventListener('message', onMessage);
    window.addEventListener('keydown', onKey, true);
    cancel.addEventListener('click', cancelVerification);
    cancel.focus();
  });
}
