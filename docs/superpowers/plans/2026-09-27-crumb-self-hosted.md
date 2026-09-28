# Crumb Self-Hosted Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Crumb 交付为可独立部署的团队认可与奖励工具，并通过 README、演示和反馈入口帮助新组织采用。

**Architecture:** 现有根目录页面继续作为 GitHub Pages 静态演示。真实应用使用独立的 Node.js 服务、SQLite 持久化账本和同源浏览器客户端，一个实例服务一个组织。认证、发奖和兑换由服务端控制，像素资源在演示与真实应用之间复用。

**Tech Stack:** Node.js 24（最低 24.14.0，容器目标 24.21.0）、Express 5.2.1、better-sqlite3 13.0.3、Helmet 8.3.0、Sharp 0.35.5；原生 HTML/CSS/ES modules；node:test 与 Playwright 1.63.0；Docker Compose 和 Caddy 2。依赖固定精确版本并生成 package-lock.json，Caddy 在 Task 9 解析镜像 digest 后锁定。

**Spec:** [已确认设计](../specs/2026-09-27-crumb-self-hosted-design.md)。执行者必须先读取设计及本计划。

**Status:** 计划待审阅；本文件中的命令、代码和测试是实施指令，不代表已经实现或运行。

## Global Constraints

以下项目级要求直接沿用设计：

- Crumb 面向希望把感谢和奖励变成持续体验的组织与团队，不限制企业规模或行业。
- 核心流程：管理员发出认可 → 成员获得奖励 → 兑换实际福利 → 留下永久收藏。
- 已确认：每个组织首次设置时选择福利额度或积分，第一版只使用一种单位。
- 延续 MIT 开源许可，允许下载、修改和自行部署。
- 一个部署实例服务一个组织，组织拥有自己的数据。
- 所有权限和金额校验由服务端执行，隐藏按钮不作为权限控制。
- 请求重试不重复入账，跨步骤写入在数据库事务内完成。
- 组织有账目后不能通过设置切换模式、币种或解锁门槛。
- 正常消费不移除收藏。
- 真实账目不依赖客户端保存。
- 首版单实例运行，不提供水平扩容承诺。
- 所有传播截图来自实际实现；路线图与已交付能力分开，不添加虚构用户数或效果指标。
- 没有静默遥测，不自动上传成员数据、日志或使用统计。

## Review Focus

最可能伤害实际使用、需要在对应任务验证的五类情况：

1. 网络断开后的重试、重复点击、同一 key 不同请求体：不重复发奖或扣款；Task 4、5。
2. 两个设备同时花费同一余额、兑换中停用账号：不透支、不留下孤立预留；Task 3、5。
3. 管理员尝试重置所有者密码、成员猜测他人资源 ID：拒绝越权而非只隐藏界面；Task 2、3、6。
4. 积分小数、金额溢出、CSV 公式、Logo 伪装、恶意感谢内容：明确拒绝或安全展示；Task 1、7、8。
5. WAL 活跃期间备份、恢复后旧 session/token 可用、版本不兼容：备份一致、凭据失效、拒绝不兼容恢复；Task 9。

## 执行方式与范围

推荐在本对话由主代理顺序实施，末尾独立审查；这些任务共享账号、账本和事务接口，顺序执行能减少接口漂移。
若用户选择子代理方式，仍按依赖顺序逐项实施并审查，不并行修改同一模块。
计划获确认后才安装依赖、创建实现分支和修改产品。工作区隔离按 using-git-worktrees 技能及原生工具执行。

这是一个贯通的产品交付，任务之间存在明确依赖，不拆成彼此独立的子项目。
顺序：1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11。
每项使用红灯测试 → 最小实现 → 绿灯测试 → 聚焦提交，不在中途把未完成产品推到 main。

## 文件地图

| 路径 | 职责 |
| --- | --- |
| `package.json`, `package-lock.json`, `.node-version` | 精确依赖、Node 版本和命令 |
| `server/main.mjs`, `server/app.mjs`, `server/config.mjs` | 启动、HTTP 组合、配置校验 |
| `server/db.mjs`, `server/migrations/001-initial.sql` | 数据库连接、原子迁移、表与约束 |
| `server/errors.mjs`, `server/units.mjs` | 错误协议、整数奖励单位 |
| `server/auth.mjs`, `server/passwords.mjs`, `server/permissions.mjs` | 会话、密码、授权矩阵 |
| `server/members.mjs`, `server/org.mjs` | 邀请／重置／停用、设置与 Logo |
| `server/ledger.mjs`, `server/idempotency.mjs`, `server/collections.mjs` | 发奖、更正、幂等与收藏 |
| `server/rewards.mjs`, `server/redemptions.mjs` | 福利目录、预留及兑换状态机 |
| `server/routes/auth.mjs`, `members.mjs`, `rewards.mjs`, `org.mjs` | HTTP 请求验证和服务调用 |
| `server/csv.mjs`, `server/routes/read-models.mjs` | 导出与分页视图 |
| `app/index.html`, `app/app.css`, `app/main.js`, `app/api.js`, `app/dom.js` | 独立产品界面和 API 客户端 |
| `app/views/auth.js`, `member.js`, `admin.js`, `settings.js` | 四类页面及交互 |
| `app/i18n.js`, `app/locales/en.js`, `app/locales/zh-CN.js` | 完整中英文界面 |
| `themes/default.json`, `scripts/theme-manifest.mjs` | 稳定像素收藏列表 |
| `tests/helpers.mjs`, `tests/*.test.mjs`, `tests/e2e/*.spec.mjs` | API、领域、并发、恢复和浏览器验证 |
| `scripts/init-secrets.mjs`, `backup.mjs`, `restore.mjs`, `recover-owner.mjs` | 部署凭据与运维 |
| `Dockerfile`, `.dockerignore`, `compose.yaml`, `compose.https.yaml`, `Caddyfile` | 容器及 HTTPS 部署 |
| `.github/workflows/ci.yml`, `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md` | CI、部署、恢复与升级说明 |
| `README.md`, `README.zh-CN.md`, `docs/THEMES.md`, `CONTRIBUTING.md` | 项目落地页、主题和贡献说明 |
| `index.html`, `assets/app.js`, `assets/style.css`, `scripts/make-og.mjs` | 公共演示定位与入口更新 |
| `.github/ISSUE_TEMPLATE/*`, `assets/screenshots/*` | 项目反馈及真实截图 |

## 全局接口约定

### 数据与事务

数据库对象 `db` 为 better-sqlite3 Database。`openDatabase(path)` 创建连接并执行已编号迁移；
每个连接启用 `foreign_keys=ON`、`journal_mode=WAL`、`busy_timeout=5000`。
写事务统一 `db.transaction(fn).immediate()`，事务体不含 `await`。
密码哈希、图片解码、远程或文件 I/O 先完成，再开始短事务并重新校验前置条件。

