/* Treat rows in "Log · Recent": each says it opens, and opens in place, from its own button or a
 * tap anywhere on the row, to who sent it and the message that came with it. Only treats, only in
 * the recent view; "See all" is as it was. Every person, team and message here is invented. */
import { test, expect } from '@playwright/test';
import { keyIn, nameMenu, provision } from './fixtures.mjs';
import { settleTransitions } from './style-recorder.mjs';

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

/* The owner, Olive Chen, treats the member, in the team's mode: '12.50' in credit, '25' in points. */
const treat = (fx, amount, reason = '') => async () => {
  const answer = await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount, mode: fx.mode, reason }, key());
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
/* The words an opener shows: its text that is visible and not hidden from screen readers. */
const shownWords = opener => opener.evaluate(node => {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const words = [];
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const parent = text.parentElement;
    if (!parent.closest('[aria-hidden="true"]') && getComputedStyle(parent).visibility === 'visible') words.push(text.textContent);
  }
  return words.join('');
});
/* What the row's amount and date say, in that order: all an opener's description should be. */
const describedAs = row => row.evaluate(node => ['.rec-amt', '.rec-time'].map(part => node.querySelector(part).textContent).join(' '));

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
    // A real button, named by its visible words; the row's amount and date say which treat.
    await expect(row.getByRole('button', { name: 'Details', exact: true })).toHaveCount(1);
    const opener = openerOf(row);
    await expect(opener).toHaveAttribute('aria-expanded', 'false');
    await expect(opener).toHaveAccessibleName('Details');
    expect(await shownWords(opener)).toBe('Details');
    // Described by the row's amount and date, and nothing else: "+$12.50 Oct 23, 2026".
    const described = await describedAs(row);
    expect(described).toMatch(/^\+\$12\.50 [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    await expect(opener).toHaveAccessibleDescription(described);
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
    expect(await shownWords(opener)).toBe('Hide');
    await expect(opener).toHaveAccessibleDescription(described);
    await expect(detail).toBeVisible();
    await expect(detail.locator('.rec-from')).toHaveText('From Olive Chen');
    await expect(detail.locator('.rec-from b')).toHaveText('Olive Chen');
    await expect(detail.locator('.rec-msg')).toHaveText('Thanks for covering the Sunday close');

    await opener.click();
    await expect(opener).toHaveAttribute('aria-expanded', 'false');
    await expect(opener).toHaveAccessibleName('Details');
    expect(await shownWords(opener)).toBe('Details');
    await expect(opener).toHaveAccessibleDescription(described);
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

test('selecting words in a treat row, by a drag or a double click, neither opens nor closes it', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    await inOrder(fx, [treat(fx, '12.50', 'Thanks for covering the Sunday close')]);
    const page = fx.memberPage;
    await page.reload();
    const row = rowsOf(page).first();
    const opener = openerOf(row);
    const selected = () => page.evaluate(() => window.getSelection().toString().trim());

    // A drag from the amount into the label's word selects them, and the row stays closed.
    await row.scrollIntoViewIfNeeded();
    const amount = await row.locator('.rec-amt').boundingBox();
    const label = await row.locator('.rec-label').boundingBox();
    await page.mouse.move(amount.x + 2, amount.y + amount.height / 2);
    await page.mouse.down();
    await page.mouse.move(label.x + 20, amount.y + amount.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(await selected()).toMatch(/^\+\$12\.50\s+Tr/);
    await expect(opener).toHaveAttribute('aria-expanded', 'false');

    // A double click on the word selects it, and the row stays closed.
    await row.locator('.rec-label').dblclick({ position: { x: 4, y: 8 } });
    expect(await selected()).toBe('Treat');
    await expect(opener).toHaveAttribute('aria-expanded', 'false');

    // A tap still opens it, and a double click on the open row leaves it open.
    await row.locator('.rec-time').click();
    await expect(opener).toHaveAttribute('aria-expanded', 'true');
    await row.locator('.rec-amt').dblclick();
    expect(await selected()).not.toBe('');
    await expect(opener).toHaveAttribute('aria-expanded', 'true');
  } finally {
    await fx.close();
  }
});

/* A double click undoes only what its own first click did to its own row. The first click on an
 * open row's strip, left of its message, closes it and moves the rows below up under the pointer,
 * so the second click and the double click land on the next row, which the pair never touched. */
test('a double click that lands on another row, because the first click moved it, leaves that row alone', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    await inOrder(fx, [treat(fx, '5.00', 'For the window display'), treat(fx, '7.00', 'For staying late')]);
    const page = fx.memberPage;
    await page.reload();
    const rows = rowsOf(page);
    await expect(rows).toHaveCount(2);
    const [upper, lower] = [rows.nth(0), rows.nth(1)];
    // Both opened from their buttons, so neither row has seen a tap of its own.
    await openerOf(lower).click();
    await openerOf(upper).click();
    const upperDetail = await detailOf(page, upper);
    const lowerDetail = await detailOf(page, lower);
    await expect(upperDetail).toBeVisible();
    await expect(lowerDetail).toBeVisible();

    // Halfway down the upper row's message, in the 21 px strip to its left: the row itself.
    await upper.scrollIntoViewIfNeeded();
    const row = await upper.boundingBox();
    const message = await upperDetail.boundingBox();
    const at = { x: row.x + 6, y: message.y + message.height / 2 };
    expect(await upper.evaluate((node, { x, y }) => document.elementFromPoint(x, y) === node, at), 'the point is on the upper row itself').toBe(true);

    await page.mouse.dblclick(at.x, at.y);
    // The first click closed the upper row, and that moved the lower one under the pointer: the
    // second click and the double click were its, not the upper row's.
    await expect(openerOf(upper)).toHaveAttribute('aria-expanded', 'false');
    expect(await lower.evaluate((node, { x, y }) => node.contains(document.elementFromPoint(x, y)), at), 'the pair ended on the lower row').toBe(true);
    await expect(openerOf(lower)).toHaveAttribute('aria-expanded', 'true');
    await expect(lowerDetail).toBeVisible();
    await expect(upperDetail).toBeHidden();
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
    // What the server sent is kept and checked after the page has loaded, where a failure says so.
    let senders = null;
    await page.route('**/api/me/ledger*', async route => {
      const response = await route.fetch();
      const body = await response.json();
      const treats = body.items.filter(item => item.kind === 'grant');
      senders = treats.map(item => item.actorName);
      for (const item of treats) delete item.actorName;
      await route.fulfill({ response, json: body });
    });
    await page.reload();
    const rows = rowsOf(page);
    await expect(rows).toHaveCount(2);
    expect(senders, 'the senders the server named, before the page lost them').toEqual(['Olive Chen', 'Olive Chen']);

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

/* Each closed treat row of the log, measured with its opener and again with that opener alone
 * taken out of the page (then put back): where the opener and the label's word are, and the
 * boxes of the header and of every row and each of its own elements, on the page. Runs in the
 * page. */
function eachOpenerOut(log) {
  const box = node => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x: x + window.scrollX, y: y + window.scrollY, width, height };
  };
  const rows = [...log.querySelectorAll('li.rec')];
  const layout = () => ({
    head: box(log.querySelector('.quest-head')),
    rows: rows.map(row => ({
      row: box(row),
      parts: Object.fromEntries([...row.children].filter(node => !node.matches('.rec-detail')).map(node => [node.classList[0], box(node)])),
    })),
  });
  return rows.filter(row => row.matches('.can-open')).map(row => {
    const opener = row.querySelector('.rec-more');
    const label = row.querySelector('.rec-label');
    const word = document.createRange();
    word.selectNodeContents(label.firstChild);
    const measured = {
      at: rows.indexOf(row), amount: row.querySelector('.rec-amt').textContent, message: Boolean(row.querySelector('.rec-msg')),
      opener: box(opener), word: box(word), label: box(label), with: layout(),
    };
    opener.remove();
    measured.without = layout();
    label.append(opener);
    return measured;
  });
}

