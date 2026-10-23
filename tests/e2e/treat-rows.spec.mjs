/* Treat rows in "Log · Recent": each says it opens, and opens in place, from its own button or a
 * tap anywhere on the row, to who sent it and the message that came with it. Only treats, only in
 * the recent view; "See all" is as it was. Every person, team and message here is invented. */
import { test, expect } from '@playwright/test';
import { keyIn, nameMenu, provision } from './fixtures.mjs';

let requests = 0;
const key = () => ({ 'idempotency-key': `e2e-treat-rows-${String(++requests).padStart(4, '0')}` });

/* Each write a second after the one before, from a minute ago, so the rows the server sorts by
 * time come newest first in the reverse of the order written; then back to the real clock. Each
 * write is handed what the writes before it returned. */
async function inOrder(fx, writes) {
  let at = Date.now() - 60_000;
  const done = [];
  try {
    for (const write of writes) {
      fx.time.now = (at += 1000);
      done.push(await write(done));
    }
  } finally {
    fx.time.now = null;
  }
}

/* The owner, Olive Chen, treats the member. */
const treat = (fx, amount, reason = '') => async () => {
  const answer = await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount, mode: 'credit', reason }, key());
  expect(answer.status, JSON.stringify(answer.body)).toBe(201);
  return answer.body.entry;
};

/* The owner takes back the treat written just before. */
const takeBack = fx => async done => {
  const answer = await fx.api.request('POST', `/api/admin/grants/${done.at(-1).id}/revoke`, { reason: 'Meant for another teammate' }, key());
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
};

/* The member jots something down through the page's own session. */
const jotted = (page, amount) => () => page.evaluate(async ({ amount, headers }) => {
  const session = await (await fetch('/api/session', { cache: 'no-store' })).json();
  const answer = await fetch('/api/me/spend', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': session.csrfToken },
    body: JSON.stringify({ amount, mode: 'credit' }),
  });
  if (answer.status !== 201) throw new Error(`spend: ${answer.status}`);
}, { amount, headers: key() });

/* The log, in any language ("Log", "记录"). */
const theLog = page => page.locator('section.quest');
const rowsOf = page => theLog(page).locator('li.rec');
const openerOf = row => row.locator('button.rec-more');
const detailOf = async (page, row) => page.locator(`#${await openerOf(row).getAttribute('aria-controls')}`);

/* Jots an amount from the keypad, as the member would, and waits for the balance to show it. */
async function jotFromKeypad(page, digits, balance) {
  await page.getByRole('button', { name: 'I grabbed something', exact: true }).click();
  await keyIn(page, digits);
  await page.getByRole('button', { name: 'Jot it down', exact: true }).click();
  await expect(page.getByTestId('available-balance')).toHaveText(balance);
}

async function inChinese(page) {
  await nameMenu(page).click();
  await page.getByLabel('Language', { exact: true }).selectOption('zh-CN');
  await expect(page.getByRole('button', { name: /记录 · 最近/ })).toBeVisible();
  await page.keyboard.press('Escape');
}

test('a treat row says it opens, and opens in place to who sent it and the message', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    await inOrder(fx, [treat(fx, '12.50', 'Thanks for covering the Sunday close')]);
    const page = fx.memberPage;
    await page.reload();
    const row = rowsOf(page).first();
    await expect(row).toHaveClass(/\bcan-open\b/);
    // A real button, named by its visible words; the row's amount, label and date say which treat.
    await expect(row.getByRole('button', { name: 'Details', exact: true })).toHaveCount(1);
    const opener = openerOf(row);
    await expect(opener).toHaveAttribute('aria-expanded', 'false');
    // The description is the three in order. The label holds the button, so its words come with
    // the label's: "+$12.50 Treat Details Oct 23, 2026".
    const said = await row.evaluate(node => ['.rec-amt', '.rec-label', '.rec-time'].map(part => node.querySelector(part).firstChild.textContent));
    expect(said.slice(0, 2)).toEqual(['+$12.50', 'Treat']);
    const literal = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await expect(opener).toHaveAccessibleDescription(new RegExp(`^${literal(said[0])} ${literal(said[1])}\\b.*\\b${literal(said[2])}$`));
    const detail = await detailOf(page, row);
    await expect(detail).toBeHidden();
    // Where they sit: the opener last in the label, the detail last in the row.
    expect(await row.evaluate(node => [
      node.querySelector('.rec-label').lastElementChild.matches('button.rec-more'),
      node.lastElementChild.matches('div.rec-detail'),
      node.lastElementChild.id === node.querySelector('.rec-more').getAttribute('aria-controls'),
    ])).toEqual([true, true, true]);

    await opener.click();
    await expect(opener).toHaveAttribute('aria-expanded', 'true');
    await expect(opener).toHaveAccessibleName('Hide');
    await expect(detail).toBeVisible();
    await expect(detail.locator('.rec-from')).toHaveText('From Olive Chen');
    await expect(detail.locator('.rec-from b')).toHaveText('Olive Chen');
    await expect(detail.locator('.rec-msg')).toHaveText('Thanks for covering the Sunday close');

    await opener.click();
    await expect(opener).toHaveAttribute('aria-expanded', 'false');
    await expect(opener).toHaveAccessibleName('Details');
    await expect(detail).toBeHidden();
  } finally {
    await fx.close();
  }
});