ID 为服务端生成的 UUID，时间为服务端 ISO UTC。金额单位 `units` 为安全整数。
单笔与每人成交后余额上限均为 `1_000_000_000_000`；累计有效发奖亦不得超过此上限。
额度接收十进制字符串，如 `"12.50"`，积分接收整数字符串，如 `"100"`；API 不接受浮点 JSON 金额。

`Actor = { id: string, role: 'owner'|'admin'|'member' }` 从已验证 session 获取，不能来自请求体。
`Org = { name, mode: 'credit'|'points', currency: 'CAD'|'USD'|'CNY'|null, unitLabel, thresholdUnits, locale: 'en'|'zh-CN', welcome, adminContact, feedbackUrl }`。
`Balance = { postedUnits, reservedUnits, availableUnits, lifetimeUnits }`，四项均为整数。

数据库必须包含以下表；金额约束、外键、唯一性及追加表触发器放进迁移：

| 表 | 必要字段／约束 |
| --- | --- |
| `schema_migrations` | `version PRIMARY KEY, applied_at` |
| `organization` | 固定 id=1，Org 字段，`logo_png BLOB, created_at` |
| `users` | `id, username UNIQUE, display_name, password_hash, role, active, created_at` |
| `sessions` | `token_hash PRIMARY KEY, user_id nullable, csrf_hash, expires_at` |
| `tokens` | `token_hash PRIMARY KEY, purpose invite/reset, user_id, expires_at, used_at` |
| `login_limits` | `bucket PRIMARY KEY, attempts, window_start`，账号和 IP 两类限额 |
| `ledger` | `id, user_id, delta_units, kind grant/revoke/redeem/refund, actor_id, reason, source_id, created_at`；更正的 `(kind,source_id)` 唯一 |
| `rewards` | `id, name, description, cost_units, active, created_at` |
| `redemptions` | `id, user_id, reward_id, reward_name, cost_units, status, created_at, resolved_at`；状态 pending/completed/cancelled/rejected |
| `collection_unlocks` | `user_id, ordinal, sprite_key, unlocked_at, grant_id`；`(user_id,ordinal)` 主键 |
| `idempotency` | `(actor_id,route,key)` 主键，`request_hash,response_json,status_code,created_at` |
| `audit` | `id, actor_id, action, target_id, detail_json, created_at`；不记录密码、token、cookie |

`ledger`、`audit`、`collection_unlocks` 禁止 UPDATE/DELETE；退款不改原账目。
audit.actor_id 可为 NULL，仅限本机恢复等系统操作；HTTP 请求必须记录真实操作者。
`users.active=0` 同时表示尚未接受邀请或已停用；历史用户不硬删除。
幂等键 16–128 个可打印 ASCII 字符，浏览器默认 `crypto.randomUUID()`。
幂等作用域为操作者＋明确业务路由＋键；请求体经规范化后计算 SHA-256。
认证授权先于重放；相同键相同请求返回原响应，不同请求返回 409 `IDEMPOTENCY_CONFLICT`。

### HTTP 与错误

`createApp({db, config, clock = () => Date.now()})` 返回 Express app，不自行 listen。
`main.mjs` 负责启动与关闭。`AppError(status, code, message)` 统一返回
`{error:{code,message}}`，未知错误返回 500 的通用文案，日志不能包含请求体或密钥。
服务端校验所有字段、枚举、长度和未知键；JSON 请求体上限 32 KiB，Logo 请求单独限制。

| 方法和路径 | 权限／输入／输出 |
| --- | --- |
| `GET /healthz` | 数据库可用则 `{ok:true}`，不返回组织或环境秘密 |
| `GET /api/session` | 建立短期匿名会话或读取登录态，返回 `{user,csrfToken,initialized,org}`；匿名 org 仅名称、语言、Logo 是否存在 |
| `POST /api/setup` | 匿名 CSRF＋初始化凭据；`{setupToken,username,password,displayName,org}`；201 `{user,csrfToken}` |
| `POST /api/login`, `/api/logout` | CSRF；登录 `{username,password}`，返回新会话和 csrfToken；退出 204 |
| `POST /api/invitations/accept`, `/api/password/reset` | 匿名 CSRF；`{token,password}`；单次兑换，完成后需正常登录 |
| `GET /api/me` | 本人 `{user,org,balance,collection}`；不包含别人的数据 |
| `GET /api/me/ledger`, `/api/me/redemptions` | 本人分页历史 |
| `GET /api/rewards` | 登录后读取开放福利 |
| `POST /api/redemptions` | 本人＋幂等头；`{rewardId}`；201 `{redemption,balance}` |
| `POST /api/redemptions/:id/cancel` | 本人 pending 或管理员；幂等头；200 `{redemption,balance}` |
| `GET /api/admin/members`, `/api/admin/redemptions` | owner/admin；分页管理数据 |
| `POST /api/admin/invitations` | owner/admin；`{username,displayName,role}`；返回一次性 invitationUrl |
| `POST /api/admin/members/:id/reset` | owner 任意；admin 仅普通成员；返回一次性 resetUrl |
| `PATCH /api/admin/members/:id` | active 修改；角色修改仅 owner；返回更新后的成员 |
| `POST /api/admin/grants` | owner/admin；`{userId,amount,reason}`＋幂等头；201 `{entry,balance,collection}` |
| `POST /api/admin/grants/:id/revoke` | owner/admin；`{reason}`＋幂等头；200 `{entry,balance}` |
| `POST /api/admin/rewards`, `PATCH /api/admin/rewards/:id` | owner/admin；`{name,description,amount,active}`；返回福利 |
| `POST /api/admin/redemptions/:id/complete`, `/reject`, `/refund` | owner/admin＋幂等头；reject/refund 带 reason；返回兑换及余额 |
| `GET /api/admin/ledger.csv` | owner/admin；安全 CSV，下载响应 |
| `GET /api/admin/audit` | owner/admin；分页操作历史 |
| `PATCH /api/org` | owner；已入账后规则字段锁定；返回 Org |
| `PUT /api/org/logo`, `DELETE /api/org/logo` | owner；PNG/JPEG/WebP 二进制上传，或删除；204 |
| `GET /api/org/logo` | 返回重编码 PNG，不存在则 404 |

分页使用 `?limit=25&cursor=<base64url>`，最大 100；cursor 对应服务端校验的 `(created_at,id)`，
响应 `{items,nextCursor}`，稳定排序，不把用户可控字符串拼进 SQL。
金额端点的输入 amount 映射为领域接口 units 后再调用，不在账本函数内解析字符串。

### 认证的实现参数

