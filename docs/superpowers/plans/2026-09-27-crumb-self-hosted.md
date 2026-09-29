# Crumb Self-Hosted Implementation Plan

*Translated from the Chinese original, [2026-09-27-crumb-self-hosted.zh-CN.md](2026-09-27-crumb-self-hosted.zh-CN.md).*

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Crumb as an independently deployable team recognition and rewards tool, and help new organizations adopt it through the README, the demo and feedback entry points.

**Architecture:** The existing root-directory pages remain the GitHub Pages static demo. The real application uses a standalone Node.js server, a SQLite-persisted ledger and a same-origin browser client; one instance serves one organization. Authentication, granting rewards and redemptions are controlled by the server, and the pixel assets are shared between the demo and the real application.

**Tech Stack:** Node.js 24 (minimum 24.14.0, container target 24.21.0), Express 5.2.1, better-sqlite3 13.0.3, Helmet 8.3.0, Sharp 0.35.5; plain HTML/CSS/ES modules; node:test and Playwright 1.63.0; Docker Compose and Caddy 2. Dependencies are pinned to exact versions and a package-lock.json is generated; Caddy is pinned after its image digest is resolved in Task 9.

**Spec:** [Confirmed design](../specs/2026-09-27-crumb-self-hosted-design.md). The implementer must read the design and this plan first.

**Status:** Implemented on branch `feature/self-hosted`; draft PR #1 is open, not yet merged, and awaiting human review. The implementation machine has no Docker; the image and container drill passed in CI (`67a174b`), so 9.3 and 9.6 are checked. 9.4 is unchecked: the drill did setup through the API rather than a browser, compared only balances and collections, and did not verify HTTPS on a real domain. 11.1 is unchecked: Docker ran only points mode, not credit mode. The "attach_artifact" in 11.4 has no corresponding tool in this environment, so the screenshots were put in the PR description. For what was actually run, the results, and what remains unverified, see [VALIDATION.md](../../VALIDATION.md) and [RELEASE-CHECKLIST.md](../../RELEASE-CHECKLIST.md).

## Global Constraints

The following project-level requirements are carried over directly from the design:

- Crumb is for organizations and teams that want to turn thanks and rewards into a lasting experience, with no restriction on company size or industry.
- Core flow: an admin gives recognition → a team member receives a reward → redeems it for a real benefit → keeps a permanent collection.
- Confirmed: each organization chooses credit or points at first-time setup; the first version uses only one unit.
- Keeps the MIT open-source license, allowing download, modification and self-deployment.
- One deployed instance serves one organization, and the organization owns its own data.
- All permission and amount checks are performed by the server; hiding a button is not access control.
- Retried requests are not posted twice, and multi-step writes are completed within a database transaction.
- Once an organization has ledger entries, its mode, currency or unlock threshold cannot be switched through settings.
- Normal spending does not remove anything from the collection.
- Real ledger records do not depend on client-side storage.
- The first version runs as a single instance, with no promise of horizontal scaling.
- All promotional screenshots come from the actual implementation; the roadmap is kept separate from delivered capabilities, and no fictional user counts or impact metrics are added.
- No silent telemetry; member data, logs and usage statistics are never uploaded automatically.

## Review Focus

The five kinds of situation most likely to harm real use, which must be verified in the corresponding tasks:

1. Retries after a network drop, repeated clicks, the same key with a different request body: no duplicate grant or debit; Task 4, 5.
2. Two devices spending the same balance at the same time, an account deactivated during a redemption: no overdraft, no orphaned reservations; Task 3, 5.
3. An admin trying to reset the owner's password, a member guessing another person's resource ID: reject the privilege escalation rather than only hiding the UI; Task 2, 3, 6.
4. Fractional points, amount overflow, CSV formulas, disguised logos, malicious thank-you content: reject explicitly or display safely; Task 1, 7, 8.
5. Backing up while the WAL is active, old sessions/tokens still usable after a restore, incompatible versions: consistent backups, invalidated credentials, incompatible restores rejected; Task 9.

## Execution approach and scope

Recommended: the main agent implements the tasks sequentially in this conversation, with an independent review at the end; these tasks share the account, ledger and transaction interfaces, and sequential execution reduces interface drift.
If the maintainer chooses the subagent approach, tasks are still implemented and reviewed one at a time in dependency order, and the same module is never modified in parallel.
Dependencies are installed, the implementation branch is created and the product is modified only after the plan is confirmed. Workspace isolation follows the using-git-worktrees skill and native tools.

This is one end-to-end product delivery with explicit dependencies between tasks; it is not split into independent sub-projects.
Order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11.
Each task follows red test → minimal implementation → green test → focused commit; an unfinished product is never pushed to main partway through.

## File map

| Path | Responsibility |
| --- | --- |
| `package.json`, `package-lock.json`, `.node-version` | Exact dependencies, Node version and commands |
| `server/main.mjs`, `server/app.mjs`, `server/config.mjs` | Startup, HTTP composition, configuration validation |
| `server/db.mjs`, `server/migrations/001-initial.sql` | Database connection, atomic migrations, tables and constraints |
| `server/errors.mjs`, `server/units.mjs` | Error protocol, integer reward units |
| `server/auth.mjs`, `server/passwords.mjs`, `server/permissions.mjs` | Sessions, passwords, authorization matrix |
| `server/members.mjs`, `server/org.mjs` | Invite/reset/deactivate, settings and logo |
| `server/ledger.mjs`, `server/idempotency.mjs`, `server/collections.mjs` | Grants, corrections, idempotency and collections |
| `server/rewards.mjs`, `server/redemptions.mjs` | Benefit catalog, reservations and the redemption state machine |
| `server/routes/auth.mjs`, `members.mjs`, `rewards.mjs`, `org.mjs` | HTTP request validation and service calls |
| `server/csv.mjs`, `server/routes/read-models.mjs` | Export and paginated views |
| `app/index.html`, `app/app.css`, `app/main.js`, `app/api.js`, `app/dom.js` | Standalone product UI and API client |
| `app/views/auth.js`, `member.js`, `admin.js`, `settings.js` | The four kinds of pages and their interactions |
| `app/i18n.js`, `app/locales/en.js`, `app/locales/zh-CN.js` | Complete Chinese and English UI |
| `themes/default.json`, `scripts/theme-manifest.mjs` | Stable pixel collection list |
| `tests/helpers.mjs`, `tests/*.test.mjs`, `tests/e2e/*.spec.mjs` | API, domain, concurrency, restore and browser verification |
| `scripts/init-secrets.mjs`, `backup.mjs`, `restore.mjs`, `recover-owner.mjs` | Deployment credentials and operations |
| `Dockerfile`, `.dockerignore`, `compose.yaml`, `compose.https.yaml`, `Caddyfile` | Container and HTTPS deployment |
| `.github/workflows/ci.yml`, `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md` | CI, deployment, restore and upgrade documentation |
| `README.md`, `README.zh-CN.md`, `docs/THEMES.md`, `CONTRIBUTING.md` | Project landing page, themes and contribution guide |
| `index.html`, `assets/app.js`, `assets/style.css`, `scripts/make-og.mjs` | Public demo positioning and entry-point updates |
| `.github/ISSUE_TEMPLATE/*`, `assets/screenshots/*` | Project feedback and real screenshots |

## Global interface conventions

### Data and transactions

The database object `db` is a better-sqlite3 Database. `openDatabase(path)` creates a connection and runs the numbered migrations;
every connection enables `foreign_keys=ON`, `journal_mode=WAL` and `busy_timeout=5000`.
All write transactions use `db.transaction(fn).immediate()`, and the transaction body contains no `await`.
Password hashing, image decoding, and remote or file I/O are completed first; only then does a short transaction begin and re-check the preconditions.