/* Whether the opener sits below its label's word rather than beside it. */
const isBelow = one => one.opener.y >= one.word.y + one.word.height - 1;

/* Checks every closed treat row of the log as it is now against the same page with that row's
 * opener taken out, and adds each to `tally`: the rows checked, and those whose opener sits below
 * the word, the first of them pictured. Returns the measurements. */
async function closedRowsHold(page, where, tally) {
  await settleTransitions(page);
  const measured = await theLog(page).evaluate(eachOpenerOut);
  for (const one of measured) {
    const what = `${where}, ${one.amount}`;
    const mine = one.with.rows[one.at];
    const bare = one.without.rows[one.at];
    const growth = mine.row.height - bare.row.height;
    tally.cases += 1;
    // The opener sits in its label and covers neither the amount nor the date.
    expect(one.opener.width, `${what}: the opener is drawn`).toBeGreaterThan(0);
    expect(one.opener.x >= one.label.x - 1 && one.opener.x + one.opener.width <= one.label.x + one.label.width + 1, `${what}: the opener is in its label`).toBe(true);
    expect(overlaps(one.opener, mine.parts['rec-amt']), `${what}: the opener overlaps the amount`).toBe(false);
    expect(overlaps(one.opener, mine.parts['rec-time']), `${what}: the opener overlaps the date`).toBe(false);
    // Across the row the diamond, the amount and the date stay put; up and down too, unless the row
    // grew, which only an opener below the word may make it do.
    for (const part of ['rec-diamond', 'rec-amt', 'rec-time']) {
      const sides = growth > 1 ? ['x', 'width'] : ['x', 'y', 'width', 'height'];
      for (const side of sides) expect(Math.abs(mine.parts[part][side] - bare.parts[part][side]), `${what}: ${part} ${side}`).toBeLessThanOrEqual(1);
    }
    if (growth > 1) expect(isBelow(one), `${what}: the row grew ${growth.toFixed(1)} px with the opener beside the word`).toBe(true);
    // Nothing above moves; everything below moves down by just what this row grew.
    close(one.with.head, one.without.head, `${what}: the log's header`);
    one.with.rows.forEach((now, at) => {
      if (at === one.at) return;
      const was = one.without.rows[at];
      const dy = at > one.at ? growth : 0;
      close(now.row, was.row, `${what}: row ${at + 1}`, dy);
      for (const name of Object.keys(was.parts)) close(now.parts[name], was.parts[name], `${what}: row ${at + 1} ${name}`, dy);
    });
    if (isBelow(one)) {
      tally.drops.push(`${what} (its row ${growth.toFixed(1)} px taller)`);
      if (tally.drops.length === 1) await test.info().attach(`the opener below the word: ${what}`, { body: await theLog(page).screenshot(), contentType: 'image/png' });
    }
  }
  return measured;
}