用户名规范化为小写，限制 `[a-z0-9._-]{3,64}`；显示名 1–80 字符；密码 12–128 Unicode 字符。
密码使用 async scrypt，N=131072、r=8、p=1、maxmem=256 MiB、16 字节随机 salt、64 字节 key；
编码包含参数和 salt，比较使用 timingSafeEqual，进程最多同时进行两个哈希任务，队列上限 16。
不可用账号也执行固定的哑哈希验证，登录失败统一文案。
账号每 15 分钟最多 5 次失败、IP 每 15 分钟最多 30 次失败；返回 429 及 Retry-After，
计数使用服务端可信 socket 地址，默认不信任客户端 X-Forwarded-For。

会话 token 和一次性 token 采用 32 字节随机值，仅存 SHA-256；session 最长 12 小时，匿名 30 分钟，
邀请 7 天，重置 30 分钟。登录后轮换 session、CSRF。所有修改请求验证 CSRF 和配置的精确 Origin。
CSRF 原文由 `HMAC-SHA256(rawSessionToken,'crumb-csrf-v1')` 派生并存其哈希；GET session 可从 HttpOnly Cookie
重建相同 CSRF，无需每次读取都轮换，避免多标签页互相失效。未登录的邀请和重置操作也需要匿名 CSRF。
Cookie 为 HttpOnly、SameSite=Lax、Path=/，HTTPS 生产模式 Secure，响应 Cache-Control: no-store。
邀请／重置 token 放 URL fragment，页面读取后移除；Referrer-Policy: no-referrer。
安全响应头由 Helmet 提供，自托管产品 CSP 只允许同源脚本／样式和本地图片，禁用 inline script。

## Task 1：数据库、整数单位和测试基座

**Files:** 创建 `package.json`, `package-lock.json`, `.node-version`, `server/db.mjs`, `server/migrations/001-initial.sql`, `server/units.mjs`, `server/errors.mjs`, `tests/helpers.mjs`, `tests/units.test.mjs`, `tests/db.test.mjs`；修改 `.gitignore`。

**Interfaces:** `openDatabase(path)`；`parseUnits(amount,mode):number`；`formatUnits(units,org,locale):string`；`AppError(status,code,message)`。
测试 helper `fixture(t,{mode='credit',thresholdUnits=5000}={})` 创建临时磁盘数据库和固定 owner/member/member2，
返回 `{db,owner,member,member2,path}`；`t.after` 关闭连接并仅清理其临时目录。
fixture 插入测试用户不供生产调用。HTTP helper `serve(t,app)` 返回 localhost 随机端口 URL。

- [x] **1.1 安装精确依赖并建立命令。** Node 引擎限制 `>=24.14.0 <25`，ESM，私有 npm 包但仓库保持 MIT；不发布 npm 包。

```json
{"name":"crumb","version":"0.1.0","private":true,"type":"module","license":"MIT","engines":{"node":">=24.14.0 <25"},"scripts":{"start":"node server/main.mjs","test":"node --test tests/*.test.mjs","test:e2e":"playwright test","backup":"node scripts/backup.mjs","restore":"node scripts/restore.mjs"},"dependencies":{"express":"5.2.1","better-sqlite3":"13.0.3","helmet":"8.3.0","sharp":"0.35.5"},"devDependencies":{"@playwright/test":"1.63.0"}}
```

运行 `npm install` 生成 lockfile；忽略 `node_modules/`, `.env`, `.secrets/`, `data/`, `backups/`, `playwright-report/`, `test-results/`。
Docker 和 GitHub Pages 的公开素材仍不依赖 npm 安装。

- [x] **1.2 写红灯测试。** 文件顶部导入 node:test、strict assert 和下列被测接口；此时运行 `node --test tests/units.test.mjs tests/db.test.mjs` 应因尚未实现接口而失败。

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

数据库测试逐一检查外键开启、迁移重复运行不重复建表、ledger UPDATE/DELETE 被触发器拒绝、
关闭重开仍保留用户，并把不支持的新 schema version 判为启动失败。

- [x] **1.3 实现精确解析和迁移。** 核心算法如下，错误类型统一 422；formatUnits 用整数拆分与 Intl.NumberFormat 的币种／标签展示，不再用于计算。

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

按照上方表契约编写完整 SQL；ledger signed integer check，grant/refund 为正，revoke/redeem 为负。
迁移版本校验与迁移事务必须在开放 HTTP 前完成。

- [x] **1.4 绿灯并提交。** 运行两个测试文件，确认全部通过；提交 `feat: add persistent schema and exact reward units`。

## Task 2：初始化、会话、密码与授权基础

**Files:** 创建 `server/config.mjs`, `server/app.mjs`, `server/main.mjs`, `server/passwords.mjs`, `server/auth.mjs`, `server/permissions.mjs`, `server/routes/auth.mjs`, `tests/auth.test.mjs`, `tests/permissions.test.mjs`。

**Interfaces:** `hashPassword(password):Promise<string>`、`verifyPassword(password,encoded):Promise<boolean>`；
`requireRole(actor,roles):void`；`createApp({db,config,clock})`；`loadConfig(env):Config`。
Config 含 `publicOrigin,dataDir,port,secureCookies,setupTokenFile,trustProxy,allowLocalHttp`，非本机 origin 必须 HTTPS；
只有显式 ALLOW_LOCAL_HTTP=true 且 origin 主机为 localhost/127.0.0.1 时允许 HTTP，以支持 Task 9 的本地容器体验。
默认 PORT=3000、trustProxy=false，secureCookies 根据已校验 origin 的 scheme 确定。
测试 HTTP helper 增加 `client(base)`，返回 `{request(method,path,body,headers),bootstrap(),csrf}`，保存 cookie，
request 自动带同源 Origin、CSRF 和 JSON header，返回 `{status,body,headers}`。

- [ ] **2.1 写认证红灯测试。** 验证 setup 凭据缺失失败、有效 setup 成功、第二次 409、并发 setup 只产生一个所有者；验证登录轮换与退出失效。

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

运行 `node --test tests/auth.test.mjs tests/permissions.test.mjs`，记录红灯。

- [ ] **2.2 实现密码与短期凭据。** 哈希核心使用 Node 官方 async API：

```js
const derive = promisify(scrypt);
const options = {N:131072,r:8,p:1,maxmem:256*1024*1024};
const salt = randomBytes(16);
const key = await derive(password, salt, 64, options);
const encoded = ['scrypt',options.N,options.r,options.p,salt.toString('hex'),key.toString('hex')].join('$');
```

完整函数必须包括密码长度验证、有界哈希队列、编码格式验证和固定长度 timingSafeEqual。
session/token 比较使用哈希值；禁止把上述局部变量拼进日志。

- [ ] **2.3 实现 HTTP 基础和认证。** app 仅公开 `app/` 与特定 `/assets/sprites.js`，不对仓库根目录调用 express.static。
注册 Helmet、JSON 限额、Origin/CSRF、cookie/session、auth router、404 和通用错误处理。
setup 先验证文件中随机凭据，哈希密码后在 immediate 事务里重新检查 organization 是否存在，再创建组织及所有者。
GET session 为匿名建立 CSRF；登录成功返回替换后的 session；初始化完成后凭据不再允许创建账户。

