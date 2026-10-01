/* The only way the product talks to the server. Same origin, cookies for the
 * session, and the CSRF token kept in memory — never in storage. */

import { pendingKeys } from './pending.js';

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
  let data;
  try {
    data = await response.json();
  } catch {
    data = undefined;
  }
  if (!response.ok) {
    throw new ApiError(response.status, data?.error?.code ?? `HTTP_${response.status}`, data?.error?.message, data?.error?.field);
  }
  // A success whose answer did not arrive whole: the change may well have been made, but this
  // page cannot know what it was. Treated like no answer at all, so the caller keeps its request
  // key and sending again is a safe retry, not a second change.
  if (data === null || typeof data !== 'object')
    throw new ApiError(0, 'INCOMPLETE_ANSWER', 'The answer from Crumb did not arrive completely.');
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

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/* Request keys, kept until a definite answer — across reloads, per signed-in
 * person (see pending.js). `action` names the change and its values, so the
 * same change sent again after a lost answer reuses its key. */
const pending = pendingKeys({ storage: browserStorage() });
let actor = 'signed-out';
export function setActor(userId) {
  actor = userId ?? 'signed-out';
}
export const keyFor = action => pending.keyFor(actor, action);
export const settleKey = action => pending.settle(actor, action);
export const unconfirmedSince = kind => pending.unconfirmed(actor, kind);
/* A key's fingerprint can give away a small change, so on a device people share the next
 * person must find none of them: signing out forgets the leaving person's, and each time
 * the page learns who is signed in only theirs stay (none when no one is). Someone who
 * signs out with a change unanswered loses the notice that it was not confirmed. */
export const forgetPendingFor = userId => pending.forget(userId);
export const keepPendingOnlyFor = userId => pending.keepOnlyFor(userId);

/* Only a 4xx means the server looked at the request and turned it down, so nothing
 * happened and its key can go. No answer, 503, a proxy's 502/504 or any other 5xx
 * may hide a change that did happen: keep the key, so trying again is a retry. */
export const wasRefused = failure => failure.status >= 400 && failure.status < 500;