IDs are server-generated UUIDs, and times are server ISO UTC. The amount unit `units` is a safe integer.
The limit for a single transaction and for each person's balance after a transaction is `1_000_000_000_000`; cumulative effective grants may not exceed this limit either.
Credit accepts decimal strings such as `"12.50"`, and points accept integer strings such as `"100"`; the API does not accept floating-point JSON amounts.

`Actor = { id: string, role: 'owner'|'admin'|'member' }` is taken from the verified session and cannot come from the request body.
`Org = { name, mode: 'credit'|'points', currency: 'CAD'|'USD'|'CNY'|null, unitLabel, thresholdUnits, locale: 'en'|'zh-CN', welcome, adminContact, feedbackUrl }`.
`Balance = { postedUnits, reservedUnits, availableUnits, lifetimeUnits }`; all four fields are integers.

The database must contain the following tables; amount constraints, foreign keys, uniqueness and the triggers for append-only tables go into the migration:

| Table | Required fields/constraints |
| --- | --- |
| `schema_migrations` | `version PRIMARY KEY, applied_at` |
| `organization` | Fixed id=1, Org fields, `logo_png BLOB, created_at` |
| `users` | `id, username UNIQUE, display_name, password_hash, role, active, created_at` |
| `sessions` | `token_hash PRIMARY KEY, user_id nullable, csrf_hash, expires_at` |
| `tokens` | `token_hash PRIMARY KEY, purpose invite/reset, user_id, expires_at, used_at` |
| `login_limits` | `bucket PRIMARY KEY, attempts, window_start`; two kinds of limit, per account and per IP |
| `ledger` | `id, user_id, delta_units, kind grant/revoke/redeem/refund, actor_id, reason, source_id, created_at`; `(kind,source_id)` unique for corrections |
| `rewards` | `id, name, description, cost_units, active, created_at` |
| `redemptions` | `id, user_id, reward_id, reward_name, cost_units, status, created_at, resolved_at`; statuses pending/completed/cancelled/rejected |
| `collection_unlocks` | `user_id, ordinal, sprite_key, unlocked_at, grant_id`; `(user_id,ordinal)` primary key |
| `idempotency` | `(actor_id,route,key)` primary key, `request_hash,response_json,status_code,created_at` |
| `audit` | `id, actor_id, action, target_id, detail_json, created_at`; passwords, tokens and cookies are not recorded |

`ledger`, `audit` and `collection_unlocks` forbid UPDATE/DELETE; a refund does not change the original entry.
audit.actor_id may be NULL, but only for system operations such as local recovery; HTTP requests must record the real actor.
`users.active=0` means either that the invitation has not yet been accepted or that the user has been deactivated; historical users are never hard-deleted.
Idempotency keys are 16–128 printable ASCII characters; the browser defaults to `crypto.randomUUID()`.
The idempotency scope is actor + explicit business route + key; the request body is normalized and then hashed with SHA-256.
Authentication and authorization come before replay; the same key with the same request returns the original response, and with a different request returns 409 `IDEMPOTENCY_CONFLICT`.

### HTTP and errors

`createApp({db, config, clock = () => Date.now()})` returns an Express app and does not call listen itself.
`main.mjs` handles startup and shutdown. `AppError(status, code, message)` is always returned as
`{error:{code,message}}`; unknown errors return a generic 500 message, and logs must not contain request bodies or secrets.
The server validates all fields, enums, lengths and unknown keys; JSON request bodies are limited to 32 KiB, and logo requests have a separate limit.

| Method and path | Permission/input/output |
| --- | --- |
| `GET /healthz` | `{ok:true}` if the database is available; returns no organization or environment secrets |
| `GET /api/session` | Creates a short-lived anonymous session or reads the login state; returns `{user,csrfToken,initialized,org}`; for anonymous sessions, org contains only the name, the language and whether a logo exists |
| `POST /api/setup` | Anonymous CSRF + setup credential; `{setupToken,username,password,displayName,org}`; 201 `{user,csrfToken}` |
| `POST /api/login`, `/api/logout` | CSRF; login takes `{username,password}` and returns a new session and csrfToken; logout returns 204 |
| `POST /api/invitations/accept`, `/api/password/reset` | Anonymous CSRF; `{token,password}`; redeemable once, and a normal login is required afterwards |
| `GET /api/me` | The caller's own `{user,org,balance,collection}`; contains no one else's data |
| `GET /api/me/ledger`, `/api/me/redemptions` | The caller's own paginated history |
| `GET /api/rewards` | Reads the open benefits after login |
| `POST /api/redemptions` | Self + idempotency header; `{rewardId}`; 201 `{redemption,balance}` |
| `POST /api/redemptions/:id/cancel` | The requester's own pending request, or an admin; idempotency header; 200 `{redemption,balance}` |
| `GET /api/admin/members`, `/api/admin/redemptions` | owner/admin; paginated admin data |
| `POST /api/admin/invitations` | owner/admin; `{username,displayName,role}`; returns a one-time invitationUrl |
| `POST /api/admin/members/:id/reset` | owner: anyone; admin: regular members only; returns a one-time resetUrl |
| `PATCH /api/admin/members/:id` | Changes active; role changes are owner-only; returns the updated member |
| `POST /api/admin/grants` | owner/admin; `{userId,amount,reason}` + idempotency header; 201 `{entry,balance,collection}` |
| `POST /api/admin/grants/:id/revoke` | owner/admin; `{reason}` + idempotency header; 200 `{entry,balance}` |
| `POST /api/admin/rewards`, `PATCH /api/admin/rewards/:id` | owner/admin; `{name,description,amount,active}`; returns the benefit |
| `POST /api/admin/redemptions/:id/complete`, `/reject`, `/refund` | owner/admin + idempotency header; reject/refund take a reason; returns the redemption and the balance |
| `GET /api/admin/ledger.csv` | owner/admin; safe CSV, as a download response |
| `GET /api/admin/audit` | owner/admin; paginated operation history |
| `PATCH /api/org` | owner; rule fields are locked once entries have been posted; returns Org |
| `PUT /api/org/logo`, `DELETE /api/org/logo` | owner; PNG/JPEG/WebP binary upload, or deletion; 204 |
| `GET /api/org/logo` | Returns the re-encoded PNG, or 404 if there is none |

Pagination uses `?limit=25&cursor=<base64url>`, maximum 100; the cursor corresponds to a server-validated `(created_at,id)`,
the response is `{items,nextCursor}` with a stable order, and user-controllable strings are never concatenated into SQL.
For amount endpoints, the input amount is mapped to the domain interface's units before the call; strings are not parsed inside ledger functions.

### Authentication implementation parameters

Usernames are normalized to lowercase and restricted to `[a-z0-9._-]{3,64}`; display names are 1–80 characters; passwords are 12–128 Unicode characters.
Passwords use async scrypt with N=131072, r=8, p=1, maxmem=256 MiB, a 16-byte random salt and a 64-byte key;
the encoding includes the parameters and the salt, comparison uses timingSafeEqual, the process runs at most two hashing jobs at once, and the queue is capped at 16.
Unusable accounts also go through a fixed dummy-hash verification, and all login failures use the same message.
At most 5 failures per account per 15 minutes and at most 30 failures per IP per 15 minutes; the response is 429 with Retry-After,
counting uses the server's trusted socket address, and the client's X-Forwarded-For is not trusted by default.

Session tokens and one-time tokens are 32-byte random values, and only their SHA-256 is stored; sessions last at most 12 hours, anonymous sessions 30 minutes,
invitations 7 days, resets 30 minutes. The session and CSRF are rotated after login. All mutating requests verify the CSRF and the exact configured Origin.
The raw CSRF value is derived from `HMAC-SHA256(rawSessionToken,'crumb-csrf-v1')` and its hash is stored; GET session can rebuild the same CSRF from the HttpOnly cookie
without rotating on every read, so multiple tabs do not invalidate each other. Invitation and reset operations done while not logged in also require an anonymous CSRF.
Cookies are HttpOnly, SameSite=Lax, Path=/, and Secure in HTTPS production mode; responses use Cache-Control: no-store.
Invitation/reset tokens go in the URL fragment and are removed after the page reads them; Referrer-Policy: no-referrer.
Security response headers are provided by Helmet; the self-hosted product's CSP allows only same-origin scripts/styles and local images, and disables inline scripts.