- [ ] **2.4 补齐边界并转绿。** 用可注入 clock 验证 session 过期、15 分钟限额、伪造转发 IP 不绕过限额、
跨 Origin POST、缺少 CSRF、错误密码统一响应及静态路径遍历。所有浏览器响应 Cache-Control: no-store；
确认 404/500 不含绝对路径、SQL 或请求 secrets。运行 Task 1–2 测试；提交 `feat: secure organization setup and sessions`。

## Task 3：邀请、账号恢复、角色及停用

**Files:** 创建 `server/members.mjs`, `server/routes/members.mjs`, `tests/members.test.mjs`；修改 `server/app.mjs`, `tests/helpers.mjs`。

**Interfaces:** `inviteMember(db,actor,{username,displayName,role},clock):{user,token}`；
`issueReset(db,actor,userId,clock):{token}`；`consumeToken(db,{token,passwordHash,purpose},clock):void`；
`updateMember(db,actor,userId,{role,active},clock):User`。
token 原文只在创建返回一次；链接由 route 根据固定 publicOrigin 生成 fragment，GET 链接不能消耗 token。
helper 增加 `authenticatedClient(t,{role='owner'}={})` 返回 `{api,db,actor,base}`，通过真实 setup/login 得到 cookie。

- [ ] **3.1 写越权和生命周期红灯。** 所有者邀请两名用户并接受，测试管理员不能邀请 admin/owner、重置或停用 owner/admin，
成员不能调用管理 API；测试过期、重用、错误 purpose 及两个并发 accept 只有一个成功。

```js
test('last owner cannot be removed', t => {
  const {db,owner} = fixture(t);
  assert.throws(() => updateMember(db,owner,owner.id,{active:false},()=>Date.now()),
    error => error.code === 'LAST_OWNER');
});
```

运行 `node --test tests/members.test.mjs` 验证红灯。

- [ ] **3.2 实现明确的目标角色检查。** admin 只管理 member；owner 可任命角色，但最后一个 active owner 不可降权或停用。
自己修改显示名不通过角色更新 API；新增未知字段必须被拒绝。发出新重置链接时使旧重置 token 失效。
公开 route 先廉价检查 token 是否有效，再进行有界密码哈希；consumeToken 接收事先算好的 passwordHash，
在事务内重新检查未过期且未使用，再更新密码、标记 token 已用并撤销所有 session。

```sql
UPDATE tokens SET used_at = @now
WHERE token_hash = @hash AND purpose = @purpose
  AND used_at IS NULL AND expires_at > @now;
```

必须检查 changes=1，失败回滚；accept 将 invited 用户激活，reset 不重新激活已停用用户。

- [ ] **3.3 实现停用事务。** 检查目标角色后设置 inactive、删除 session、作废所有 token、取消该用户 pending 兑换，
为每个取消写 audit，不删除账本。Task 5 兑换创建必须再次检查 active，保证与停用事务互斥。

- [ ] **3.4 验证重置与停用。** 真实登录后重置，旧 cookie 401；停用后旧 session 与未用邀请皆不可用；
手工在 fixture 建 pending 行验证被取消且历史保留。跑 Task 1–3 测试；提交 `feat: add invitations and member lifecycle`。

## Task 4：发奖、撤销、幂等和永久收藏

**Files:** 创建 `server/idempotency.mjs`, `server/ledger.mjs`, `server/collections.mjs`, `themes/default.json`, `scripts/theme-manifest.mjs`, `tests/ledger.test.mjs`, `tests/collections.test.mjs`。

**Interfaces:** `balanceOf(db,userId):Balance`；
`withIdempotency(db,actor,route,key,payload,operation):{status,body}` 将检查、业务回调及响应存储包在同一 immediate 事务；
`grant(db,actor,{userId,units,reason,key}):{entry,balance,collection}`；
`revokeGrant(db,actor,{grantId,reason,key}):{entry,balance}`；
`unlockEarned(db,userId,grantId):CollectionItem[]`，仅在调用方事务内部执行；
`CollectionItem={ordinal,spriteKey,unlockedAt}`。带 clock 的服务参数默认 `()=>Date.now()`。

- [ ] **4.1 写计算、重放、冲突与永久收藏红灯。** 测试文件导入上述 ledger 接口、fixture、test 和 strict assert。

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

补测 available 包含 pending 预留、退款不增加 lifetime、double revoke 被拒绝、余额不足无法撤销、
单位越界（直接领域调用也验证）、停用用户不能收到新奖励。运行 `node --test tests/ledger.test.mjs tests/collections.test.mjs` 得到红灯。

- [ ] **4.2 实现幂等边界和只追加账本。** payload 必须是领域层构造的固定字段对象，稳定键排序后 hash；
operation 回调返回 `{status,body}`，成功事务才写 idempotency，失败整体回滚；领域函数取其 body 返回，保持上方领域接口一致。
成功记录第一版不自动清理，防止迟到重试再次执行。DB busy 超时返回 503 `RETRY_LATER` 而非伪成功。

```sql
SELECT COALESCE(SUM(delta_units),0) AS posted_units,
       COALESCE(SUM(CASE WHEN kind IN ('grant','revoke') THEN delta_units ELSE 0 END),0) AS lifetime_units
FROM ledger WHERE user_id=@userId;
SELECT COALESCE(SUM(cost_units),0) AS reserved_units
FROM redemptions WHERE user_id=@userId AND status='pending';
```

发奖入口先 requireRole，校验活跃用户、正整数、余额及 lifetime 上限，再在 idem 回调中追加 grant、解锁收藏、写 audit。
撤销验证 source 为本实例 grant、未撤销、余额减预留足够；追加相反数、audit，不更新 collection_unlocks。
原因限制 500 字符，撤销必须有非空原因。幂等请求返回第一次响应，因此 UI 成功后另读最新 /api/me。

- [ ] **4.3 固定主题与解锁顺序。** theme-manifest 脚本从可信仓库 sprites.js 读取 SPRITES/NAMES，
生成含 themeId、version、固定 keys 和中英文名字的默认清单；先确认当前确为 39 项并逐项验证 palette/rows。
用户收藏排序用 `SHA256(userId + ':' + spriteKey)` 的字典序，永不使用 Math.random。

```js
const earned = Math.min(keys.length, Math.floor(lifetimeUnits / thresholdUnits));
for (let ordinal = existingCount; ordinal < earned; ordinal += 1) {
  insertUnlock.run({userId,ordinal,spriteKey:orderedKeys[ordinal],grantId,now});
}
```

只有 grant 调用解锁；撤销后 earned 低于 existingCount 时不删除或重新发放。
测试 `5000 grant → revoke → 5000 grant → 5000 grant` 得到收藏数量 `1,1,1,2`，
集齐后继续发奖正常、数量不超过图鉴，重新打开数据库排序一致。

