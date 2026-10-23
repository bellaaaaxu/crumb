/* The usage note: a few lines the owner writes on Settings about what the balance can be used
 * for, shown on the member page under "I grabbed something" when the team records its own
 * spending. The field counts characters the way the server and the database do (Unicode code
 * points of the trimmed text), so it has no maxlength, and the check happens on Save. Every
 * person, team and note here is invented. */
import { test, expect } from '@playwright/test';
import { keyIn, provision } from './fixtures.mjs';

const TOO_LONG = 'Keep it to 200 characters or fewer.';

let requests = 0;
const key = () => ({ 'idempotency-key': `e2e-usage-note-${String(++requests).padStart(4, '0')}` });

/* The owner changes the team's settings through the API, as a second device would. */
const ownerSets = async (fx, fields) => {
  const answer = await fx.api.request('PATCH', '/api/org', fields);
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
};

/* The note as a screen reader finds it: a region named by its title. */
const noteRegion = page => page.getByRole('region', { name: 'How to use it', exact: true });

const NOTE = 'Any drink from the counter.\nOnce a day.\n<b>hi</b> https://example.com';

const openSettings = async (fx) => {
  await fx.ownerPage.goto(`${fx.origin}/#/settings`);
  const note = fx.ownerPage.getByLabel('How to use the balance', { exact: true });
  await expect(note).toBeVisible();
  return note;
};

/* Save, and wait for the server's answer, so a reload straight after cannot cut it off. */
async function save(page) {
  const [response] = await Promise.all([
    page.waitForResponse(answer => answer.request().method() === 'PATCH' && new URL(answer.url()).pathname === '/api/org'),
    page.getByRole('button', { name: 'Save settings', exact: true }).click(),
  ]);
  expect(response.status()).toBe(200);
}

test('the owner writes a usage note in Settings, and it is saved with its line breaks', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points', spending: 'self' });
  try {
    const page = fx.ownerPage;
    const note = await openSettings(fx);

    // It sits after the "How people spend" note and before the contact links.
    const above = await page.getByText('Change it whenever.').boundingBox();
    const field = await note.boundingBox();
    const below = await page.getByRole('heading', { name: 'Contact and feedback', exact: true }).boundingBox();
    expect(above.y).toBeLessThan(field.y);
    expect(field.y).toBeLessThan(below.y);

    // Characters are counted on Save, not by the browser: no maxlength, which counts an emoji as two.
    await expect(note).not.toHaveAttribute('maxlength', /.*/);
    await expect(note).toHaveAttribute('placeholder',
      'For example: Any drink or light meal from the counter. Let whoever’s on shift know first. Once a day per person.');
    await expect(note).toHaveValue('');
    await expect(page.getByText(/Optional, a few lines: what it can be used for/)).toBeVisible();

    await note.fill('Any drink from the counter.\nOnce a day.');
    await save(page);
    await page.reload();
    await expect(page.getByLabel('How to use the balance', { exact: true })).toHaveValue('Any drink from the counter.\nOnce a day.');
  } finally {
    await fx.close();
  }
});

test('the usage note field is there to edit when the team confirms requests, and the note is kept', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points', spending: 'confirm' });
  try {
    const page = fx.ownerPage;
    const note = await openSettings(fx);
    await expect(note).toBeEditable();
    await note.fill('Ask at the counter first.');
    await save(page);
    await page.reload();
    await expect(page.getByLabel('How to use the balance', { exact: true })).toHaveValue('Ask at the counter first.');
  } finally {
    await fx.close();
  }
});