/* Opened, the treat row at `index` (one with a message) pushes the rows below it down by what the
 * detail takes (its height and the gap between the row's lines), and moves nothing else: not its
 * own first line, nor the button, which keeps one width whichever word it shows. */
async function openingPushesOnlyBelow(page, where, index) {
  const target = rowsOf(page).nth(index);
  await settleTransitions(page);
  const before = await theLog(page).evaluate(logLayout);
  await openerOf(target).click();
  await expect(await detailOf(page, target)).toBeVisible();
  await settleTransitions(page);
  const grown = await target.evaluate(row => row.lastElementChild.getBoundingClientRect().height + parseFloat(getComputedStyle(row).rowGap));
  const after = await theLog(page).evaluate(logLayout);
  close(after.head, before.head, `${where}: the log's header`);
  after.rows.forEach((now, at) => {
    const was = before.rows[at];
    const what = `${where}, row ${at + 1}${at === index ? ' (opened)' : ''}`;
    const dy = at > index ? grown : 0;
    close(now.row, at === index ? { ...was.row, height: was.row.height + grown } : was.row, what, dy);
    for (const name of Object.keys(was.parts)) close(now.parts[name], was.parts[name], `${what}: ${name}`, dy);
  });
}

/* Treats of everyday and large amounts, on a team counting money and on one counting points; on
 * the money team one is taken back, and its badge leaves its label the least room.
 *
 * When the opener does not fit beside the label's word, it drops below the word and only that
 * row grows: the diamond, the amount and the date keep their places across the row, the rows
 * below move down by just what that row grew, and nothing above it moves. Whether it fits comes
 * down to a few pixels and the fonts on the device: the label is never narrower than 6rem, and
 * the word and the opener together come close to that. So, besides the phones above, the
 * openers are also made wider than these fonts make them and the page narrowed until one drops,
 * which checks dropping on every machine. The rows whose opener drops are listed in the test's
 * annotations, with a picture of the first. */