- [ ] **4.4 绿灯并提交。** 运行 Task 1–4 测试；提交 `feat: add idempotent rewards and permanent collections`。

## Task 5：福利目录和可并发验证的兑换状态机

**Files:** 创建 `server/rewards.mjs`, `server/redemptions.mjs`, `tests/redemptions.test.mjs`, `tests/concurrency.test.mjs`, `tests/fixtures/redemption-worker.mjs`。

**Interfaces:** `saveReward(db,actor,{id?,name,description,costUnits,active}):Reward`；
`requestRedemption(db,actor,{rewardId,key}):{redemption,balance}`；
`resolveRedemption(db,actor,{redemptionId,action:'complete'|'cancel'|'reject',reason?,key}):{redemption,balance}`；
`refundRedemption(db,actor,{redemptionId,reason,key}):{redemption,balance}`。
Reward 含 id/name/description/costUnits/active，Redemption 使用上方表字段的 camelCase。
refund 不把 completed 改回 pending，响应附 `refunded:true`；唯一退款分录识别已退款状态。

- [ ] **5.1 写完整业务红灯。** 创建福利、发 5000、申请价格 3000，预留后可用 2000；改目录价格不改申请快照；完成后余额 2000，收藏保留。

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

测试取消、拒绝、重复退款、已完成再取消、成员操作他人申请、停用成员不能新申请。
运行 `node --test tests/redemptions.test.mjs tests/concurrency.test.mjs` 确认红灯。

- [ ] **5.2 实现状态机。** 同一 immediate 事务中检查 actor/用户 active、目录 active、余额及状态，
写入申请快照或扣减账本，再写 audit 和幂等响应。取消仅本人或 owner/admin；complete/reject/refund 仅 owner/admin。
完成时使用申请快照价格；退款追加等额正数，不增加 lifetime，也不解锁收藏。

```sql
UPDATE redemptions SET status=@nextStatus,resolved_at=@now
WHERE id=@id AND status='pending';
```

检查 changes=1，状态失败返回 409 `INVALID_STATE`；整个事务回滚，绝不先扣款后检查状态。
domain 调用持有同一幂等事务，不再套独立 COMMIT；余额与收藏查询在该事务内取得一致结果。

- [ ] **5.3 真实多连接并发测试。** 测试启动两个 Worker，共用同一临时 db 文件，每个 worker 建自己的连接。
worker 收到 `{userId,rewardId,key}` 后读取 users 中真实 role 并调用 requestRedemption，返回 `{ok,code}`，不接收 role。
父测试先给余额 5000，两 worker 各申请价格 3000，只能一个成功、另一个 `INSUFFICIENT_BALANCE`。
再用同一 key 同时申请，两者得到同一 id，表中只增加一行。worker 在 finally 关闭 DB。
补测停用与申请交错：若先申请则停用取消，若先停用则申请失败，最终 inactive 用户没有 pending。

- [ ] **5.4 绿灯并提交。** 运行 Task 1–5 测试；提交 `feat: add atomic benefit redemption and refunds`。

## Task 6：API 组合、权限隔离与读取模型

**Files:** 创建 `server/routes/rewards.mjs`, `server/routes/read-models.mjs`, `tests/api.test.mjs`；修改 `server/app.mjs`, `server/routes/members.mjs`。

**Interfaces:** 全局 HTTP 表所列奖励、管理和读取路径；所有 route 只做字段验证、认证、格式映射和服务调用。
领域模块不读取 req/res。`GET /api/me` 提供完整 Balance 与 CollectionItem，历史使用统一分页结构。

- [ ] **6.1 写两身份 API 红灯。** 用 helper 创建 owner、两成员的真实 cookie。

```js
test('member cannot list team members or grant rewards', async t => {
  const {api} = await authenticatedClient(t,{role:'member'});
  assert.equal((await api.request('GET','/api/admin/members')).status,403);
  assert.equal((await api.request('POST','/api/admin/grants',{
    userId:'another-user',amount:'50',reason:'forged'
  },{'Idempotency-Key':'unauthorized-key-01'})).status,403);
});
```

owner 经 API 发奖，member API 查到相同余额；member2 看不到 member1 明细；
请求体伪造 actorId/userId/role 不改变登录身份。运行 `node --test tests/api.test.mjs` 得到红灯。

- [ ] **6.2 接入服务并分页读取。** 成员查询固定 `WHERE user_id = session.user.id`，
不存在与越权资源统一 404；管理列表不包含 password_hash/token/session。
包括用户、福利和兑换端点的字段白名单，parseUnits 使用数据库里的 org.mode，不接收客户端模式。

```js
const result = grant(db, req.actor, {
  userId: body.userId,
  units: parseUnits(body.amount, organization.mode),
  reason: body.reason,
  key: req.get('Idempotency-Key')
});
res.status(201).json(result);
```

body、organization 必须由 route 校验器／数据库读取定义；统一错误处理中间件位于所有路由之后。
所有查询使用 bind parameters。按时间＋id 稳定倒序，cursor 格式不合法返回 422。

- [ ] **6.3 测试隔离和失败原子性。** 一次发奖缺少幂等头返回 422；相同 key 修改金额返回 409；
超额申请返回 409，之后账本/预留保持不变；数据库 busy 503；同一时间多行分页不重复不漏项。
运行 `npm test`；提交 `feat: expose permission-scoped application API`。

## Task 7：组织品牌、规则锁定、反馈配置与安全导出

**Files:** 创建 `server/org.mjs`, `server/csv.mjs`, `server/routes/org.mjs`, `tests/org.test.mjs`, `tests/csv.test.mjs`；修改 `server/app.mjs`, `server/routes/read-models.mjs`。

**Interfaces:** `updateOrg(db,actor,patch):Org`；`normalizeLogo(buffer):Promise<Buffer>`；
`csvCell(value):string`；`exportLedger(db,actor):string`。Logo 用重编码 PNG BLOB 保存到 organization，
因此完整数据库备份包含品牌资源，不增加用户提供路径的文件写入。

- [ ] **7.1 写规则锁定、恶意图片和 CSV 红灯。** 初始无账目可改 mode/currency/threshold；首笔账目后任何更改这些字段都 409。
目录已存在时只可改展示设置，阻止积分/额度切换导致目录价格错义；调整解锁门槛仍只限无账目。

```js
test('spreadsheet formulas are neutralized and quotes escaped', () => {
  assert.equal(csvCell('=1+1'),'"\'=1+1"');
  assert.equal(csvCell('Sam "S"'),'"Sam ""S"""');
  assert.equal(csvCell('\t=1+1'),'"\'\t=1+1"');
});
```