test('the field counts as the server does: 200 characters save, 201 are stopped before sending', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points', spending: 'self' });
  try {
    const page = fx.ownerPage;
    const sent = [];
    page.on('request', request => {
      if (request.method() === 'PATCH' && new URL(request.url()).pathname === '/api/org') sent.push(request);
    });
    let note = await openSettings(fx);

    // 200 each of a CJK character, a CJK character with one line break inside, and a one-code-point emoji.
    const fits = ['字'.repeat(200), `${'字'.repeat(100)}\n${'字'.repeat(99)}`, '😀'.repeat(200)];
    for (const value of fits) {
      await note.fill(value);
      await save(page);
      await page.reload();
      note = page.getByLabel('How to use the balance', { exact: true });
      await expect(note).toHaveValue(value);
      await expect(note).not.toHaveAttribute('aria-invalid', 'true');
    }
    // The listener works: each of those saves was seen.
    expect(sent).toHaveLength(fits.length);

    // One more is refused on the page, with the message on the field and the focus there.
    for (const value of ['字'.repeat(201), '😀'.repeat(201)]) {
      await note.fill(value);
      await page.getByRole('button', { name: 'Save settings', exact: true }).click();
      await expect(page.getByText(TOO_LONG, { exact: true })).toBeVisible();
      await expect(note).toHaveAttribute('aria-invalid', 'true');
      await expect(note).toHaveAccessibleDescription(/Keep it to 200 characters or fewer\./);
      await expect(note).toBeFocused();
      // The check runs before anything is sent.
      expect(sent).toHaveLength(fits.length);
      // Nothing was saved: a fresh page still has the last note that fit.
      await page.reload();
      note = page.getByLabel('How to use the balance', { exact: true });
      await expect(note).toHaveValue(fits[2]);
    }

    // Mended while another field is still wrong, so the form stays as it is and is not drawn
    // again: Save clears the note's mistake, keeps the other one, and sends nothing.
    const orgName = page.getByLabel('Organization name', { exact: true });
    await note.fill('字'.repeat(201));
    await orgName.fill('');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(note).toHaveAttribute('aria-invalid', 'true');
    await expect(orgName).toHaveAttribute('aria-invalid', 'true');
    await note.fill('Any drink from the counter.');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(orgName).toHaveAttribute('aria-invalid', 'true');
    await expect(orgName).toBeFocused();
    await expect(note).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText(TOO_LONG, { exact: true })).toBeHidden();
    expect(sent).toHaveLength(fits.length);

    // With the name back, the note saves.
    await orgName.fill('Northside Coffee Co.');
    await save(page);
    await page.reload();
    await expect(page.getByLabel('How to use the balance', { exact: true })).toHaveValue('Any drink from the counter.');
    // Counted at the end, so a request the refused saves wrongly sent would show up here.
    expect(sent).toHaveLength(fits.length + 1);
  } finally {
    await fx.close();
  }
});

test('the field counts after trimming, as the server does: 200 characters between spaces and a line break save', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points', spending: 'self' });
  try {
    const page = fx.ownerPage;
    const saved = [];
    page.on('response', answer => {
      if (answer.request().method() === 'PATCH' && new URL(answer.url()).pathname === '/api/org') saved.push(answer.status());
    });
    const note = await openSettings(fx);
    const padded = `  ${'字'.repeat(200)}\n`;
    expect([...padded]).toHaveLength(203);
    await note.fill(padded);
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    // Not too long once trimmed: no mistake on the field, and it is sent and saved.
    await expect(note).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText(TOO_LONG, { exact: true })).toHaveCount(0);
    await expect.poll(() => saved).toEqual([200]);
    await page.reload();
    await expect(page.getByLabel('How to use the balance', { exact: true })).toHaveValue('字'.repeat(200));
  } finally {
    await fx.close();
  }
});

/* ------------------------------------------------------------------ on the member page */

const jotButton = page => page.getByRole('button', { name: 'I grabbed something', exact: true });

test('with no usage note the member page is as before', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points', spending: 'self' });
  try {
    await ownerSets(fx, { welcome: 'Thanks for stopping by.' });
    const page = fx.memberPage;
    await page.reload();
    await expect(jotButton(page)).toBeVisible();
    await expect(page.locator('.usage-note')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'How to use it' })).toHaveCount(0);
    // After the tile: the button, the daily line, the log, the welcome line, and nothing else.
    const after = await page.locator('main > .main-tile ~ *').evaluateAll(nodes =>
      nodes.map(node => `${node.tagName.toLowerCase()}.${[...node.classList].join('.')}`));
    expect(after).toEqual(['button.btn.btn-primary.act', 'p.actions-hint', 'section.quest', 'p.daily']);

    // Spaces and blank lines are no note: the server saves them as empty.
    await ownerSets(fx, { usageNote: '  \n \n  ' });
    await page.reload();
    await expect(jotButton(page)).toBeVisible();
    await expect(page.locator('.usage-note')).toHaveCount(0);
  } finally {
    await fx.close();
  }
});

