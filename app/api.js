/* The only way the product talks to the server. Same origin, cookies for the
 * session, and the CSRF token kept in memory — never in storage. */

let csrfToken = null;

export function setCsrf(token) {
  csrfToken = token;
}

export class ApiError extends Error {
  constructor(status, code, message, field) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

/**
 * `key` is the Idempotency-Key for a change. Callers create one per action
 * and reuse it for every retry of that action, so a request that reached the
 * server before the connection dropped is never recorded twice.
 */
export async function request(path, { method = 'GET', body, key, contentType } = {}) {
  const headers = {};
  const init = { method, headers, credentials: 'same-origin', cache: 'no-store' };
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  if (key) headers['Idempotency-Key'] = key;
  if (body instanceof Blob) {
    headers['Content-Type'] = contentType || body.type;
    init.body = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError(0, 'NETWORK', 'The request did not reach Crumb.');
  }
  if (response.status === 204) return null;
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new ApiError(response.status, data?.error?.code ?? `HTTP_${response.status}`, data?.error?.message, data?.error?.field);
  }
  // A retried change answered from storage: it was recorded earlier, not just now.
  if (response.headers.get('Idempotent-Replayed') === 'true' && data && typeof data === 'object')
    Object.defineProperty(data, 'replayed', { value: true });
  return data;
}

/* Loads every page of a paged list (used for short lists such as the team). */
export async function requestAll(path) {
  const items = [];
  let cursor = null;
  do {
    const separator = path.includes('?') ? '&' : '?';
    const page = await request(`${path}${separator}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

export const newKey = () => crypto.randomUUID();

/* Keys for one-tap actions on a list row: kept until the action succeeds, so
 * tapping again after a failure retries the same request instead of a new one. */
const pendingKeys = new Map();
export function keyFor(action) {
  if (!pendingKeys.has(action)) pendingKeys.set(action, newKey());
  return pendingKeys.get(action);
}
export function settleKey(action) {
  pendingKeys.delete(action);
}

/* Only a 4xx means the server looked at the request and turned it down, so nothing
 * happened and its key can go. No answer, 503, a proxy's 502/504 or any other 5xx
 * may hide a change that did happen: keep the key, so trying again is a retry. */
export const wasRefused = failure => failure.status >= 400 && failure.status < 500;