图片测试用 Sharp 在内存生成合法小 PNG，再分别提交 SVG、伪 PNG、超 1 MiB 和超 2048×2048 解码尺寸。
运行 `node --test tests/org.test.mjs tests/csv.test.mjs` 确认红灯。

- [ ] **7.2 实现设置验证与图片归一化。** name 1–80、welcome≤500、unitLabel 1–24 字符；
adminContact 只接受有效 HTTPS/mailto，feedbackUrl 只接受 HTTPS；拒绝 javascript/data 等 scheme。
默认 feedbackUrl 为空，UI 使用真实 GitHub issue 地址，不构造占位表单。
normalizeLogo 先限制 buffer 长度，再 Sharp 解码 limitInputPixels=4194304，格式只允许 png/jpeg/webp，
拒绝多帧，宽高≤2048，缩放至最大 512×512 并 `.png()` 重编码，不保留原 metadata。

```js
const image = sharp(buffer,{limitInputPixels:4194304,animated:false});
const meta = await image.metadata();
if (!['png','jpeg','webp'].includes(meta.format) || (meta.pages ?? 1) !== 1 ||
    meta.width > 2048 || meta.height > 2048) throw new AppError(422,'INVALID_LOGO','Use a static image up to 2048 pixels.');
return image.resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).png().toBuffer();
```

PUT route 只接受约定 image content-type，使用 `express.raw({type:['image/png','image/jpeg','image/webp'],limit:'1mb'})`；
解码完成后在短事务保存并 audit，不允许执行用户 SVG。

- [ ] **7.3 实现导出。** 仅 owner/admin，字段为时间、成员、类型、整数 units、显示单位、理由、操作者、关联 id。
所有字段加双引号、内部双引号转义，首个非空白字符为 `= + - @` 或开头控制字符时加单引号。
不导出密码/session/token。设置 attachment 文件名为固定 `crumb-ledger.csv`，不使用用户输入作为 header。
规则更新、Logo 更新与删除写 audit；公开 Logo 响应 nosniff。

- [ ] **7.4 绿灯并提交。** API 测试加入 member 修改组织/下载全员账本 403、admin 修改设置 403、有效图片响应 PNG。
运行 `npm test`；提交 `feat: add organization branding and safe exports`。

## Task 8：成员端、管理员端与中英文界面

**Files:** 创建 `app/index.html`, `app/app.css`, `app/main.js`, `app/api.js`, `app/dom.js`, `app/pixels.js`, `app/i18n.js`, `app/locales/en.js`, `app/locales/zh-CN.js`, `app/views/auth.js`, `app/views/member.js`, `app/views/admin.js`, `app/views/settings.js`, `playwright.config.mjs`, `tests/e2e/product.spec.mjs`, `tests/e2e/accessibility.spec.mjs`, `tests/e2e/fixtures.mjs`。

**Interfaces:** `request(path,{method='GET',body,key}={}):Promise<object>`，维护内存 CSRF，credentials=same-origin；
`el(tag,{text,attrs}={},children=[]):HTMLElement` 仅以 textContent 放用户内容；
`renderAuth(root,context)`, `renderMember(root,context)`, `renderAdmin(root,context)`, `renderSettings(root,context)`；
context 含 session、org、navigate、refresh、request、t（翻译函数）。`drawCollection(canvas,spriteKey)` 复用可信 Pixel，
app/pixels.js 封装全局 Pixel，其他模块不直接依赖 globals。

- [ ] **8.1 写真实浏览器红灯。** Playwright 使用 localhost 独立测试数据库，不复用开发或生产数据；
fixtures 导出 `provision(browser,{mode})`，通过真实 setup/invite API 创建 owner/member 并返回凭据、origin、
ownerPage/memberPage（不同 browser context）。E2E 必须分别跑 credit 和 points。

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

provision 将 points 门槛设 100、Coffee 价格 40（credit 门槛 5000、价格 1250），通过 API 创建福利但不预先发奖。
运行 `npx playwright install chromium` 后 `npm run test:e2e -- --project=chromium`，确认目标流程红灯。

- [ ] **8.2 做产品壳与账号界面。** 宽屏成员为个人卡片＋福利区，手机为单列；管理区采用独立导航，
不复用演示中随意切换员工的控件。登录、首次设置、邀请接受、重置密码都有明确标签和错误提示。
GET session 决定初始化／登录／产品状态，不依赖客户端角色自我声明。
页面刷新恢复登录态，401 回登录，403 提示无权限，503 提供保留原幂等 key 的重试。

```js
export function el(tag,{text,attrs={}}={},children=[]) {
  const node=document.createElement(tag);
  if (text !== undefined) node.textContent=String(text);
  for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,String(value));
  node.append(...children);
  return node;
}
```

attrs 仅传开发者预定义属性；链接 URL 仍按允许的 scheme 验证。用户内容禁止 innerHTML。
每个提交动作创建一个 key，直到成功或用户明确放弃该动作前重试复用；新动作生成新 key。

- [ ] **8.3 实现成员与管理流程。** 成员看到可用／预留、感谢、收藏、福利和分页历史；兑换前展示价格和确认，
网络失败不假装成功。管理员有成员邀请、复制链接、重置、停用、发奖、撤销、目录编辑、
兑换完成／拒绝／退款、CSV 导出与 audit 页面；owner 另有品牌、单位设置及管理员角色管理。
未配置组织联系人时明确提示联系部署负责人，不能把员工问题误送到上游。

- [ ] **8.4 加语言与可访问性验证。** en/zh-CN 覆盖所有可见文案，成员可选择会话显示语言，组织设置为默认。
金额使用组织 currency 而不是硬编码 `$`；关闭页后语言偏好可保存在 localStorage，账号/token/账本不保存其中。
canvas 收藏附名称文字和数量，表单使用 label，动态消息 aria-live，dialog 捕获和恢复焦点，Escape 可关闭。
Playwright 检查 390×844、1440×900，无水平溢出；纯键盘完成登录及兑换；reduce-motion 下没有持续自动动画。
注入显示名 `<img src=x onerror=alert(1)>`、感谢 `<script>`，应显示文本且不会执行。

- [ ] **8.5 绿灯并提交。** 运行 `npm test` 与完整 E2E，手动查看成员和管理员截图。
刷新验证跨会话共享数据。提交 `feat: build member and team management interface`。

## Task 9：容器、初始化凭据、备份恢复与 CI

**Files:** 创建 `Dockerfile`, `.dockerignore`, `.env.example`, `compose.yaml`, `compose.https.yaml`, `Caddyfile`, `scripts/init-secrets.mjs`, `scripts/backup.mjs`, `scripts/restore.mjs`, `scripts/recover-owner.mjs`, `tests/backup.test.mjs`, `tests/config.test.mjs`, `.github/workflows/ci.yml`, `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md`。