test('tapping anywhere on the row opens it too, and tapping in the message does not close it', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    await inOrder(fx, [treat(fx, '12.50', 'Thanks for covering the Sunday close')]);
    const page = fx.memberPage;
    await page.reload();
    const row = rowsOf(page).first();
    const opener = openerOf(row);
    const detail = await detailOf(page, row);
    const isOpen = async open => {
      await expect(opener).toHaveAttribute('aria-expanded', String(open));
      if (open) await expect(detail).toBeVisible();
      else await expect(detail).toBeHidden();
    };

    await row.locator('.rec-amt').click();
    await isOpen(true);
    await detail.locator('.rec-msg').click();
    await isOpen(true);
    await detail.locator('.rec-from').click();
    await isOpen(true);
    await row.locator('.rec-time').click();
    await isOpen(false);
    // The label's own word, left of the button.
    await row.locator('.rec-label').click({ position: { x: 4, y: 8 } });
    await isOpen(true);
    // The button toggles once, not once for itself and again for the row.
    await opener.click();
    await isOpen(false);
  } finally {
    await fx.close();
  }
});

test('from the keyboard: Tab reaches each treat row\'s button, Enter and Space open and close it, focus stays on it', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    const page = fx.memberPage;
    await inOrder(fx, [treat(fx, '5.00', 'For the window display'), jotted(page, '1.25'), treat(fx, '7.00', 'For staying late')]);
    await page.reload();
    const rows = rowsOf(page);
    await expect(rows).toHaveCount(3);
    const newest = openerOf(rows.nth(0));
    const oldest = openerOf(rows.nth(2));
    await expect(openerOf(rows.nth(1))).toHaveCount(0);

    // From the log's header, the next stops are the two treats' buttons; the jotted row has none.
    await theLog(page).locator('.quest-head').focus();
    await page.keyboard.press('Tab');
    await expect(newest).toBeFocused();
    expect(await newest.evaluate(node => node.matches(':focus-visible'))).toBe(true);
    await page.keyboard.press('Tab');
    await expect(oldest).toBeFocused();

    for (const [press, open] of [['Enter', true], ['Space', false], ['Space', true], ['Enter', false]]) {
      await page.keyboard.press(press);
      await expect(oldest, press).toHaveAttribute('aria-expanded', String(open));
      await expect(oldest).toHaveAccessibleName(open ? 'Hide' : 'Details');
      await expect(oldest).toBeFocused();
    }
    await page.keyboard.press('Shift+Tab');
    await expect(newest).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(newest).toHaveAttribute('aria-expanded', 'true');
    await expect(newest).toBeFocused();
    await expect(await detailOf(page, rows.nth(0))).toContainText('For staying late');
  } finally {
    await fx.close();
  }
});

test('a treat without a message opens to who sent it, and nothing else', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    await inOrder(fx, [treat(fx, '12.50')]);
    const page = fx.memberPage;
    await page.reload();
    const row = rowsOf(page).first();
    await openerOf(row).click();
    const detail = await detailOf(page, row);
    await expect(detail).toBeVisible();
    await expect(detail).toHaveText('From Olive Chen');
    await expect(detail.locator('.rec-msg')).toHaveCount(0);
  } finally {
    await fx.close();
  }
});