## Task 1: Database, integer units and test foundation

**Files:** Create `package.json`, `package-lock.json`, `.node-version`, `server/db.mjs`, `server/migrations/001-initial.sql`, `server/units.mjs`, `server/errors.mjs`, `tests/helpers.mjs`, `tests/units.test.mjs`, `tests/db.test.mjs`; modify `.gitignore`.

**Interfaces:** `openDatabase(path)`; `parseUnits(amount,mode):number`; `formatUnits(units,org,locale):string`; `AppError(status,code,message)`.
The test helper `fixture(t,{mode='credit',thresholdUnits=5000}={})` creates a temporary on-disk database and fixed owner/member/member2,
and returns `{db,owner,member,member2,path}`; `t.after` closes the connection and cleans up only its own temporary directory.
The fixture's insertion of test users is not for production use. The HTTP helper `serve(t,app)` returns a localhost URL on a random port.

- [x] **1.1 Install exact dependencies and set up commands.** Node engine constraint `>=24.14.0 <25`, ESM, a private npm package while the repository stays MIT; no npm package is published.

```json
{"name":"crumb","version":"0.1.0","private":true,"type":"module","license":"MIT","engines":{"node":">=24.14.0 <25"},"scripts":{"start":"node server/main.mjs","test":"node --test tests/*.test.mjs","test:e2e":"playwright test","backup":"node scripts/backup.mjs","restore":"node scripts/restore.mjs"},"dependencies":{"express":"5.2.1","better-sqlite3":"13.0.3","helmet":"8.3.0","sharp":"0.35.5"},"devDependencies":{"@playwright/test":"1.63.0"}}
```

Run `npm install` to generate the lockfile; ignore `node_modules/`, `.env`, `.secrets/`, `data/`, `backups/`, `playwright-report/`, `test-results/`.
The public assets for Docker and GitHub Pages still do not depend on an npm install.

- [x] **1.2 Write the red tests.** At the top of the file, import node:test, strict assert and the interfaces under test below; running `node --test tests/units.test.mjs tests/db.test.mjs` at this point should fail because the interfaces are not yet implemented.

```js
test('exact units and invalid representations', () => {
  assert.equal(parseUnits('12.50', 'credit'), 1250);
  assert.equal(parseUnits('100', 'points'), 100);
  for (const value of ['1.1', '0', '-1', '1e2', 'Infinity', '1000000000001'])
    assert.throws(() => parseUnits(value, 'points'));
  assert.throws(() => parseUnits('1.001', 'credit'));
  assert.throws(() => parseUnits(0.1, 'credit'));
});
```

The database tests check, one by one, that foreign keys are enabled, that re-running migrations does not create tables twice, that ledger UPDATE/DELETE is rejected by triggers,
that users are still there after closing and reopening, and that an unsupported newer schema version is treated as a startup failure.

- [x] **1.3 Implement exact parsing and migrations.** The core algorithm is below, and all errors are 422; formatUnits uses integer splitting and Intl.NumberFormat for currency/label display, and is not used for calculation.

```js
export function parseUnits(value, mode) {
  if (!['credit','points'].includes(mode))
    throw new AppError(422, 'INVALID_MODE', 'Select credit or points.');
  const pattern = mode === 'credit' ? /^\d+(?:\.\d{1,2})?$/ : /^\d+$/;
  if (typeof value !== 'string' || value.length > 32 || !pattern.test(value))
    throw new AppError(422, 'INVALID_AMOUNT', 'Enter a valid positive amount.');
  const [whole, fraction = ''] = value.split('.');
  const units = mode === 'credit'
    ? BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) : BigInt(whole);
  if (units < 1n || units > 1_000_000_000_000n)
    throw new AppError(422, 'INVALID_AMOUNT', 'Amount is outside the supported range.');
  return Number(units);
}
```

Write the complete SQL following the table contract above; ledger has a signed integer check, with grant/refund positive and revoke/redeem negative.
The migration version check and the migration transaction must complete before HTTP is opened.

- [x] **1.4 Go green and commit.** Run both test files and confirm they all pass; commit `feat: add persistent schema and exact reward units`.

## Task 2: Setup, sessions, passwords and authorization foundations

**Files:** Create `server/config.mjs`, `server/app.mjs`, `server/main.mjs`, `server/passwords.mjs`, `server/auth.mjs`, `server/permissions.mjs`, `server/routes/auth.mjs`, `tests/auth.test.mjs`, `tests/permissions.test.mjs`.

**Interfaces:** `hashPassword(password):Promise<string>`, `verifyPassword(password,encoded):Promise<boolean>`;
`requireRole(actor,roles):void`; `createApp({db,config,clock})`; `loadConfig(env):Config`.
Config contains `publicOrigin,dataDir,port,secureCookies,setupTokenFile,trustProxy,allowLocalHttp`; a non-local origin must be HTTPS;
HTTP is allowed only when ALLOW_LOCAL_HTTP=true is set explicitly and the origin host is localhost/127.0.0.1, to support the local container experience in Task 9.
Defaults are PORT=3000 and trustProxy=false; secureCookies is determined by the scheme of the validated origin.
The test HTTP helper adds `client(base)`, which returns `{request(method,path,body,headers),bootstrap(),csrf}` and keeps cookies;
request automatically sends the same-origin Origin, the CSRF and the JSON header, and returns `{status,body,headers}`.

- [x] **2.1 Write the authentication red tests.** Verify that setup fails without the setup credential, a valid setup succeeds, a second setup returns 409, and concurrent setups produce only one owner; verify rotation on login and invalidation on logout.

```js
test('password hashes are salted and verifiable', async () => {
  const a = await hashPassword('a-long-test-password');
  const b = await hashPassword('a-long-test-password');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('a-long-test-password', a), true);
  assert.equal(await verifyPassword('wrong-password', a), false);
});
test('a member cannot administer the organization', () => {
  assert.throws(() => requireRole({id:'m',role:'member'}, ['owner','admin']),
    error => error.status === 403);
});
```

Run `node --test tests/auth.test.mjs tests/permissions.test.mjs` and record the red result.

- [x] **2.2 Implement passwords and short-lived credentials.** The hashing core uses Node's official async API:

```js
const derive = promisify(scrypt);
const options = {N:131072,r:8,p:1,maxmem:256*1024*1024};
const salt = randomBytes(16);
const key = await derive(password, salt, 64, options);
const encoded = ['scrypt',options.N,options.r,options.p,salt.toString('hex'),key.toString('hex')].join('$');
```

The complete function must include password length validation, a bounded hashing queue, encoding format validation and a fixed-length timingSafeEqual.
session/token comparisons use hash values; the local variables above must never be concatenated into logs.

- [x] **2.3 Implement the HTTP foundation and authentication.** The app exposes only `app/` and the specific `/assets/sprites.js`, and does not call express.static on the repository root.
Register Helmet, the JSON limit, Origin/CSRF, cookie/session, the auth router, 404 and generic error handling.
setup first verifies the random credential from the file, hashes the password, then re-checks within an immediate transaction whether the organization exists, and only then creates the organization and the owner.
GET session establishes a CSRF for anonymous users; a successful login returns the replaced session; after setup is complete, the credential can no longer be used to create accounts.

- [x] **2.4 Cover the edge cases and go green.** Use the injectable clock to verify session expiry, the 15-minute limits, that a forged forwarded IP does not bypass the limits,
cross-Origin POSTs, missing CSRF, the uniform wrong-password response and static path traversal. All browser responses use Cache-Control: no-store;
confirm that 404/500 responses contain no absolute paths, SQL or request secrets. Run the Task 1–2 tests; commit `feat: secure organization setup and sessions`.

