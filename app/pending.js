/* Request keys for changes whose answer has not arrived.
 *
 * Every change goes out with an Idempotency-Key. When its answer is lost, the
 * change may or may not have happened; sending the same change again with the
 * same key is safe — the server either makes it or hands back what it already
 * did. So the key for a change is kept until a definite answer arrives, in
 * localStorage, so that it survives a reload of the page too.
 *
 * Kept per signed-in person: a random key, a SHA-256 fingerprint of the change
 * (never the change itself — no names, amounts or messages), what kind of
 * change it was, and when. Entries go once answered, and after seven days in
 * any case. If the browser will not store them, this page still keeps them. */

const STORE = 'crumb.pending';
const LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 100;

export async function fingerprint(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

const wellFormed = entry => entry !== null && typeof entry === 'object' && typeof entry.actor === 'string'
  && typeof entry.kind === 'string' && typeof entry.hash === 'string' && typeof entry.key === 'string'
  && Number.isFinite(entry.at);

/**
 * `action` names a change and its values, like "grant:<member>:<units>:<message>";
 * the part before the first colon is its kind.
 */
export function pendingKeys({ storage, clock = () => Date.now(), makeKey = () => crypto.randomUUID() } = {}) {
  // null while localStorage works; this page's own list once it does not.
  let memory = null;
  const current = entries => entries.filter(entry => wellFormed(entry) && clock() - entry.at < LIFETIME_MS);

  function read() {
    if (memory) return current(memory);
    let raw;
    try {
      raw = storage.getItem(STORE);
    } catch {
      memory = [];
      return memory;
    }
    try {
      const saved = JSON.parse(raw ?? '[]');
      return Array.isArray(saved) ? current(saved) : [];
    } catch {
      return []; // unreadable leftovers are replaced on the next write
    }
  }

  function write(entries) {
    const kept = current(entries).slice(-MAX_ENTRIES);
    if (!memory) {
      try {
        storage.setItem(STORE, JSON.stringify(kept));
        return;
      } catch {
        // full, private or blocked: carry on in memory
      }
    }
    memory = kept;
  }

  return {
    /* The key for this change: the one still waiting for an answer, or a new one. */
    async keyFor(actor, action) {
      const hash = await fingerprint(action);
      const entries = read();
      const waiting = entries.find(entry => entry.actor === actor && entry.hash === hash);
      if (waiting) return waiting.key;
      const entry = { actor, kind: action.split(':')[0], hash, key: makeKey(), at: clock() };
      write([...entries, entry]);
      return entry.key;
    },
    /* A definite answer arrived: the next change like this one is a new change. */
    async settle(actor, action) {
      const hash = await fingerprint(action);
      write(read().filter(entry => !(entry.actor === actor && entry.hash === hash)));
    },
    /* When changes of this kind were sent and never answered, oldest first. */
    unconfirmed(actor, kind) {
      return read().filter(entry => entry.actor === actor && entry.kind === kind).map(entry => entry.at).sort((a, b) => a - b);
    },
  };
}
