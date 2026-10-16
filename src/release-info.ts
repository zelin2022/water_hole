declare const __APP_VERSION__: string;

export const APP_VERSION = __APP_VERSION__;
export const DEMO_LABEL = `Demo v${APP_VERSION}`;

/** Links are opt-in build configuration; no endpoint is contacted automatically. */
export function normalizeReleaseLink(value: string | undefined): string | null {
  if (!value || value.trim() !== value || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
    return url.href;
  } catch { return null; }
}

export const FEEDBACK_URL = normalizeReleaseLink(import.meta.env.VITE_FEEDBACK_URL);
export const STORE_URL = normalizeReleaseLink(import.meta.env.VITE_STORE_URL);