## Task 3: Invitations, account recovery, roles and deactivation

**Files:** Create `server/members.mjs`, `server/routes/members.mjs`, `tests/members.test.mjs`; modify `server/app.mjs`, `tests/helpers.mjs`.

**Interfaces:** `inviteMember(db,actor,{username,displayName,role},clock):{user,token}`;
`issueReset(db,actor,userId,clock):{token}`; `consumeToken(db,{token,passwordHash,purpose},clock):void`;
`updateMember(db,actor,userId,{role,active},clock):User`.
The raw token is returned only once, at creation; the route builds the link with a fragment from the fixed publicOrigin, and a GET of the link cannot consume the token.
The helper adds `authenticatedClient(t,{role='owner'}={})`, which returns `{api,db,actor,base}` and gets its cookie through a real setup/login.

- [x] **3.1 Write the privilege-escalation and lifecycle red tests.** The owner invites two users, who accept; test that an admin cannot invite an admin/owner, or reset or deactivate an owner/admin,
and that a member cannot call admin APIs; test expiry, reuse, wrong purpose, and that only one of two concurrent accepts succeeds.

```js
test('last owner cannot be removed', t => {
  const {db,owner} = fixture(t);
  assert.throws(() => updateMember(db,owner,owner.id,{active:false},()=>Date.now()),
    error => error.code === 'LAST_OWNER');
});
```

Run `node --test tests/members.test.mjs` to confirm the red result.

- [x] **3.2 Implement explicit target-role checks.** An admin manages only members; the owner can assign roles, but the last active owner cannot be demoted or deactivated.
Changing one's own display name does not go through the role-update API; new unknown fields must be rejected. Issuing a new reset link invalidates the old reset token.
The public route first does a cheap check that the token is valid, and only then runs the bounded password hash; consumeToken receives the precomputed passwordHash,
re-checks within the transaction that the token is unexpired and unused, then updates the password, marks the token as used and revokes all sessions.

```sql
UPDATE tokens SET used_at = @now
WHERE token_hash = @hash AND purpose = @purpose
  AND used_at IS NULL AND expires_at > @now;
```

changes=1 must be checked, and a failure rolls back; accept activates the invited user, and reset does not reactivate a deactivated user.

- [x] **3.3 Implement the deactivation transaction.** After checking the target role, set the user inactive, delete their sessions, invalidate all their tokens and cancel their pending redemptions,
write an audit entry for each cancellation, and do not delete the ledger. Redemption creation in Task 5 must check active again, so that it is mutually exclusive with the deactivation transaction.

- [x] **3.4 Verify reset and deactivation.** Reset after a real login, and the old cookie gets 401; after deactivation, neither the old session nor unused invitations can be used;
manually create a pending row in the fixture and verify that it is cancelled and the history is kept. Run the Task 1–3 tests; commit `feat: add invitations and member lifecycle`.

## Task 4: Grants, revocation, idempotency and permanent collections

**Files:** Create `server/idempotency.mjs`, `server/ledger.mjs`, `server/collections.mjs`, `themes/default.json`, `scripts/theme-manifest.mjs`, `tests/ledger.test.mjs`, `tests/collections.test.mjs`.

**Interfaces:** `balanceOf(db,userId):Balance`;
`withIdempotency(db,actor,route,key,payload,operation):{status,body}` wraps the check, the business callback and the response storage in the same immediate transaction;
`grant(db,actor,{userId,units,reason,key}):{entry,balance,collection}`;
`revokeGrant(db,actor,{grantId,reason,key}):{entry,balance}`;
`unlockEarned(db,userId,grantId):CollectionItem[]`, run only inside the caller's transaction;
`CollectionItem={ordinal,spriteKey,unlockedAt}`. Service parameters that take a clock default to `()=>Date.now()`.

- [x] **4.1 Write the red tests for calculation, replay, conflicts and permanent collections.** The test file imports the ledger interfaces above, fixture, test and strict assert.

```js
test('a retried grant creates one entry and one collection unlock', t => {
  const {db,owner,member} = fixture(t);
  const input = {userId:member.id,units:5000,reason:'Thanks for helping',key:'grant-request-0001'};
  const first = grant(db,owner,input);
  assert.deepEqual(grant(db,owner,input), first);
  assert.equal(balanceOf(db,member.id).postedUnits,5000);
  assert.equal(first.collection.length,1);
  assert.throws(() => grant(db,owner,{...input,units:10000}),
    error => error.code === 'IDEMPOTENCY_CONFLICT');
  revokeGrant(db,owner,{grantId:first.entry.id,reason:'Wrong recipient',key:'revoke-request-01'});
  assert.equal(balanceOf(db,member.id).lifetimeUnits,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM collection_unlocks WHERE user_id=?').get(member.id).n,1);
});
```

Also test that available takes pending reservations into account, that refunds do not increase lifetime, that a double revoke is rejected, that a revoke is impossible when the balance is insufficient,
out-of-range units (also verified with direct domain calls), and that deactivated users cannot receive new rewards. Run `node --test tests/ledger.test.mjs tests/collections.test.mjs` to get the red result.

- [x] **4.2 Implement the idempotency boundary and the append-only ledger.** payload must be a fixed-field object built by the domain layer, hashed after sorting keys stably;
the operation callback returns `{status,body}`; idempotency is written only when the transaction succeeds, and a failure rolls back everything; domain functions return its body, keeping the domain interfaces above consistent.
In the first version, successful records are not cleaned up automatically, so that a late retry cannot execute again. A DB busy timeout returns 503 `RETRY_LATER`, not a false success.

```sql
SELECT COALESCE(SUM(delta_units),0) AS posted_units,
       COALESCE(SUM(CASE WHEN kind IN ('grant','revoke') THEN delta_units ELSE 0 END),0) AS lifetime_units
FROM ledger WHERE user_id=@userId;
SELECT COALESCE(SUM(cost_units),0) AS reserved_units
FROM redemptions WHERE user_id=@userId AND status='pending';
```

The grant entry point first calls requireRole and validates the active user, the positive integer, and the balance and lifetime limits, then, inside the idem callback, appends the grant, unlocks collection items and writes the audit entry.
Revoke verifies that the source is a grant on this instance, that it has not been revoked, and that the balance minus reservations is sufficient; it appends the negated amount and an audit entry, and does not update collection_unlocks.
Reasons are limited to 500 characters, and a revoke must have a non-empty reason. An idempotent request returns the first response, so after a success the UI reads the latest /api/me separately.

- [x] **4.3 Fix the theme and the unlock order.** The theme-manifest script reads SPRITES/NAMES from sprites.js in the trusted repository,
and generates the default manifest with themeId, version, fixed keys and Chinese and English names; first confirm that there are currently exactly 39 items and verify palette/rows item by item.
A user's collection order is the lexicographic order of `SHA256(userId + ':' + spriteKey)`; Math.random is never used.

```js
const earned = Math.min(keys.length, Math.floor(lifetimeUnits / thresholdUnits));
for (let ordinal = existingCount; ordinal < earned; ordinal += 1) {
  insertUnlock.run({userId,ordinal,spriteKey:orderedKeys[ordinal],grantId,now});
}
```

Only grant calls unlock; when earned falls below existingCount after a revoke, nothing is deleted or issued again.
Test that `5000 grant → revoke → 5000 grant → 5000 grant` gives collection counts of `1,1,1,2`,
that grants keep working normally after the set is complete and the count never exceeds the full set, and that the order is the same after reopening the database.

- [x] **4.4 Go green and commit.** Run the Task 1–4 tests; commit `feat: add idempotent rewards and permanent collections`.

## Task 5: Benefit catalog and a redemption state machine verified under concurrency