**Interfaces:** `backupDatabase(db,outputPath):Promise<{path,sha256,schemaVersion}>`；
`restoreDatabase({sourcePath,destinationPath}):Promise<void>`；CLI 使用严格参数解析，只操作显式目标。
backupDatabase 用 better-sqlite3 `db.backup()`，不直接复制活跃 WAL 主文件；Logo 在 DB 中随备份保存。
restore 只写不存在的新目标；拒绝源目标相同、未知 schema 和 quick_check 失败。

- [ ] **9.1 写备份与恢复红灯。** fixture 先完成发奖、兑换、Logo 保存、收藏，再在线生成备份；
备份后继续写入原库，恢复库应保持备份时间点快照，不能读到一半新数据。

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

测试损坏文件、已有目标、版本过新、未用邀请和重置 token 被作废；运行 `node --test tests/backup.test.mjs tests/config.test.mjs` 确认红灯。

- [ ] **9.2 实现运维脚本。** backup 写入新文件、quick_check、计算 SHA-256，输出只含文件路径／校验摘要。
restore 在同目录临时目标中验证并清空 session/token，保留用户、账本、幂等、收藏和 Logo，最后原子重命名；
恢复后邀请需要重新生成。拒绝覆盖，文档用新卷恢复后再切换服务，原卷保留供回滚。
init-secrets 使用 `randomBytes(32).toString('base64url')` 写 `.secrets/setup-token`，wx 防止覆盖，
生成 `.env` 时也拒绝覆盖；不打印 token。.secrets 目录只供部署用户访问；Linux 下需验证 Docker 内 node 用户
能够读取只读挂载 secret，不能仅假设 Compose 会重映射文件属主。文档提供部署用户／UID 1000 所需的最小读取权限配置，
不把秘密目录设为全局可读。Windows 文档给出当前用户目录 ACL 注意事项而非承诺 POSIX mode 生效。
recover-owner 仅为服务器管理员的离线 CLI：按用户名重设已有 owner 密码、撤销其 session/token、记录 system audit。
不能创建第二组织，不向网页开放恢复后门；密码从 stdin 读取，不作为命令行参数或写日志。

- [ ] **9.3 容器与本地启动。** Dockerfile 使用 Node 24.21.0 bookworm-slim，先验证 tag 可拉取再锁定 digest，
如供应源不可用需记录真实阻碍，不能伪造 digest。Caddy 同样通过 `docker buildx imagetools inspect caddy:2` 获取并固定 digest。
依赖 builder 安装 python3/make/g++ 后 `npm ci --omit=dev`，runtime 复制服务端、app、themes、sprites、
package.json、生产依赖及 backup/restore/recover-owner 运维脚本。
runtime 使用 node 非 root 用户，准备其可写 `/data` 和 `/backups`；不复制 .git/.env/.secrets/tests。

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

ALLOW_LOCAL_HTTP 仅在 publicOrigin 为 localhost/127.0.0.1 时有效，非本机域名必须 HTTPS。
compose.https.yaml 增加 Caddy、持久化证书卷、80/443 端口，PUBLIC_ORIGIN 来自已配置 https URL，
禁用 local HTTP；Caddyfile 从 SITE_ADDRESS 取域名并 `reverse_proxy crumb:3000`。
trustProxy 只启用一个受控代理跳数，应用没有公网发布端口；默认 loopback 端口仍限制本机。
运行前 `docker compose config` 校验变量、secrets、volumes 和反向代理连接。

- [ ] **9.4 运行实际部署与恢复演练。** 文档分别提供有 Node 和只有 Docker 的密钥初始化方法；Docker 方法运行固定 Node 镜像挂载当前项目，执行 init-secrets。
先 `docker compose up --build -d`，用浏览器初始化并发奖，`docker compose restart crumb` 后验证记录。
运行 `docker compose exec crumb node scripts/backup.mjs --output /backups/acceptance.sqlite`，
使用新恢复卷运行 restore，切换到恢复实例重新登录比对用户／账本／兑换／收藏／Logo。
用临时测试卷完成演练，不操作真实数据；避免 `docker compose down -v` 写进常规升级步骤。
HTTPS 在可用域名上验证；若当前无域名，仅报告反向代理配置及本地验证结果，不能声称公网 HTTPS 已验收。

- [ ] **9.5 建 CI 和运维文档。** CI 使用 Node 24，执行 npm ci、npm test、Playwright chromium、Docker build 与容器 health check；
workflow permissions 为 contents:read，不向第三方服务上传成员数据；固定 Actions 已核实 commit SHA。
上传失败测试截图时仅来自虚构测试数据。
DEPLOYMENT 覆盖两种奖励模式、首次 token 输入、域名、所需端口及成本边界；OPERATIONS 覆盖
恢复、升级前备份、回滚旧镜像＋旧数据卷、管理员离线恢复、磁盘空间、备份访问控制和定期恢复演练。

- [ ] **9.6 绿灯并提交。** npm test、E2E、容器 build/health、恢复比对必须记录结果，缺失能力如 Docker 不可用明确写入验收报告。
提交 `feat: ship self-hosted deployment and recovery tooling`。

## Task 10：README 落地页、真实截图、公开演示与反馈

**Files:** 修改 `README.md`, `CONTRIBUTING.md`, `index.html`, `assets/app.js`, `assets/style.css`, `scripts/make-og.mjs`, `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`, `.github/pull_request_template.md`；创建 `README.zh-CN.md`, `docs/THEMES.md`, `.github/ISSUE_TEMPLATE/usage_feedback.md`, `assets/screenshots/member.png`, `assets/screenshots/admin.png`, `tests/e2e/demo.spec.mjs`, `tests/docs.test.mjs`。

**Interfaces:** 公共 URL 保留 `https://bellaaaaxu.github.io/crumb/`；项目反馈指向现有 GitHub Issues，
自托管实例可配置外部 feedbackUrl；组织 adminContact 与项目 feedbackUrl 不互相替代。

- [ ] **10.1 写入口和演示回归红灯。** docs.test 验证 README 的本地链接和图片存在、两种语言均有 demo/deploy/feedback 链接；
只验证可机器检查的链接，不通过大量字符串断言锁死营销文案。

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

测试顶部导入 `readFile,access` from node:fs/promises 和 `resolve,dirname` from node:path。
浏览器验证 demo tour、Take control、发奖、消费后收藏不减少、Reset；公开页面有 demo 标签及部署入口。

- [ ] **10.2 制作真实截图。** 用 Task 8 的测试实例与虚构团队，捕获成员和管理员画面，统一英文显示。

```js
await ownerPage.screenshot({path:'assets/screenshots/admin.png',fullPage:true});
await memberPage.screenshot({path:'assets/screenshots/member.png',fullPage:true});
```

截图前等待字体／canvas／数据加载完成，禁用动画，隐藏一次性邀请／重置链接。
查看实际图片，不使用生成图替代软件截图。优先让手机成员卡和管理发奖界面在 README 宽度下清晰。

