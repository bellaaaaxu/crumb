/* Request keys for changes whose answer has not arrived.
 *
 * Every change goes out with an Idempotency-Key. When its answer is lost, the
 * change may or may not have happened; sending the same change again with the
 * same key is safe — the server either makes it or hands back what it already
 * did. So the key for a change is kept until a definite answer arrives, in
 * localStorage, so that it survives a reload of the page too.
 *
 * Kept per signed-in person: a random key, a SHA-256 fingerprint of the change
 * (not the change itself), what kind of change it was, and when. A fingerprint
 * does not hide a small change: someone using this browser could try every
 * amount until one matches "spend:<units>". So entries go once answered, and as
 * soon as their person signs out or the page finds no one, or someone else,
 * signed in here (main.js). One older than seven days is no longer used, and goes
 * with the next write of the list, which the page makes each time it learns who
 * is signed in. If the browser will not store them, this page still keeps them. */

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

  /* Takes entries out for good, from the browser as well as from this page. When nothing is
   * left, or the browser will not take the shorter list (full storage), its copy goes whole —
   * removing needs no room — so nothing of the people removed stays behind in it, not even an
   * expired or unreadable entry this page no longer reads. */
  function drop(leaves) {
    const kept = read().filter(entry => !leaves(entry));
    write(kept);
    if (kept.length === 0 || memory) {
      try {
        storage.removeItem(STORE);
      } catch {
        // blocked: the browser was given nothing to remove
      }
    }
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
    /* This person signed out: on a device people share, the next one finds none of their keys. */
    forget(actor) {
      drop(entry => entry.actor === actor);
    },
    /* Whenever the page learns who is signed in: only that person's keys stay, and none when
     * no one is (null or undefined), however the others left. */
    keepOnlyFor(actor) {
      drop(entry => actor === null || actor === undefined || entry.actor !== actor);
    },
  };
}