test('a treat whose sender has no name still opens to its message', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    await inOrder(fx, [treat(fx, '3.00'), treat(fx, '12.50', 'Thanks for covering the Sunday close')]);
    const page = fx.memberPage;
    // As a database restored or edited by hand might give them: the treats come without a sender.
    await page.route('**/api/me/ledger*', async route => {
      const response = await route.fetch();
      const body = await response.json();
      const treats = body.items.filter(item => item.kind === 'grant');
      expect(treats.map(item => item.actorName)).toEqual(['Olive Chen', 'Olive Chen']);
      for (const item of treats) delete item.actorName;
      await route.fulfill({ response, json: body });
    });
    await page.reload();
    const rows = rowsOf(page);
    await expect(rows).toHaveCount(2);

    // The newest, with a message: it opens, to the message alone.
    const withMessage = rows.nth(0);
    await expect(withMessage).toHaveClass(/\bcan-open\b/);
    await openerOf(withMessage).click();
    const detail = await detailOf(page, withMessage);
    await expect(detail).toBeVisible();
    await expect(detail.locator('.rec-msg')).toHaveText('Thanks for covering the Sunday close');
    await expect(detail.locator('.rec-from')).toHaveCount(0);
    await expect(detail).not.toContainText('From');

    // Neither a name nor a message: nothing to open, and the row is as it was.
    const bare = rows.nth(1);
    await expect(bare.locator('.rec-label')).toHaveText('Treat');
    await expect(openerOf(bare)).toHaveCount(0);
    await expect(bare.locator('.rec-detail')).toHaveCount(0);
    await expect(bare).not.toHaveClass(/\bcan-open\b/);
  } finally {
    await fx.close();
  }
});

/* Where every element of the log is on the page (not on the screen, so a scroll moves nothing):
 * the header, then for each row the row and each of its elements outside the detail, by class.
 * Runs in the page. */
function logLayout(log) {
  const box = node => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x: x + window.scrollX, y: y + window.scrollY, width, height };
  };
  const named = node => `${node.localName}.${[...node.classList].join('.')}`;
  return {
    head: box(log.querySelector('.quest-head')),
    rows: [...log.querySelectorAll('li.rec')].map(row => ({
      row: box(row),
      parts: Object.fromEntries([...row.querySelectorAll('*')].filter(node => !node.closest('.rec-detail')).map(node => [named(node), box(node)])),
    })),
  };
}

const close = (now, before, what, dy = 0) => {
  for (const side of ['x', 'y', 'width', 'height']) {
    const shift = side === 'y' ? dy : 0;
    expect(Math.abs(now[side] - before[side] - shift), `${what} ${side}`).toBeLessThanOrEqual(1);
  }
};
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/* Treats of everyday amounts: one with a message, one without, and one taken back, whose badge
 * leaves its label the least room. A label narrower than its word and the button together (a
 * wide amount beside a long date on a narrow phone) puts the button on a line of its own under
 * the word, and that row grows. */
