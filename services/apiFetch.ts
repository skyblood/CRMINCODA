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
  // Prepend explicit origin so the resolved URL is structurally same-origin (prevents SSRF).
  return fetch(window.location.origin + s, { credentials: 'include', ...init });
}