test('the opener moves nothing that was already there; where it does not fit beside the word, it drops below and only its row grows', async ({ browser }) => {
  test.setTimeout(120_000);
  const teams = [
    { mode: 'credit', writes: fx => [
      treat(fx, '12.50', 'Thanks for covering the Sunday close'), treat(fx, '125.00'), treat(fx, '1250.00', 'For the catering order'),
      treat(fx, '10.00', 'For the window display'), takeBack(fx),
    ], rows: 5, treats: 4 },
    { mode: 'points', writes: fx => [treat(fx, '25', 'For the Sunday shift'), treat(fx, '250'), treat(fx, '2500', 'For the whole season')], rows: 3, treats: 3 },
  ];
  const tally = { cases: 0, drops: [] };
  for (const team of teams) {
    const fx = await provision(browser, { mode: team.mode, spending: 'self' });
    try {
      const page = fx.memberPage;
      await inOrder(fx, team.writes(fx));
      for (const language of ['en', 'zh-CN']) {
        if (language === 'zh-CN') await inChinese(page);
        for (const viewport of [{ width: 360, height: 740 }, { width: 375, height: 667 }, { width: 390, height: 844 }]) {
          const where = `${team.mode}, ${language} at ${viewport.width}`;
          await page.setViewportSize(viewport);
          await page.reload();
          await expect(rowsOf(page), where).toHaveCount(team.rows);
          await expect(theLog(page).locator('li.rec.can-open'), where).toHaveCount(team.treats);
          const measured = await closedRowsHold(page, where, tally);
          const beside = measured.find(one => one.message && !isBelow(one));
          expect(beside, `${where}: a treat with a message whose opener sits beside the word`).toBeDefined();
          await openingPushesOnlyBelow(page, where, beside.at);
        }
        if (language !== 'en') continue;
        // An opener wider than this machine's fonts make it (another font, or larger text), made
        // here with a larger font size through the openers' style objects; then the page narrowed
        // a pixel at a time from a wide phone until one no longer fits beside its word (it drops
        // below it, or else it would stick out of its label), and checked there.
        await page.reload();
        await theLog(page).evaluate(log => {
          for (const opener of log.querySelectorAll('.rec-more')) opener.style.fontSize = '1rem';
        });
        let tightAt = null;
        for (let width = 430; width >= 320 && tightAt === null; width -= 1) {
          await page.setViewportSize({ width, height: 800 });
          const tight = await theLog(page).evaluate(log => [...log.querySelectorAll('li.rec.can-open')].some(row => {
            const label = row.querySelector('.rec-label').getBoundingClientRect();
            const opener = row.querySelector('.rec-more').getBoundingClientRect();
            const word = document.createRange();
            word.selectNodeContents(row.querySelector('.rec-label').firstChild);
            return opener.top >= word.getBoundingClientRect().bottom - 1 || opener.right > label.right + 1;
          }));
          if (tight) tightAt = width;
        }
        expect(tightAt, `${team.mode}, en, wider openers: a width between 430 and 320 where one no longer fits beside its word`).not.toBeNull();
        const where = `${team.mode}, en at ${tightAt} with wider openers`;
        const tight = await closedRowsHold(page, where, tally);
        // Opened where it dropped, the opener stays below the word: "Hide" is shorter than
        // "Details", but the button keeps its width, so it does not jump up beside the word.
        const dropped = tight.find(one => one.message && isBelow(one));
        expect(dropped, `${where}: a treat with a message whose opener dropped`).toBeDefined();
        await openingPushesOnlyBelow(page, where, dropped.at);
        const stillBelow = await rowsOf(page).nth(dropped.at).evaluate(row => {
          const word = document.createRange();
          word.selectNodeContents(row.querySelector('.rec-label').firstChild);
          return row.querySelector('.rec-more').getBoundingClientRect().top >= word.getBoundingClientRect().bottom - 1;
        });
        expect(stillBelow, `${where}: opened, the opener stays below the word`).toBe(true);
      }
    } finally {
      await fx.close();
    }
  }
  test.info().annotations.push({
    type: 'openers that drop below the word',
    description: `${tally.drops.length} of ${tally.cases} closed treat rows${tally.drops.length ? `: ${tally.drops.join('; ')}` : ''}`,
  });
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
    // Described by the row's amount and date: "+$12.50 2026年10月23日".
    const described = await describedAs(row);
    expect(described).toMatch(/^\+\$12\.50 \d{4}年\d{1,2}月\d{1,2}日$/);
    await expect(opener).toHaveAccessibleDescription(described);
    await expect(opener).toHaveAccessibleName('展开');
    expect(await shownWords(opener)).toBe('展开');
    await opener.click();
    await expect(opener).toHaveAccessibleName('收起');
    expect(await shownWords(opener)).toBe('收起');
    await expect(opener).toHaveAccessibleDescription(described);
    await expect(opener).toHaveAttribute('aria-expanded', 'true');
    const detail = await detailOf(page, row);
    await expect(detail.locator('.rec-from')).toHaveText('Olive Chen 请的');
    await expect(detail.locator('.rec-from b')).toHaveText('Olive Chen');
    await expect(detail.locator('.rec-msg')).toHaveText('周日帮忙收尾，谢谢');
    await opener.click();
    await expect(opener).toHaveAccessibleName('展开');
    expect(await shownWords(opener)).toBe('展开');
    await expect(detail).toBeHidden();
  } finally {
    await fx.close();
  }
});