- [ ] **10.3 重写英文与中文 README。** 开头结构如下；路径与章节必须实际存在：

```markdown
# Crumb

## Make appreciation something to keep.

Open-source recognition and rewards for teams. Self-hosted, with data under your control.

[Try the demo](https://bellaaaaxu.github.io/crumb/) · [Deploy Crumb](docs/DEPLOYMENT.md) · [Share feedback](https://github.com/bellaaaaxu/crumb/issues/new/choose)

![A team member's rewards and permanent collection](assets/screenshots/member.png)
```

按 spec 顺序写奖励故事、成员/管理员功能、跨行业案例、部署要求、截图、数据/备份说明、版本限制、贡献与 MIT。
既有“真实原型来源”保留为简短背景，不再占据主叙事；不宣称所有行业已有客户。
快速部署命令引用 Task 9 已验证版本，不能将 GitHub Pages 说成可运行生产后端。
将“无依赖、无登录”明确限定为 demo，不再用于整个项目；首版标记为早期版本，不宣称大企业认证或服务保障。

- [ ] **10.4 更新演示和分享卡。** 保留原互动逻辑，将页首定位、行业文案、CTA 与 meta/OG 更新为团队认可。
公开演示明确虚构身份，并连接真实部署指南；不展示未实现的主题切换或服务接入。
运行 `node scripts/make-og.mjs` 并查看生成的 assets/og.png，保持现有 1200×627 尺寸及统一标语。

- [ ] **10.5 补齐反馈与主题文档。** bug 模板加入版本、部署方式、复现、浏览器；feature 模板问场景与阻碍；
usage_feedback 询问团队场景、最有用部分、卡住步骤，敏感信息提示简短明确。
THEMES 定义 themeId/version/keys/名称/palette/rows、允许的像素大小和稳定 key 规则，说明现有收藏 key 不能删除或重用。
CONTRIBUTING 更新 npm/test/Docker 与演示无构建的差别；PR 模板要求相关权限／账本／恢复验证结果。

- [ ] **10.6 验证并提交。** node --test tests/docs.test.mjs、demo E2E、项目 E2E；只读检查公共 demo 和 Issues 链接。
检查截图无 token／真实成员资料，检查双语文档描述一致。提交 `docs: launch Crumb project landing page and feedback paths`。

## Task 11：完整验收、独立审查与发布准备

**Files:** 创建 `docs/RELEASE-CHECKLIST.md`, `docs/VALIDATION.md`；如审查发现问题，修改对应任务文件并补回归测试。

**Interfaces:** 不新增功能；对设计中每个成功标准给出实际验证证据及限制。

- [ ] **11.1 从干净检出执行。** 安装锁定依赖、跑 npm test 和 E2E，用 fresh volumes 执行 Docker 构建、初始化、
credit 与 points 全流程、重启、备份和恢复；不复用先前成功状态代替干净部署结果。

```bash
npm ci
npm test
npx playwright install chromium
npm run test:e2e
docker compose config
docker compose build
git diff --check
```

init-secrets 在 compose config 前按 Task 9 文档执行；若已有 .env/.secrets，不覆盖，应使用新的临时检出目录。

- [ ] **11.2 独立审查并修复。** 按执行方式调用相应 review 技能；审查重点为 Review Focus 的五类故障、
SQL/权限边界、静态文件暴露、CSRF、token 泄漏、数据恢复和 README 承诺。
独立审查不能代替测试；每项修复补充相应验证，不增加未确认的新产品范围。

- [ ] **11.3 写验收报告。** VALIDATION 记录 commit、环境、命令、测试结果、浏览器、备份/恢复记录和不能完成的检查。
RELEASE-CHECKLIST 逐项对应下面 coverage 表。没有执行的检查标“未验证”，不能写“通过”。
不提交 `.env`、token、数据库或测试用户凭据；报告仅保留虚构数据和非敏感结果。

- [ ] **11.4 交付可审查改动。** 提交 `docs: record release validation`；提供实现差异和实际截图。
根据用户授权完成推送或创建 PR，创建 PR 后必须 attach_artifact；只创建草稿不等于已正式发布。
main 合并及对外发布以当时明确授权为准。未完成必需验证时不得宣称“可正式投入真实福利管理”。

## Spec coverage 与自检

| 设计要求 | 负责任务／验收 |
| --- | --- |
| 广泛团队定位、MIT、非目标边界 | Task 10 README，Task 11 审查 |
| 初始化、三角色、邀请、重置、权限与会话 | Task 2–3，Task 6 API 隔离 |
| 额度/积分、币种、规则锁定、金额精度 | Task 1、4、7，Task 8 两模式 E2E |
| 共享账本、撤销、退款、幂等、并发 | Task 4–6，多连接测试 |
| 预留、终态、停用取消、目录快照 | Task 3、5 |
| 永久收藏、撤销后门槛、集齐、主题扩展 | Task 4、8、10 |
| 成员、管理、设置、手机与中英文 | Task 8 |
| 品牌、上传、联系人、外部反馈、导出 | Task 7–8 |
| 持久化、迁移、容器、HTTPS | Task 1–2、9 |
| 一致性备份、恢复、升级与管理员救援 | Task 9、11 |
| 静态演示、真实截图、README、分享卡 | Task 8、10 |
| 三种项目反馈、无遥测与敏感数据外发 | Task 7–8、10–11 |

计划自检：所有核心需求均有任务归属；API、units、status 和 role 使用统一命名。
执行前仍需用户审阅计划并选择执行方式。

## 技术依据与版本核实

当前环境能运行 Node 24.14.0；PATH 中未发现 Docker。编写计划不需要安装 Docker，
实施 Task 9 时先检查可用运行环境；无法运行容器时保留明确的未验证项，不把配置静态检查当作部署验收。

编制计划时只读查询 npm registry，未安装依赖。核实版本为 express 5.2.1、better-sqlite3 13.0.3、
helmet 8.3.0、sharp 0.35.5、@playwright/test 1.63.0，均支持所选 Node 24 系列。
本地 Node 为 24.14.0；Node 官方 v24 文档显示 24.21.0，因此容器以该补丁版本为目标，镜像存在性与 digest 在 Task 9 验证。

- [Node.js crypto：async scrypt 与安全比较](https://nodejs.org/docs/latest-v24.x/api/crypto.html)
- [Express 5 API](https://expressjs.com/en/5x/api/)
- [better-sqlite3：transaction 与 backup](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- [Express 版本元数据](https://registry.npmjs.org/express/5.2.1)
- [better-sqlite3 版本元数据](https://registry.npmjs.org/better-sqlite3/13.0.3)
- [Helmet 版本元数据](https://registry.npmjs.org/helmet/8.3.0)
- [Sharp 版本元数据](https://registry.npmjs.org/sharp/0.35.5)
- [Playwright 版本元数据](https://registry.npmjs.org/@playwright/test/1.63.0)