**Files:** Create `server/rewards.mjs`, `server/redemptions.mjs`, `tests/redemptions.test.mjs`, `tests/concurrency.test.mjs`, `tests/fixtures/redemption-worker.mjs`.

**Interfaces:** `saveReward(db,actor,{id?,name,description,costUnits,active}):Reward`;
`requestRedemption(db,actor,{rewardId,key}):{redemption,balance}`;
`resolveRedemption(db,actor,{redemptionId,action:'complete'|'cancel'|'reject',reason?,key}):{redemption,balance}`;
`refundRedemption(db,actor,{redemptionId,reason,key}):{redemption,balance}`.
Reward contains id/name/description/costUnits/active; Redemption uses the camelCase form of the table fields above.
refund does not change completed back to pending, and the response includes `refunded:true`; the unique refund entry identifies the refunded state.

- [x] **5.1 Write the full business red tests.** Create a benefit, grant 5000, and request at a price of 3000; after the reservation, 2000 is available; changing the catalog price does not change the request snapshot; after completion the balance is 2000 and the collection is kept.

```js
test('reservation, completion and retry use one debit', t => {
  const {db,owner,member} = fixture(t);
  grant(db,owner,{userId:member.id,units:5000,reason:'Thanks',key:'grant-request-0001'});
  const reward = saveReward(db,owner,{name:'Coffee',description:'One drink',costUnits:3000,active:true});
  const pending = requestRedemption(db,member,{rewardId:reward.id,key:'redeem-request-01'});
  assert.equal(pending.balance.availableUnits,2000);
  const input = {redemptionId:pending.redemption.id,action:'complete',key:'complete-request-01'};
  const result = resolveRedemption(db,owner,input);
  assert.deepEqual(resolveRedemption(db,owner,input),result);
  assert.equal(balanceOf(db,member.id).postedUnits,2000);
  assert.equal(balanceOf(db,member.id).reservedUnits,0);
});
```

Test cancellation, rejection, a repeated refund, cancelling after completion, a member acting on someone else's request, and that a deactivated member cannot make a new request.
Run `node --test tests/redemptions.test.mjs tests/concurrency.test.mjs` to confirm the red result.

- [x] **5.2 Implement the state machine.** In the same immediate transaction, check that the actor/user is active, that the catalog item is active, and the balance and status,
write the request snapshot or the ledger debit, then write the audit entry and the idempotent response. Cancellation is allowed only for the requester or owner/admin; complete/reject/refund are owner/admin only.
Completion uses the request's snapshot price; a refund appends an equal positive amount, does not increase lifetime and does not unlock collection items.

```sql
UPDATE redemptions SET status=@nextStatus,resolved_at=@now
WHERE id=@id AND status='pending';
```

Check changes=1; a state failure returns 409 `INVALID_STATE`; the whole transaction rolls back, and money is never debited before the state is checked.
Domain calls hold the same idempotency transaction and do not wrap a separate COMMIT; balance and collection queries get consistent results within that transaction.

- [x] **5.3 Real multi-connection concurrency tests.** The test starts two Workers that share the same temporary db file, and each worker opens its own connection.
On receiving `{userId,rewardId,key}`, a worker reads the real role from users and calls requestRedemption, returning `{ok,code}`; it does not accept a role.
The parent test first gives a balance of 5000, and the two workers each request something priced at 3000; only one may succeed, and the other gets `INSUFFICIENT_BALANCE`.
Then both request at the same time with the same key: both get the same id, and only one row is added to the table. Workers close the DB in finally.
Also test deactivation interleaved with a request: if the request comes first, deactivation cancels it; if deactivation comes first, the request fails; in the end the inactive user has nothing pending.

- [x] **5.4 Go green and commit.** Run the Task 1–5 tests; commit `feat: add atomic benefit redemption and refunds`.

## Task 6: API composition, permission isolation and read models

**Files:** Create `server/routes/rewards.mjs`, `server/routes/read-models.mjs`, `tests/api.test.mjs`; modify `server/app.mjs`, `server/routes/members.mjs`.

**Interfaces:** The reward, admin and read paths listed in the global HTTP table; every route does only field validation, authentication, format mapping and service calls.
Domain modules do not read req/res. `GET /api/me` provides the full Balance and CollectionItem, and history uses the common pagination structure.

- [x] **6.1 Write the two-identity API red tests.** Use the helper to create real cookies for the owner and two members.

```js
test('member cannot list team members or grant rewards', async t => {
  const {api} = await authenticatedClient(t,{role:'member'});
  assert.equal((await api.request('GET','/api/admin/members')).status,403);
  assert.equal((await api.request('POST','/api/admin/grants',{
    userId:'another-user',amount:'50',reason:'forged'
  },{'Idempotency-Key':'unauthorized-key-01'})).status,403);
});
```

The owner grants a reward through the API, and the member API sees the same balance; member2 cannot see member1's details;
forging actorId/userId/role in the request body does not change the logged-in identity. Run `node --test tests/api.test.mjs` to get the red result.

- [x] **6.2 Wire in the services and paginated reads.** Member queries are always fixed to `WHERE user_id = session.user.id`,
and nonexistent and unauthorized resources both return 404; admin lists do not include password_hash/token/session.
This includes field allowlists for the user, benefit and redemption endpoints; parseUnits uses org.mode from the database and does not accept a mode from the client.

```js
const result = grant(db, req.actor, {
  userId: body.userId,
  units: parseUnits(body.amount, organization.mode),
  reason: body.reason,
  key: req.get('Idempotency-Key')
});
res.status(201).json(result);
```

body and organization must be defined by the route validator/database read; the common error-handling middleware comes after all routes.
All queries use bind parameters. Stable descending order by time + id; a malformed cursor returns 422.

- [x] **6.3 Test isolation and failure atomicity.** A grant without the idempotency header returns 422; the same key with a changed amount returns 409;
a request over the available amount returns 409, and afterwards the ledger/reservations are unchanged; database busy gives 503; paging through several rows with the same timestamp neither repeats nor skips items.
Run `npm test`; commit `feat: expose permission-scoped application API`.

## Task 7: Organization branding, rule locking, feedback configuration and safe export

**Files:** Create `server/org.mjs`, `server/csv.mjs`, `server/routes/org.mjs`, `tests/org.test.mjs`, `tests/csv.test.mjs`; modify `server/app.mjs`, `server/routes/read-models.mjs`.

**Interfaces:** `updateOrg(db,actor,patch):Org`; `normalizeLogo(buffer):Promise<Buffer>`;
`csvCell(value):string`; `exportLedger(db,actor):string`. The logo is saved in organization as a re-encoded PNG BLOB,
so a full database backup includes the branding assets, and no file writes to user-supplied paths are added.

- [x] **7.1 Write the red tests for rule locking, malicious images and CSV.** Initially, with no entries, mode/currency/threshold can be changed; after the first entry, any change to these fields returns 409.
Once a catalog exists, only display settings can be changed, which prevents a points/credit switch from changing what catalog prices mean; changing the unlock threshold is still limited to when there are no entries.

```js
test('spreadsheet formulas are neutralized and quotes escaped', () => {
  assert.equal(csvCell('=1+1'),'"\'=1+1"');
  assert.equal(csvCell('Sam "S"'),'"Sam ""S"""');
  assert.equal(csvCell('\t=1+1'),'"\'\t=1+1"');
});
```

The image tests use Sharp to generate a small valid PNG in memory, then submit, one at a time, an SVG, a fake PNG, a file over 1 MiB and an image whose decoded size exceeds 2048×2048.
Run `node --test tests/org.test.mjs tests/csv.test.mjs` to confirm the red result.

- [x] **7.2 Implement settings validation and image normalization.** name 1–80, welcome≤500, unitLabel 1–24 characters;
adminContact accepts only a valid HTTPS/mailto, and feedbackUrl accepts only HTTPS; schemes such as javascript/data are rejected.
feedbackUrl is empty by default; the UI uses the real GitHub issue address and does not build a placeholder form.
normalizeLogo first limits the buffer length, then decodes with Sharp using limitInputPixels=4194304; only the png/jpeg/webp formats are allowed,
multi-frame images are rejected, width and height must be ≤2048, and the image is scaled to at most 512×512 and re-encoded with `.png()`, without keeping the original metadata.