test('the opener moves nothing that was already there', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    const page = fx.memberPage;
    await inOrder(fx, [
      treat(fx, '12.50', 'Thanks for covering the Sunday close'),
      treat(fx, '25.00'),
      treat(fx, '10.00', 'For the window display'),
      takeBack(fx),
      jotted(page, '4.25'),
    ]);
    for (const language of ['en', 'zh-CN']) {
      if (language === 'zh-CN') await inChinese(page);
      for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
        const where = `${language} at ${viewport.width}`;
        await page.setViewportSize(viewport);
        await page.reload();
        const rows = rowsOf(page);
        await expect(rows).toHaveCount(5);
        const openable = theLog(page).locator('li.rec.can-open');
        await expect(openable, where).toHaveCount(3);

        // Every closed treat row, with its opener and with the opener taken out of the page.
        const { withOpener, without } = await theLog(page).evaluate(log => {
          const box = node => {
            const { x, y, width, height } = node.getBoundingClientRect();
            return { x, y, width, height };
          };
          const rowsHere = [...log.querySelectorAll('li.rec.can-open')];
          const parts = row => ({
            diamond: box(row.querySelector('.rec-diamond')), amount: box(row.querySelector('.rec-amt')),
            date: box(row.querySelector('.rec-time')), row: box(row),
          });
          const openers = rowsHere.map(row => row.querySelector('.rec-more'));
          const measured = rowsHere.map(row => ({ ...parts(row), opener: box(row.querySelector('.rec-more')) }));
          for (const opener of openers) opener.remove();
          const bare = rowsHere.map(parts);
          openers.forEach((opener, index) => rowsHere[index].querySelector('.rec-label').append(opener));
          return { withOpener: measured, without: bare };
        });
        withOpener.forEach((now, index) => {
          const what = `${where}, treat row ${index + 1}`;
          for (const part of ['diamond', 'amount', 'date']) close(now[part], without[index][part], `${what}: ${part}`);
          expect(Math.abs(now.row.height - without[index].row.height), `${what}: the row's height`).toBeLessThanOrEqual(1);
          expect(now.opener.width, `${what}: the opener is drawn`).toBeGreaterThan(0);
          expect(overlaps(now.opener, now.date), `${what}: the opener overlaps the date`).toBe(false);
          expect(overlaps(now.opener, now.amount), `${what}: the opener overlaps the amount`).toBe(false);
        });

        // Opened, the treat with a message and a badge pushes the rows below it down by what the
        // detail takes (its height and the gap between the row's lines), and moves nothing else.
        const index = 2;
        const target = rows.nth(index);
        await expect(target).toHaveClass(/\blog-grant\b/);
        await expect(target.locator('.badge')).toHaveCount(1);
        const before = await theLog(page).evaluate(logLayout);
        await openerOf(target).click();
        const detail = await detailOf(page, target);
        await expect(detail).toBeVisible();
        const grown = await target.evaluate(row => row.lastElementChild.getBoundingClientRect().height + parseFloat(getComputedStyle(row).rowGap));
        const after = await theLog(page).evaluate(logLayout);
        close(after.head, before.head, `${where}: the log's header`);
        after.rows.forEach((now, at) => {
          const was = before.rows[at];
          const what = `${where}, row ${at + 1}`;
          if (at === index) {
            // All but the button and what is in it, whose words change from "Details" to "Hide".
            for (const name of Object.keys(was.parts).filter(part => !/rec-more|chev|^span\.$/.test(part))) close(now.parts[name], was.parts[name], `${what}: ${name}`);
            close(now.row, { ...was.row, height: was.row.height + grown }, `${what}: the opened row`);
            return;
          }
          const dy = at > index ? grown : 0;
          close(now.row, was.row, `${what}`, dy);
          for (const name of Object.keys(was.parts)) close(now.parts[name], was.parts[name], `${what}: ${name}`, dy);
        });
      }
    }
  } finally {
    await fx.close();
  }
});

test('jotted-down entries, and every row under See all, have no button', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    const page = fx.memberPage;
    await inOrder(fx, [
      treat(fx, '7.00', 'For staying late'),
      treat(fx, '10.00', 'For the window display'),
      takeBack(fx),
      jotted(page, '4.25'),
    ]);
    await page.reload();
    const log = theLog(page);
    await expect(rowsOf(page)).toHaveCount(4);
    await expect(log.locator('li.log-spend button.rec-more, li.log-revoke button.rec-more')).toHaveCount(0);
    await expect(log.locator('li.log-spend, li.log-revoke')).toHaveCount(2);
    await expect(log.locator('li.log-spend.can-open, li.log-revoke.can-open')).toHaveCount(0);
    // Both treats open, the one taken back too.
    await expect(log.locator('li.log-grant.can-open button.rec-more')).toHaveCount(2);

    await log.getByRole('button', { name: /Log · Recent/ }).click();
    await expect(log.locator('.quest-month')).toHaveCount(1);
    await expect(log.locator('button.rec-more, .rec-detail, .can-open')).toHaveCount(0);
    const treats = log.locator('li.log-grant');
    await expect(treats).toHaveCount(2);
    await expect(treats.locator('.rec-label')).toHaveText(['Treat from Olive Chen', 'Treat from Olive Chen']);
    await expect(treats.locator('.rec-note')).toHaveText(['For the window display', 'For staying late']);

    // Folded back, the recent view has its buttons again.
    await log.getByRole('button', { name: /Fold up/ }).click();
    await expect(log.locator('button.rec-more')).toHaveCount(2);
  } finally {
    await fx.close();
  }
});

