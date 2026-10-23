/* The usage note: a few lines the owner writes on Settings about what the balance can be used
 * for. The field counts characters the way the server and the database do (Unicode code
 * points of the trimmed text), so it has no maxlength, and the check happens on Save. Every
 * person, team and note here is invented. */
import { test, expect } from '@playwright/test';
import { provision } from './fixtures.mjs';

const TOO_LONG = 'Keep it to 200 characters or fewer.';

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

    // Mended, the error goes and the note saves again.
    await note.fill('字'.repeat(201));
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(note).toHaveAttribute('aria-invalid', 'true');
    await note.fill('Any drink from the counter.');
    await save(page);
    await expect(note).not.toHaveAttribute('aria-invalid', 'true');
    await page.reload();
    await expect(page.getByLabel('How to use the balance', { exact: true })).toHaveValue('Any drink from the counter.');
    // Counted at the end, so a request the refused saves wrongly sent would show up here.
    expect(sent).toHaveLength(fits.length + 1);
  } finally {
    await fx.close();
  }
});