```js
const image = sharp(buffer,{limitInputPixels:4194304,animated:false});
const meta = await image.metadata();
if (!['png','jpeg','webp'].includes(meta.format) || (meta.pages ?? 1) !== 1 ||
    meta.width > 2048 || meta.height > 2048) throw new AppError(422,'INVALID_LOGO','Use a static image up to 2048 pixels.');
return image.resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).png().toBuffer();
```

The PUT route accepts only the agreed image content-types, using `express.raw({type:['image/png','image/jpeg','image/webp'],limit:'1mb'})`;
after decoding is complete, it saves and writes an audit entry in a short transaction; user SVGs are never allowed to execute.

- [x] **7.3 Implement the export.** owner/admin only; the fields are time, member, type, integer units, display unit, reason, actor and related id.
Every field is wrapped in double quotes with inner double quotes escaped, and a single quote is prepended when the first non-whitespace character is `= + - @` or the field begins with a control character.
Passwords/sessions/tokens are not exported. The attachment filename is set to the fixed `crumb-ledger.csv`; user input is never used as a header.
Rule updates, and logo updates and deletions, write audit entries; the public logo response uses nosniff.

- [x] **7.4 Go green and commit.** Add API tests that a member modifying the organization or downloading the whole team's ledger gets 403, that an admin modifying settings gets 403, and that a valid image returns a PNG.
Run `npm test`; commit `feat: add organization branding and safe exports`.

## Task 8: Member view, admin view and Chinese/English UI

**Files:** Create `app/index.html`, `app/app.css`, `app/main.js`, `app/api.js`, `app/dom.js`, `app/pixels.js`, `app/i18n.js`, `app/locales/en.js`, `app/locales/zh-CN.js`, `app/views/auth.js`, `app/views/member.js`, `app/views/admin.js`, `app/views/settings.js`, `playwright.config.mjs`, `tests/e2e/product.spec.mjs`, `tests/e2e/accessibility.spec.mjs`, `tests/e2e/fixtures.mjs`.

**Interfaces:** `request(path,{method='GET',body,key}={}):Promise<object>`, which keeps the CSRF in memory, credentials=same-origin;
`el(tag,{text,attrs}={},children=[]):HTMLElement`, which places user content only via textContent;
`renderAuth(root,context)`, `renderMember(root,context)`, `renderAdmin(root,context)`, `renderSettings(root,context)`;
context contains session, org, navigate, refresh, request and t (the translation function). `drawCollection(canvas,spriteKey)` reuses the trusted Pixel;
app/pixels.js wraps the global Pixel, and other modules do not depend on globals directly.

- [x] **8.1 Write the real-browser red tests.** Playwright uses a separate localhost test database and does not reuse development or production data;
fixtures exports `provision(browser,{mode})`, which creates the owner/member through the real setup/invite API and returns the credentials, the origin and
ownerPage/memberPage (separate browser contexts). E2E must be run for credit and for points separately.

```js
test('member requests a benefit and owner completes it', async ({browser}) => {
  const fx = await provision(browser,{mode:'points'});
  try {
    await fx.ownerPage.getByRole('button',{name:'Give recognition',exact:true}).click();
    await fx.ownerPage.getByLabel('Team member').selectOption(fx.memberId);
    await fx.ownerPage.getByLabel('Amount').fill('100');
    await fx.ownerPage.getByLabel('Message').fill('Thanks for helping a teammate');
    await fx.ownerPage.getByRole('button',{name:'Send reward',exact:true}).click();
    await fx.memberPage.reload();
    await expect(fx.memberPage.getByTestId('available-balance')).toHaveText('100 points');
    await fx.memberPage.getByRole('button',{name:'Redeem Coffee',exact:true}).click();
    await fx.memberPage.getByRole('button',{name:'Confirm request',exact:true}).click();
    await expect(fx.memberPage.getByText('Awaiting confirmation',{exact:true})).toBeVisible();
    await fx.ownerPage.getByRole('link',{name:'Redemptions',exact:true}).click();
    await fx.ownerPage.getByRole('button',{name:'Confirm delivery',exact:true}).click();
    await fx.memberPage.reload();
    await expect(fx.memberPage.getByTestId('collection-count')).toHaveText('1');
  } finally { await fx.close(); }
});
```

provision sets the points threshold to 100 and the Coffee price to 40 (for credit, threshold 5000 and price 1250), and creates the benefit through the API but does not grant anything in advance.
Run `npx playwright install chromium` and then `npm run test:e2e -- --project=chromium` to confirm the target flow is red.

- [x] **8.2 Build the product shell and the account screens.** On wide screens the member view is a personal card + benefits area, and on phones a single column; the admin area uses its own navigation,
and does not reuse the demo's control for freely switching between employees. Login, first-time setup, accepting an invitation and resetting a password all have clear labels and error messages.
GET session decides the setup/login/product state, without relying on the client declaring its own role.
A page refresh restores the login state; 401 returns to login, 403 shows a no-permission message, and 503 offers a retry that keeps the original idempotency key.

```js
export function el(tag,{text,attrs={}}={},children=[]) {
  const node=document.createElement(tag);
  if (text !== undefined) node.textContent=String(text);
  for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,String(value));
  node.append(...children);
  return node;
}
```

attrs only passes attributes predefined by the developer; link URLs are still validated against the allowed schemes. innerHTML is forbidden for user content.
Each submit action creates one key, which retries reuse until the action succeeds or the user explicitly abandons it; a new action generates a new key.

- [x] **8.3 Implement the member and admin flows.** Members see available/reserved, thanks, their collection, benefits and paginated history; before a redemption the price and a confirmation are shown,
and a network failure never pretends to be a success. Admins have member invitations, copy link, reset, deactivate, grant, revoke, catalog editing,
redemption complete/reject/refund, CSV export and the audit page; the owner additionally has branding, unit settings and admin role management.
When no organization contact is configured, clearly tell the user to contact the person responsible for the deployment, so that employee questions are not misdirected upstream.

- [x] **8.4 Add language and accessibility verification.** en/zh-CN cover all visible text; members can choose the display language for their session, with the organization setting as the default.
Amounts use the organization's currency rather than a hard-coded `$`; the language preference may be kept in localStorage after the page is closed, but accounts/tokens/the ledger are never stored there.
Canvas collection items come with name text and a count, forms use labels, dynamic messages use aria-live, dialogs trap and restore focus, and Escape closes them.
Playwright checks 390×844 and 1440×900 with no horizontal overflow; login and redemption can be completed with the keyboard alone; under reduce-motion there is no continuous automatic animation.
Injecting the display name `<img src=x onerror=alert(1)>` and the thank-you message `<script>` should display them as text and not execute them.

- [x] **8.5 Go green and commit.** Run `npm test` and the full E2E suite, and manually review the member and admin screenshots.
Refresh to verify that data is shared across sessions. Commit `feat: build member and team management interface`.

## Task 9: Containers, setup credential, backup/restore and CI

**Files:** Create `Dockerfile`, `.dockerignore`, `.env.example`, `compose.yaml`, `compose.https.yaml`, `Caddyfile`, `scripts/init-secrets.mjs`, `scripts/backup.mjs`, `scripts/restore.mjs`, `scripts/recover-owner.mjs`, `tests/backup.test.mjs`, `tests/config.test.mjs`, `.github/workflows/ci.yml`, `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md`.

