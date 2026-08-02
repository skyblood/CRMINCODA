/**
 * Centralized API fetch utility.
 *
 * sanitizeId validates that an identifier contains only URL-safe characters
 * (alphanumeric, hyphen, underscore, dot, tilde) so it cannot inject extra
 * path segments, query strings, or scheme changes into a URL.
 *
 * apiFetch enforces that every request goes to an /api/* path on the same
 * origin, preventing cross-origin requests regardless of input.
 */

const SAFE_ID_RE = /^[a-zA-Z0-9_\-.~]{1,200}$/;

/** Validates and returns an opaque ID safe for use in URL path segments. */
export function sanitizeId(id: unknown): string {
  const s = String(id ?? '');
  if (!SAFE_ID_RE.test(s)) throw new Error(`Invalid ID format: ${s.substring(0, 40)}`);
  return s;
}

const EMAIL_RE = /^[a-zA-Z0-9._%+\-]{1,64}@[a-zA-Z0-9.\-]{1,255}\.[a-zA-Z]{2,10}$/;
export function sanitizeEmail(email: unknown): string {
  const s = String(email ?? '');
  if (!EMAIL_RE.test(s)) throw new Error('Invalid email format');
  return s;
}

const HTTPS_URL_RE = /^https:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]{1,2000}$/;
export function sanitizeHttpsUrl(url: unknown): string {
  const s = String(url ?? '');
  if (!HTTPS_URL_RE.test(s)) throw new Error('Invalid HTTPS URL');
  return s;
}

/** Fetch wrapper that enforces same-origin /api/* requests. */
const API_PATH_RE = /^\/api[a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]{0,4096}$/;
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const s = String(path ?? '');
  if (!API_PATH_RE.test(s)) throw new Error('apiFetch: path blocked');
  // Resolve against the current origin, then verify the *parsed* result — not
  // just the raw string — actually lands on this same origin before ever
  // reaching fetch(). This closes the SSRF class the regex above cannot rule
  // out on its own (a value that passes the character-class check could
  // still be interpreted as a different authority once parsed as a URL).
  const url = new URL(s, window.location.origin);
  if (url.origin !== window.location.origin) {
    throw new Error('apiFetch: cross-origin request blocked');
  }
  return fetch(url, { credentials: 'include', ...init });
}