test('a note of only spaces and blank lines from the database draws nothing either', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points', spending: 'self' });
  try {
    const page = fx.memberPage;
    // As a database edited by hand might hold it: the server trims what it saves, not what it
    // finds. The handler only counts what it served; the count is checked after the load.
    let served = 0;
    await page.route(url => url.pathname === '/api/me', async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.org.usageNote = '  \n  ';
      served += 1;
      await route.fulfill({ response, json: body });
    });
    await page.reload();
    await expect(jotButton(page)).toBeVisible();
    expect(served, 'the page was given the note of spaces').toBeGreaterThan(0);
    await expect(page.locator('.usage-note')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'How to use it' })).toHaveCount(0);
  } finally {
    await fx.close();
  }
});

test('a usage note shows under the button and the daily line, line by line, as plain text', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points', spending: 'self' });
  try {
    await ownerSets(fx, { usageNote: NOTE });
    const page = fx.memberPage;
    await page.reload();
    const region = noteRegion(page);
    await expect(region).toBeVisible();
    await expect(region.getByRole('heading', { name: 'How to use it', level: 2 })).toBeVisible();

    // Directly after the daily line, before the log.
    await expect(page.locator('.actions-hint + .usage-note + .quest')).toHaveCount(1);
    const hint = await page.locator('.actions-hint').boundingBox();
    const box = await region.boundingBox();
    const log = await page.locator('.quest').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(hint.y + hint.height);
    expect(log.y).toBeGreaterThanOrEqual(box.y + box.height);

    // Plain text with its line breaks: three lines, the markup and the link printed as typed.
    const text = region.locator('.usage-text');
    expect(await text.evaluate(node => node.innerText)).toBe(NOTE);
    const lines = await text.evaluate(node => node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight));
    expect(Math.round(lines)).toBe(3);
    await expect(region.locator('b, a')).toHaveCount(0);
    expect(await text.evaluate(node => node.children.length)).toBe(0);
  } finally {
    await fx.close();
  }
});

test('a team that confirms what people spend does not see the note, and sees it again after switching back', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points', spending: 'self' });
  try {
    await ownerSets(fx, { usageNote: 'Any drink from the counter.\nOnce a day.' });
    const page = fx.memberPage;
    await page.reload();
    await expect(noteRegion(page)).toBeVisible();

    // Confirming: the page is the benefit list, and the note is nowhere on it.
    await ownerSets(fx, { spending: 'confirm' });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Benefits' })).toBeVisible();
    await expect(page.locator('.usage-note')).toHaveCount(0);
    await expect(page.getByText('Any drink from the counter.')).toHaveCount(0);

    // Switching the mode kept the note: back to recording it is there as written.
    await ownerSets(fx, { spending: 'self' });
    await page.reload();
    await expect(jotButton(page)).toBeVisible();
    await expect(noteRegion(page).locator('.usage-text')).toHaveText('Any drink from the counter.\nOnce a day.');
  } finally {
    await fx.close();
  }
});

test('the keypad does not repeat the note', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points', spending: 'self' });
  try {
    await ownerSets(fx, { usageNote: 'Any drink from the counter.\nOnce a day.' });
    const page = fx.memberPage;
    await page.reload();
    await expect(noteRegion(page)).toBeVisible();
    await jotButton(page).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('group', { name: 'Amount keypad' })).toBeVisible();
    await expect(dialog).not.toContainText('Any drink from the counter.');
    await expect(dialog).not.toContainText('Once a day.');
    await expect(dialog.getByText('How to use it')).toHaveCount(0);
  } finally {
    await fx.close();
  }
});

test('a 200-character note and a long unbroken link fit a 375-pixel phone', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points', spending: 'self' });
  try {
    const page = fx.memberPage;
    await page.setViewportSize({ width: 375, height: 667 });
    const notes = [
      // Two hundred characters of ordinary words.
      `${'Ask first. '.repeat(18)}Ok`,
      // A 120-character link in a sentence.
      `Menu: https://example.com/${'a'.repeat(100)}`,
      // The worst case: one unbroken 200-character word of the widest letter.
      'W'.repeat(200),
    ];
    expect([...notes[0]]).toHaveLength(200);
    expect(notes[1].split(' ')[1]).toHaveLength(120);
    expect([...notes[2]]).toHaveLength(200);
    for (const usageNote of notes) {
      await ownerSets(fx, { usageNote });
      await page.reload();
      const region = noteRegion(page);
      await expect(region).toBeVisible();
      expect(await region.locator('.usage-text').evaluate(node => node.innerText)).toBe(usageNote);
      const fits = await page.evaluate(() => ({
        page: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
        note: [document.querySelector('.usage-note').scrollWidth, document.querySelector('.usage-note').clientWidth],
      }));
      expect(fits.page[0], `the page for “${usageNote.slice(0, 20)}…”`).toBeLessThanOrEqual(fits.page[1]);
      expect(fits.note[0], `the note for “${usageNote.slice(0, 20)}…”`).toBeLessThanOrEqual(fits.note[1]);
    }
  } finally {
    await fx.close();
  }
});