**Interfaces:** `backupDatabase(db,outputPath):Promise<{path,sha256,schemaVersion}>`;
`restoreDatabase({sourcePath,destinationPath}):Promise<void>`; the CLIs use strict argument parsing and operate only on explicit targets.
backupDatabase uses better-sqlite3 `db.backup()` and does not directly copy the main file while the WAL is active; the logo is in the DB and is saved with the backup.
restore writes only to a new target that does not yet exist; it rejects an identical source and target, unknown schemas and quick_check failures.

- [x] **9.1 Write the backup and restore red tests.** The fixture first completes a grant, a redemption, a logo save and a collection, then creates a backup online;
after the backup it keeps writing to the original database, and the restored database must hold the snapshot as of the backup time, without seeing half of the new data.

```js
test('restore preserves business data and invalidates credentials', async t => {
  const {db,owner,member,path} = fixture(t);
  grant(db,owner,{userId:member.id,units:5000,reason:'Thank you',key:'backup-grant-0001'});
  db.prepare('INSERT INTO sessions(token_hash,user_id,csrf_hash,expires_at) VALUES(?,?,?,?)')
    .run('test-session',member.id,'test-csrf','2099-01-01T00:00:00.000Z');
  await backupDatabase(db,path+'.backup');
  await restoreDatabase({sourcePath:path+'.backup',destinationPath:path+'.restored'});
  const restored=openDatabase(path+'.restored');
  try {
    assert.equal(balanceOf(restored,member.id).postedUnits,5000);
    assert.equal(restored.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
    assert.equal(restored.prepare('SELECT count(*) AS n FROM collection_unlocks').get().n,1);
  } finally { restored.close(); }
});
```

Test a corrupted file, an existing target, a too-new version, and that unused invitation and reset tokens are invalidated; run `node --test tests/backup.test.mjs tests/config.test.mjs` to confirm the red result.

- [x] **9.2 Implement the operations scripts.** backup writes a new file, runs quick_check and computes SHA-256; its output contains only the file path/checksum digest.
restore validates in a temporary target in the same directory and clears sessions/tokens, keeping users, ledger, idempotency records, collections and the logo, and finally renames atomically;
invitations must be generated again after a restore. Overwriting is refused; the docs restore to a new volume and then switch the service over, keeping the original volume for rollback.
init-secrets uses `randomBytes(32).toString('base64url')` to write `.secrets/setup-token`, with wx to prevent overwriting,
and also refuses to overwrite when generating `.env`; it does not print the token. The .secrets directory is accessible only to the deploying user; on Linux, verify that the node user inside Docker
can read the read-only mounted secret, rather than just assuming that Compose will remap the file owner. The docs give the minimum read-permission setup needed for the deploying user/UID 1000,
and do not make the secrets directory world-readable. The Windows docs give caveats about ACLs on the current user's directory rather than promising that the POSIX mode takes effect.
recover-owner is an offline CLI for the server administrator only: it resets an existing owner's password by username, revokes their sessions/tokens and records a system audit entry.
It cannot create a second organization and does not open a recovery backdoor to the web; the password is read from stdin, never passed as a command-line argument or written to logs.

- [x] **9.3 Container and local startup.** The Dockerfile uses Node 24.21.0 bookworm-slim; first verify that the tag can be pulled, then pin the digest;
if the source is unavailable, record the real blocker and never fabricate a digest. Caddy's digest is likewise obtained and pinned via `docker buildx imagetools inspect caddy:2`.
The dependency builder installs python3/make/g++ and then runs `npm ci --omit=dev`; the runtime copies the server, app, themes, sprites,
package.json, the production dependencies and the backup/restore/recover-owner operations scripts.
The runtime uses the non-root node user and prepares `/data` and `/backups` writable by it; it does not copy .git/.env/.secrets/tests.

```yaml
services:
  crumb:
    build: .
    init: true
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      NODE_ENV: production
      PUBLIC_ORIGIN: ${PUBLIC_ORIGIN:-http://localhost:3000}
      ALLOW_LOCAL_HTTP: ${ALLOW_LOCAL_HTTP:-true}
      DATA_DIR: /data
      SETUP_TOKEN_FILE: /run/secrets/setup_token
    secrets:
      - setup_token
    volumes:
      - crumb_data:/data
      - crumb_backups:/backups
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
secrets:
  setup_token:
    file: ./.secrets/setup-token
volumes:
  crumb_data:
  crumb_backups:
```

ALLOW_LOCAL_HTTP takes effect only when publicOrigin is localhost/127.0.0.1; non-local domains must use HTTPS.
compose.https.yaml adds Caddy, a persistent certificate volume and ports 80/443; PUBLIC_ORIGIN comes from the configured https URL,
and local HTTP is disabled; the Caddyfile takes the domain from SITE_ADDRESS and does `reverse_proxy crumb:3000`.
trustProxy enables only one controlled proxy hop, and the app has no publicly published port; the default loopback port still restricts access to the local machine.
Before running, use `docker compose config` to validate the variables, secrets, volumes and the reverse-proxy connection.

- [ ] **9.4 Run a real deployment and restore drill.** The docs provide separate secret-initialization methods for machines with Node and machines with only Docker; the Docker method runs the pinned Node image with the current project mounted and executes init-secrets.
First run `docker compose up --build -d`, set up through a browser and grant a reward, then verify the records after `docker compose restart crumb`.
Run `docker compose exec crumb node scripts/backup.mjs --output /backups/acceptance.sqlite`,
run restore with a new restore volume, switch to the restored instance, log in again and compare users/ledger/redemptions/collections/logo.
Do the drill with temporary test volumes and never touch real data; keep `docker compose down -v` out of the regular upgrade steps.
HTTPS is verified on an available domain; if there is currently no domain, report only the reverse-proxy configuration and the local verification results, and do not claim that public HTTPS has passed acceptance.

- [x] **9.5 Set up CI and the operations docs.** CI uses Node 24 and runs npm ci, npm test, Playwright chromium, the Docker build and the container health check;
workflow permissions are contents:read, and no member data is uploaded to third-party services; Actions are pinned to verified commit SHAs.
Screenshots uploaded from failed tests come only from fictional test data.
DEPLOYMENT covers both reward modes, entering the first-time token, domains, required ports and cost boundaries; OPERATIONS covers
restore, backing up before upgrades, rolling back to the old image + old data volume, offline admin recovery, disk space, backup access control and periodic restore drills.

- [x] **9.6 Go green and commit.** Results must be recorded for npm test, E2E, container build/health and the restore comparison; missing capabilities, such as Docker being unavailable, are written explicitly into the acceptance report.
Commit `feat: ship self-hosted deployment and recovery tooling`.

## Task 10: README landing page, real screenshots, public demo and feedback

**Files:** Modify `README.md`, `CONTRIBUTING.md`, `index.html`, `assets/app.js`, `assets/style.css`, `scripts/make-og.mjs`, `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`, `.github/pull_request_template.md`; create `README.zh-CN.md`, `docs/THEMES.md`, `.github/ISSUE_TEMPLATE/usage_feedback.md`, `assets/screenshots/member.png`, `assets/screenshots/admin.png`, `tests/e2e/demo.spec.mjs`, `tests/docs.test.mjs`.

**Interfaces:** The public URL stays `https://bellaaaaxu.github.io/crumb/`; project feedback points to the existing GitHub Issues,
and self-hosted instances can configure an external feedbackUrl; the organization's adminContact and the project's feedbackUrl do not substitute for each other.

- [x] **10.1 Write the red tests for the entry points and demo regression.** docs.test verifies that the README's local links and images exist and that both languages have demo/deploy/feedback links;
it verifies only machine-checkable links, and does not lock down the marketing copy with lots of string assertions.

```js
test('README local assets and links resolve', async () => {
  for (const file of ['README.md','README.zh-CN.md']) {
    const markdown=await readFile(file,'utf8');
    const targets=[...markdown.matchAll(/\]\(([^)]+)\)/g)].map(match=>match[1]);
    for (const target of targets) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      await access(resolve(dirname(file),decodeURIComponent(target.split('#')[0])));
    }
  }
});
```

