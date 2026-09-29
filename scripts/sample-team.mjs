/* An invented team, "Corner Café (sample team)", set up through the same HTTP API the app
 * uses: the README screenshots are taken of it, and `npm run demo` shows it. A movable clock
 * spreads its history over a few weeks. Nothing here touches a real instance or real people. */

import { randomUUID } from 'node:crypto';

export const DAY = 24 * 60 * 60 * 1000;

/* A small API client with its own cookie jar, as one browser would have. */
export function jsonClient(origin, password, direct = origin) {
  const jar = new Map();
  let csrf = null;
  const send = async (method, path, body, extra = {}) => {
    const headers = { origin, ...extra };
    if (csrf) headers['x-csrf-token'] = csrf;
    if (jar.size) headers.cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(direct + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(data)}`);
    if (data?.csrfToken) csrf = data.csrfToken;
    return data;
  };
  /* The seeding clock jumps days at a time, so an owner's 12-hour session expires as it would for real: sign in
   * again. (Team members sign in once with their link and stay signed in for months.) */
  const signIn = async username => {
    const session = await send('GET', '/api/session');
    if (session.user?.username !== username) await send('POST', '/api/login', { username, password });
  };
  return { send, signIn, change: (path, body) => send('POST', path, body, { 'idempotency-key': randomUUID() }) };
}

/**
 * Sets up the sample team on a fresh Crumb whose clock reads `time.now`. It starts about six
 * weeks back and leaves `time.now` at the present. Returns the owner's client and the people,
 * by username, with their ids, roles and signed-in clients.
 */
export async function seedSampleTeam({ origin, direct = origin, setupToken, password, time }) {
  const owner = jsonClient(origin, password, direct);
  await owner.send('GET', '/api/session');
  await owner.send('POST', '/api/setup', {
    setupToken, username: 'olive', password, displayName: 'Olive Chen',
    org: { name: 'Corner Café (sample team)', mode: 'credit', currency: 'CAD', unitLabel: 'Café credit', threshold: '25.00', locale: 'en',
      welcome: 'Thank you for everything you do on the floor and behind the counter.' },
  });
  for (const [name, description, amount] of [
    ['Coffee on the house', 'Any drink from the bar.', '4.50'],
    ['Lunch from the kitchen', 'One meal, any day this week.', '14.00'],
    ['Bookstore voucher', 'A card for the shop next door.', '25.00'],
    ['Movie night for two', 'Two tickets at the Rio.', '32.00'],
  ]) await owner.change('/api/admin/rewards', { name, description, amount, mode: 'credit', active: true });

  const people = {};
  for (const [username, displayName, role] of [
    ['mina', 'Mina Park', 'member'], ['sam', 'Sam Okafor', 'member'], ['priya', 'Priya Nair', 'admin'],
    ['leo', 'Leo Martins', 'member'], ['dana', 'Dana Reyes', 'member'],
  ]) {
    const invite = await owner.send('POST', '/api/admin/invitations', { username, displayName, role });
    const joiner = jsonClient(origin, password, direct);
    await joiner.send('GET', '/api/session');
    if (invite.signinUrl) await joiner.send('POST', '/api/signin/accept', { token: new URL(invite.signinUrl).hash.slice('#signin='.length) });
    else await joiner.send('POST', '/api/invitations/accept', { token: new URL(invite.invitationUrl).hash.slice('#invite='.length), password });
    people[username] = { id: invite.user.id, role, client: joiner };
  }

  const grants = [
    ['mina', '30.00', 'Stayed late to close when the espresso machine flooded. The morning crew walked into a spotless bar.'],
    ['sam', '20.00', 'Trained two new baristas this month, patiently.'],
    ['mina', '25.00', 'Remembered every regular’s order during the Saturday rush.'],
    ['leo', '15.00', 'Rebuilt the pastry case layout — sales of the morning buns doubled.'],
    ['dana', '25.00', 'Covered three shifts while Sam was away.'],
    ['mina', '40.00', 'Handled the catering order for 80 people without a single mistake.'],
    ['priya', '20.00', 'Sorted out the supplier mix-up before anyone noticed.'],
    ['mina', '30.00', 'Kind, calm and quick with a customer who was having a very bad day.'],
    ['sam', '25.00', 'Fixed the grinder with a paperclip. Legend.'],
  ];
  for (const [username, amount, reason] of grants) {
    time.now += 4 * DAY;
    await owner.signIn('olive');
    await owner.change('/api/admin/grants', { userId: people[username].id, amount, mode: 'credit', reason });
  }

  const mina = people.mina.client;
  time.now += DAY;
  const rewards = await mina.send('GET', '/api/rewards');
  const coffee = rewards.items.find(item => item.name === 'Coffee on the house');
  const lunch = rewards.items.find(item => item.name === 'Lunch from the kitchen');
  const firstCoffee = await mina.change('/api/redemptions', { rewardId: coffee.id, expectedCostUnits: coffee.costUnits });
  await owner.signIn('olive');
  await owner.change(`/api/admin/redemptions/${firstCoffee.redemption.id}/complete`);
  time.now = Date.now() - 2 * 60 * 60 * 1000;
  await mina.change('/api/redemptions', { rewardId: lunch.id, expectedCostUnits: lunch.costUnits });
  await people.sam.client.change('/api/redemptions', { rewardId: coffee.id, expectedCostUnits: coffee.costUnits });
  time.now = Date.now();
  await owner.signIn('olive');
  return { owner, people };
}