test('the note takes space only below the daily line', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points', spending: 'self' });
  try {
    const page = fx.memberPage;
    const boxes = async () => {
      await page.reload();
      await expect(jotButton(page)).toBeVisible();
      // With less motion asked for, every property change is a 0.01 ms transition that lasts
      // until the next frame; the page's column narrowing to the member page is one. Read the
      // boxes once those have ended, not the column's first, wider width.
      await page.evaluate(async () => {
        for (let round = 0; round < 50; round += 1) {
          const moving = document.getAnimations().filter(animation => animation instanceof CSSTransition && animation.playState !== 'finished');
          if (!moving.length) return;
          await Promise.all(moving.map(animation => animation.finished.catch(() => {})));
        }
        throw new Error('transitions still running');
      });
      return { button: await jotButton(page).boundingBox(), hint: await page.locator('.actions-hint').boundingBox() };
    };
    const same = (now, before) => {
      for (const side of ['x', 'y', 'width', 'height']) expect(Math.abs(now[side] - before[side]), side).toBeLessThanOrEqual(1);
    };
    const without = await boxes();

    await ownerSets(fx, { usageNote: NOTE });
    const withNote = await boxes();
    same(withNote.button, without.button);
    same(withNote.hint, without.hint);
    const note = await noteRegion(page).boundingBox();
    const log = await page.locator('.quest').boundingBox();
    // Below the daily line, and above the log: it overlaps neither.
    expect(note.y).toBeGreaterThanOrEqual(withNote.hint.y + withNote.hint.height);
    expect(log.y).toBeGreaterThanOrEqual(note.y + note.height);
    expect(note.height).toBeGreaterThan(0);

    // Cleared by the owner, the page is where it was.
    await ownerSets(fx, { usageNote: '' });
    const cleared = await boxes();
    same(cleared.button, without.button);
    same(cleared.hint, without.hint);
    await expect(page.locator('.usage-note')).toHaveCount(0);
  } finally {
    await fx.close();
  }
});

test('a note set while the page is open appears after the next entry', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '10.00', mode: 'credit', reason: '' }, key());
    const page = fx.memberPage;
    await page.reload();
    await expect(page.getByTestId('available-balance')).toHaveText('$10.00');
    await expect(page.locator('.usage-note')).toHaveCount(0);
    // Marks this document: a reload would lose it.
    await page.evaluate(() => { window.__sameDocument = true; });

    const jot = async (digits, balance) => {
      await jotButton(page).click();
      await keyIn(page, digits);
      await page.getByRole('button', { name: 'Jot it down', exact: true }).click();
      await expect(page.getByTestId('available-balance')).toHaveText(balance);
    };

    // The owner writes a note; the member's next entry shows it.
    await ownerSets(fx, { usageNote: 'Any drink from the counter.' });
    await expect(page.locator('.usage-note')).toHaveCount(0);
    await jot('100', '$9.00');
    await expect(noteRegion(page).locator('.usage-text')).toHaveText('Any drink from the counter.');

    // The owner rewrites it; the next entry shows the new words, not the old.
    await ownerSets(fx, { usageNote: 'Ask at the till instead.' });
    await jot('200', '$7.00');
    await expect(noteRegion(page).locator('.usage-text')).toHaveText('Ask at the till instead.');

    // The owner clears it; the next entry takes the region away.
    await ownerSets(fx, { usageNote: '' });
    await jot('300', '$4.00');
    await expect(page.locator('.usage-note')).toHaveCount(0);

    expect(await page.evaluate(() => window.__sameDocument === true)).toBe(true);
  } finally {
    await fx.close();
  }
});