test('several rows open at once; they stay open after an entry and close on reload', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    await inOrder(fx, [
      treat(fx, '5.00', 'For the window display'),
      treat(fx, '5.00', 'For staying late'),
      treat(fx, '5.00', 'For the new menu boards'),
    ]);
    const page = fx.memberPage;
    await page.reload();
    await expect(page.getByTestId('available-balance')).toHaveText('$15.00');
    const rows = rowsOf(page);
    const states = async expected => {
      for (const [message, open] of Object.entries(expected)) {
        const row = rows.filter({ has: page.locator('.rec-msg', { hasText: message }) });
        await expect(openerOf(row), message).toHaveAttribute('aria-expanded', String(open));
        if (open) await expect(row.locator('.rec-msg'), message).toBeVisible();
        else await expect(row.locator('.rec-msg'), message).toBeHidden();
      }
    };
    await openerOf(rows.nth(0)).click();
    await openerOf(rows.nth(2)).click();
    await states({ 'For the new menu boards': true, 'For staying late': false, 'For the window display': true });
    await page.evaluate(() => { window.__sameDocument = true; });
    const oldRow = await rows.nth(0).elementHandle();

    // An entry reads the log again and puts a new one in its place: the same rows stay open.
    await jotFromKeypad(page, '100', '$14.00');
    await expect.poll(() => oldRow.evaluate(node => node.isConnected)).toBe(false);
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toHaveClass(/\blog-spend\b/);
    await states({ 'For the new menu boards': true, 'For staying late': false, 'For the window display': true });

    // Closed in the new log, it stays closed through the next entry.
    await openerOf(rows.filter({ has: page.locator('.rec-msg', { hasText: 'For the new menu boards' }) })).click();
    await jotFromKeypad(page, '200', '$12.00');
    await expect(rows).toHaveCount(5);
    await states({ 'For the new menu boards': false, 'For staying late': false, 'For the window display': true });
    expect(await page.evaluate(() => window.__sameDocument === true)).toBe(true);

    // A fresh page starts with every row closed.
    await page.reload();
    await expect(rows).toHaveCount(5);
    await states({ 'For the new menu boards': false, 'For staying late': false, 'For the window display': false });
  } finally {
    await fx.close();
  }
});

test('a 500-character message and a long unbroken link wrap inside the row at 375 pixels', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    const long = `${`<b>hi</b> ${'Stayed late to help close up. '.repeat(20)}`.slice(0, 499)}!`;
    const link = `Menu: https://example.com/${'a'.repeat(100)}`;
    const unbroken = 'W'.repeat(500);
    expect([...long]).toHaveLength(500);
    expect(link.split(' ')[1]).toHaveLength(120);
    const messages = [long, link, unbroken];
    await inOrder(fx, messages.map(message => treat(fx, '1.00', message)));
    const page = fx.memberPage;
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    const rows = rowsOf(page);
    await expect(rows).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) await openerOf(rows.nth(index)).click();
    for (const message of messages) {
      const shown = page.locator('.rec-msg').filter({ hasText: message.slice(0, 30) });
      await expect(shown).toBeVisible();
      const fit = await shown.evaluate(node => {
        const row = node.closest('li.rec');
        const own = node.getBoundingClientRect();
        const edge = row.getBoundingClientRect();
        return {
          text: node.innerText, children: node.children.length,
          message: [node.scrollWidth, node.clientWidth], row: [row.scrollWidth, row.clientWidth],
          inside: own.left >= edge.left - 1 && own.right <= edge.right + 1,
        };
      });
      const what = `“${message.slice(0, 20)}…”`;
      // Shown as typed: the markup and the link are text.
      expect(fit.text, what).toBe(message);
      expect(fit.children, what).toBe(0);
      expect(fit.message[0], `${what}: the message`).toBeLessThanOrEqual(fit.message[1]);
      expect(fit.row[0], `${what}: the row`).toBeLessThanOrEqual(fit.row[1]);
      expect(fit.inside, `${what}: inside its row`).toBe(true);
    }
    const [scrolled, shownWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(scrolled, 'the page scrolls sideways').toBeLessThanOrEqual(shownWidth);
  } finally {
    await fx.close();
  }
});

test('in Chinese the opener reads 展开 and 收起 and the detail reads “… 请的”', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    await inOrder(fx, [treat(fx, '12.50', '周日帮忙收尾，谢谢')]);
    const page = fx.memberPage;
    await inChinese(page);
    await page.reload();
    const row = rowsOf(page).first();
    await expect(row.getByRole('button', { name: '展开', exact: true })).toHaveCount(1);
    const opener = openerOf(row);
    await opener.click();
    await expect(opener).toHaveAccessibleName('收起');
    await expect(opener).toHaveAttribute('aria-expanded', 'true');
    const detail = await detailOf(page, row);
    await expect(detail.locator('.rec-from')).toHaveText('Olive Chen 请的');
    await expect(detail.locator('.rec-from b')).toHaveText('Olive Chen');
    await expect(detail.locator('.rec-msg')).toHaveText('周日帮忙收尾，谢谢');
    await opener.click();
    await expect(opener).toHaveAccessibleName('展开');
    await expect(detail).toBeHidden();
  } finally {
    await fx.close();
  }
});