At the top, the test imports `readFile,access` from node:fs/promises and `resolve,dirname` from node:path.
The browser verifies the demo tour, Take control, granting, that the collection does not shrink after spending, and Reset; the public page has a demo label and a deployment entry point.

- [x] **10.2 Produce real screenshots.** Using the Task 8 test instance and a fictional team, capture the member and admin screens, all displayed in English.

```js
await ownerPage.screenshot({path:'assets/screenshots/admin.png',fullPage:true});
await memberPage.screenshot({path:'assets/screenshots/member.png',fullPage:true});
```

Before taking screenshots, wait for fonts/canvas/data to finish loading, disable animations, and hide one-time invitation/reset links.
Look at the actual images, and do not use generated images in place of software screenshots. Prioritize making the phone member card and the admin grant screen clear at README width.

- [x] **10.3 Rewrite the English and Chinese READMEs.** The opening structure is as follows; the paths and sections must actually exist:

```markdown
# Crumb

## Make appreciation something to keep.

Open-source recognition and rewards for teams. Self-hosted, with data under your control.

[Try the demo](https://bellaaaaxu.github.io/crumb/) · [Deploy Crumb](docs/DEPLOYMENT.md) · [Share feedback](https://github.com/bellaaaaxu/crumb/issues/new/choose)

![A team member's rewards and permanent collection](assets/screenshots/member.png)
```

Following the order in the spec, write the rewards story, member/admin features, cross-industry examples, deployment requirements, screenshots, data/backup notes, version limitations, contributing and MIT.
The existing "real prototype origin" is kept as brief background and no longer takes over the main narrative; do not claim there are already customers in every industry.
The quick-deploy commands reference the versions verified in Task 9, and GitHub Pages must not be described as able to run a production backend.
"No dependencies, no login" is explicitly limited to the demo and no longer applied to the whole project; the first version is marked as an early release, with no claims of large-enterprise certification or service guarantees.

- [x] **10.4 Update the demo and the share card.** Keep the original interaction logic, and update the header positioning, industry copy, CTA and meta/OG to team recognition.
The public demo makes clear that the identities are fictional, and links to the real deployment guide; it does not show unimplemented theme switching or service integrations.
Run `node scripts/make-og.mjs` and look at the generated assets/og.png, keeping the existing 1200×627 size and the unified tagline.

- [x] **10.5 Complete the feedback and theme docs.** The bug template adds version, deployment method, reproduction steps and browser; the feature template asks about the scenario and the blockers;
usage_feedback asks about the team's scenario, the most useful part and the step where they got stuck, with a short, clear notice about sensitive information.
THEMES defines themeId/version/keys/names/palette/rows, the allowed pixel sizes and the stable-key rules, and states that existing collection keys cannot be deleted or reused.
CONTRIBUTING is updated with the difference between npm/test/Docker and the build-free demo; the PR template asks for the relevant permission/ledger/restore verification results.

- [x] **10.6 Verify and commit.** node --test tests/docs.test.mjs, demo E2E, project E2E; do a read-only check of the public demo and the Issues links.
Check that the screenshots contain no tokens/real member information, and that the docs in both languages describe the same things. Commit `docs: launch Crumb project landing page and feedback paths`.

## Task 11: Full acceptance, independent review and release preparation

**Files:** Create `docs/RELEASE-CHECKLIST.md`, `docs/VALIDATION.md`; if the review finds problems, modify the corresponding task's files and add regression tests.

**Interfaces:** No new features; for each success criterion in the design, give the actual verification evidence and its limitations.

- [ ] **11.1 Run from a clean checkout.** Install the locked dependencies, run npm test and E2E, and with fresh volumes run the Docker build, setup,
the full credit and points flows, restart, backup and restore; do not reuse an earlier successful state in place of a clean deployment result.

```bash
npm ci
npm test
npx playwright install chromium
npm run test:e2e
docker compose config
docker compose build
git diff --check
```

init-secrets is run before compose config, following the Task 9 docs; if .env/.secrets already exist, do not overwrite them, and use a new temporary checkout directory instead.

- [x] **11.2 Independent review and fixes.** Invoke the review skill that matches the execution approach; the review focuses on the five kinds of failure in Review Focus,
SQL/permission boundaries, static file exposure, CSRF, token leaks, data recovery and the README's promises.
Independent review cannot replace testing; each fix adds the corresponding verification, and no unconfirmed new product scope is added.

- [x] **11.3 Write the acceptance report.** VALIDATION records the commit, environment, commands, test results, browsers, backup/restore records and the checks that could not be completed.
RELEASE-CHECKLIST maps item by item to the coverage table below. Checks that were not run are marked "not verified" and must never be written as "passed".
Do not commit `.env`, tokens, databases or test user credentials; the reports keep only fictional data and non-sensitive results.

- [x] **11.4 Deliver reviewable changes.** Commit `docs: record release validation`; provide the implementation diff and actual screenshots.
Push or create the PR according to the maintainer's authorization; after the PR is created, attach_artifact is required; creating only a draft does not mean a formal release.
Merging to main and public release depend on explicit authorization at that time. Until the required verification is complete, do not claim it is "ready for real benefit management in production".

## Spec coverage and self-check

| Design requirement | Responsible task/acceptance |
| --- | --- |
| Broad team positioning, MIT, non-goal boundaries | Task 10 README, Task 11 review |
| Setup, three roles, invitations, resets, permissions and sessions | Task 2–3, Task 6 API isolation |
| Credit/points, currency, rule locking, amount precision | Task 1, 4, 7, Task 8 E2E in both modes |
| Shared ledger, revocation, refunds, idempotency, concurrency | Task 4–6, multi-connection tests |
| Reservations, terminal states, cancellation on deactivation, catalog snapshots | Task 3, 5 |
| Permanent collections, threshold after revocation, completing the set, theme extension | Task 4, 8, 10 |
| Member, admin, settings, mobile, and Chinese/English | Task 8 |
| Branding, uploads, contacts, external feedback, export | Task 7–8 |
| Persistence, migrations, containers, HTTPS | Task 1–2, 9 |
| Consistent backups, restore, upgrades and admin rescue | Task 9, 11 |
| Static demo, real screenshots, README, share card | Task 8, 10 |
| Three kinds of project feedback, no telemetry and no outbound sensitive data | Task 7–8, 10–11 |

Plan self-check: every core requirement is assigned to a task; API, units, status and role use consistent naming.
Before execution, the maintainer still needs to review the plan and choose the execution approach.

## Technical basis and version verification

The current environment can run Node 24.14.0; Docker was not found on PATH. Writing the plan does not require installing Docker;
when implementing Task 9, first check which runtime environment is available; if containers cannot be run, keep the unverified items explicit, and do not treat a static configuration check as deployment acceptance.

While the plan was being written, the npm registry was only queried read-only and no dependencies were installed. The verified versions are express 5.2.1, better-sqlite3 13.0.3,
helmet 8.3.0, sharp 0.35.5 and @playwright/test 1.63.0, all of which support the chosen Node 24 line.
The local Node is 24.14.0; the official Node v24 docs show 24.21.0, so the container targets that patch version, and the image's existence and digest are verified in Task 9.

- [Node.js crypto: async scrypt and safe comparison](https://nodejs.org/docs/latest-v24.x/api/crypto.html)
- [Express 5 API](https://expressjs.com/en/5x/api/)
- [better-sqlite3: transaction and backup](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- [Express version metadata](https://registry.npmjs.org/express/5.2.1)
- [better-sqlite3 version metadata](https://registry.npmjs.org/better-sqlite3/13.0.3)
- [Helmet version metadata](https://registry.npmjs.org/helmet/8.3.0)
- [Sharp version metadata](https://registry.npmjs.org/sharp/0.35.5)
- [Playwright version metadata](https://registry.npmjs.org/@playwright/test/1.63.0)
