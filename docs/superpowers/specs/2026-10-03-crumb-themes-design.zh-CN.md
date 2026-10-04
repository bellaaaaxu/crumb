# Crumb：收藏主题（饼店、面包店）

*英文译本：[2026-10-03-crumb-themes-design.md](2026-10-03-crumb-themes-design.md)。*

状态：设计已批准（2026-10-03），待实施。
基线：0.2.0（`main`，合并提交 `bbfda7f`）。

## 1. 目标与已定决定

同一个 Crumb，换一身皮就能给另一种店用。一个团队在建团队时选一套「收藏主题」，收藏架上的图、吉祥物和几句跟图有关的话都跟着这套主题走。收藏的规则不变：收到的下午茶每攒够一个台阶就多一件，花钱拿不走。

已定决定：

- **两套主题**：**饼店**（现在的 39 款点心，吉祥物老婆饼，主题 id 仍是 `default`）和**面包店**（24 款面包和蛋糕，吉祥物「咬一口吐司」，id `bakery`）。咖啡店是下一轮。
- **只换图和几句话**：收藏怎么攒、怎么排、花钱拿不走，都和现在一样。像素风、名字 Crumb、颜色都不变。
- **建团队时选**，默认饼店。**第一次请下午茶之前**，所有者可以在设置里改；之后和解锁台阶一起定住。
- **锁定之前换主题**：福利配的图如果新主题里没有，去掉，并告诉所有者去掉了几个。两套主题共有的图不受影响。
- **做法：一本画册，几张清单**。所有图都在 `assets/sprites.js` 里，各画一次；一套主题是一张清单（哪些图、吉祥物是哪个、叫什么名字）。两套主题共有的 12 款在画册里只有一份。别人加一套主题：在这个文件里画图、写清单，跑一条命令，再把新键登记进测试名单（§10）。
- **已经在用的团队**升级后自动是饼店：收藏、吉祥物、图标和跟着主题走的句子都不变。所有者的设置页会多出主题卡片（已请过下午茶的团队是灰的），锁定提示的几句加上了「收藏主题」（§4、§6）。
- **公开演示页**加「Pastry shop | Bakery」切换，第一次来默认饼店，切换时放「拉闸换货」动效（§7.1）。

## 2. 两套主题的内容

**饼店**（`default`）：现在的 39 款，内容、顺序、键都不变。演示页的轮换仍是其中 33 款，另 6 款只在自己架的应用里能攒到（和现在一样）。

**面包店**（`bakery`），24 款：

- **沿用饼店的 12 款**（同一个键、同一张图）：菠萝包 `bolo`、菠萝油 `boloyau`、鸡尾包 `gaimei`、肠仔包 `sausage`、奶油面包 `creambun`、芝士热狗包 `cheesehotdog`、三角蛋糕 `caketriangle`、黑森林蛋糕 `blackforest`、芒果慕斯蛋糕 `mango`、瑞士卷 `swissroll`、纸包蛋糕 `papercake`、栗子蛋糕 `chestnut`。
- **吉祥物** 1 款：咬一口吐司（见 §3）。
- **新画 11 款**：

| 键 | 简体 | 繁体 | English | 画法要点 |
| --- | --- | --- | --- | --- |
| `croissant` | 牛角包 | 牛角包 | Croissant | 月牙形，一层层 |
| `baguette` | 法棍 | 法棍 | Baguette | 斜放，几道刀口 |
| `loaf` | 山形吐司 | 山形吐司 | Loaf | 整条，顶上鼓起 |
| `bagel` | 贝果 | 貝果 | Bagel | 圈圈，撒芝麻 |
| `pretzel` | 椒盐卷饼 | 椒鹽卷餅 | Pretzel | 打个结 |
| `cinnamonroll` | 肉桂卷 | 肉桂卷 | Cinnamon Roll | 螺旋加糖霜，和瑞士卷的切面不一样 |
| `strawberrycake` | 草莓蛋糕 | 草莓蛋糕 | Strawberry Cake | 整个圆的，顶上草莓 |
| `cupcake` | 纸杯蛋糕 | 紙杯蛋糕 | Cupcake | 奶油尖尖 |
| `donut` | 甜甜圈 | 甜甜圈 | Donut | 粉色糖霜 |
| `tiramisu` | 提拉米苏 | 提拉米蘇 | Tiramisu | 方块，可可粉 |
| `madeleine` | 玛德琳 | 瑪德蓮 | Madeleine | 贝壳形 |

- **画法**：守 `docs/THEMES.md` 的格式（12×12、`.` 透明、`#RRGGBB` 调色板），以及现有图的画法（本轮写进 THEMES.md 的「画法」一节）：平涂；连外框共 3 到 5 种颜色；没有脸；外框 `X` 用这款主色的深色——烤色的东西用深棕（现有多数共用 `#7A4A1E`），不是棕色的用自己颜色的深一号（芋头 `#6E4E86`、糯米糍 `#6B7F3E`）。形状彼此不撞，不再加三角形蛋糕。
- **每款画好（连同吉祥物）先给维护者看**，点头才算定稿。哪款缩到页头大小认不出来，从候补里换：欧包、可露丽、布丁、三明治、泡芙、马芬、法式吐司、生日蛋糕。换了的话，键和名字跟着换，本文件里用到这个键的地方一起改：§2 的表和清单顺序、§4 的卡片预览、§7 说明卡的小图；换掉的是 `croissant`，§7 那句「“Croissant is in the oven”」也换成新那款的英文名。
- **面包店的清单顺序**（也是它在演示页的轮换；面包店没有「只在应用里」的款）：`toastbite`、`croissant`、`bolo`、`strawberrycake`、`baguette`、`gaimei`、`cupcake`、`loaf`、`caketriangle`、`bagel`、`sausage`、`donut`、`cinnamonroll`、`swissroll`、`pretzel`、`creambun`、`tiramisu`、`boloyau`、`madeleine`、`blackforest`、`cheesehotdog`、`mango`、`papercake`、`chestnut`。
- 自己架的应用里，每个人收藏架上的顺序照旧按 `SHA-256(userId:key)` 各不相同，清单顺序不影响它。演示页里，每个人照旧从自己的位置开始走这条轮换。

## 3. 吉祥物：咬一口吐司

一片吐司，右上角被咬掉一小口，旁边掉三粒面包屑。没有脸。它也是面包店收藏里的一款（键 `toastbite`，Bitten Toast / 咬一口吐司），就像老婆饼在饼店里一样。

```js
toastbite: { palette: { X: '#6B3F17', C: '#CF8A34', I: '#FCE6B4', D: '#A8641F' }, rows: [
  '..XXXXX....C',
  '.XCCCCCX.C..',
  'XCCIIIIX...C',
  'XCIIIIIIXX..',
  'XCIIIIIIIIXX',
  'XCIIIIIIIICX',
  'XCIIIIIIIICX',
  '.XCIIIIIICX.',
  '.XCIIIIIICX.',
  '.XCIIIIIICX.',
  '.XDDDDDDDDX.',
  '.XXXXXXXXXX.',
] },
```

吉祥物出现的地方都跟着主题走：页头（没上传 logo 时）、开场动画、登录页和建团队页的品牌位置、点一下抖出的面包屑（颜色取吉祥物的外框色 `X`，应用和演示页都是）、浏览器标签小图标、手机主屏图标。

## 4. 建团队与设置

**卡片**：每套主题一张卡片，画这套主题清单里的前三款（第一款就是吉祥物），下面一行是这套主题的卡片文字（§6）。饼店画 `laopo`、`tart`、`mungbean`；面包店画 `toastbite`、`croissant`、`bolo`。

**建团队页**：「你的组织」那一组（`setup.orgGroup`）在「解锁台阶」后面加一项「收藏主题」，两张卡片，默认选饼店。选了哪张，页面顶上的吉祥物和「解锁台阶」那句说明就换成那套主题的。

**设置页**（只有所有者能进）：同样的两张卡片，放在「奖励」那部分（`settings.rewardsTitle`）解锁台阶后面。

- 点卡片只是选中，按「保存」才生效。选中但没保存时，「解锁台阶」那句说明跟着选中的卡片变（和现在奖励方式选了还没保存时一样）；页头的吉祥物保持已保存的主题，保存后页面按新主题刷新。
- **还没请过下午茶**：可以改。保存时，福利配的图里新主题没有的，在同一笔改动里去掉。去掉了至少一个，就用「主题换好了……」那句（§6）代替「设置已保存。」；一个都没去掉，照旧显示「设置已保存。」。
- 已经有福利定价、还没请过下午茶的团队，设置页显示 `settings.lockedByBenefits`（§6 改过的那句），主题卡片照常能选。
- **请过下午茶**：卡片变灰，显示 `settings.locked`（§6 改过的那句）。服务器也照样拒绝，返回现有的 `RULES_LOCKED`。
- 锁定条件和解锁台阶完全一样：账本里有任何一条记录，就锁。那时还没有人解锁过任何一件，所以换主题不会动到任何人的收藏。

## 5. 各页面的变化

面包店团队看到的：

- **成员页**：收藏架、「{name} 正在烤箱里」、福利配图，都是面包店的图和名字。
- **页头、开场动画、点一下吉祥物**：都是咬一口吐司。上传了 logo 的团队，页头照旧显示 logo。
- **登录页、建团队页**：品牌位置的吉祥物跟着主题（建团队页跟着当前选中的卡片）。
- **团队页**：给福利配图时，可选的是面包店那 24 款，按界面语言显示名字。
- **浏览器标签小图标、手机主屏图标**：咬一口吐司。已经开着的页面在登录后、建好团队后、设置里换了主题后，标签图标就换，不用刷新。已经放到手机主屏上的图标，要重新添加一次才会换（写进运维文档）。
- **不变的**：颜色、布局、动画的时长和次数、所有收藏规则。

饼店团队的收藏架、吉祥物、图标和 §6 跟着主题走的句子，都和 0.2 完全一样。所有团队都有的变化只有这几处：建团队页的主题选择；所有者设置页的主题卡片（请过下午茶后变灰）；改过的 `settings.locked`、`settings.lockedByBenefits`、`setup.rulesNote`（§6）。

## 6. 措辞

**跟着主题走的句子**：饼店用原来的句子，一个字不改；面包店各有一份：

| 出现在哪 | 饼店（原句） | 面包店 |
| --- | --- | --- |
| 请完下午茶后的提示 | 顺便烤出了 {count} 件新点心。<br>And that baked {count} new pastry(ies). | 顺便又烤好了 {count} 件。<br>And {count} more came out of the oven. |
| 收回下午茶时的说明（最后一句） | 已经出炉的点心不会收走。<br>Pastries already baked stay on the shelf. | 已经出炉的面包和蛋糕不会收走。<br>Bread and cakes already baked stay on the shelf. |
| 团队页「成员」的说明 | 看自己的下午茶和点心，自己花。<br>Sees their own treats and pastries, and spends. | 看自己的下午茶和面包蛋糕，自己花。<br>Sees their own treats and bakes, and spends. |
| 「解锁台阶」的说明（金额、积分两句） | …就多一件点心。<br>…a new pastry comes out of the oven. | …就多出炉一件。<br>…a new bake comes out of the oven. |

「{name} 正在烤箱里」「今天的下午茶出炉啦」「全部 {total} 件都到齐啦」两套主题共用。

**这些句子放在哪**：一套主题自己的版本放在两个语言文件里，键名是原键后面加 `.<主题 id>`：`setup.thresholdCredit.bakery`、`setup.thresholdPoints.bakery`、`grant.unlocked.bakery`、`revoke.explain.bakery`、`members.roleDetail.member.bakery`。饼店（`default`）没有这种键，用原键。`app/i18n.js` 里有一份「跟着主题走的原键」名单和一个查找函数：有这套主题的版本就用它，没有就用原键（不能直接用 `t()` 查一个可能不存在的键，查不到它会把键名本身显示出来）。建团队页用选中卡片的主题，其他页面用团队的主题。

**主题的名字和卡片文字**放在 `assets/sprites.js` 的主题清单里（§9），中英各一份，款数写成 `{count}`，由清单的长度算出来，不手写。

**新加的文字**：

| 出现在哪 | 键 | 中文 | English |
| --- | --- | --- | --- |
| 选择项标题 | `settings.theme` | 收藏主题 | Collection theme |
| 饼店卡片 | 主题清单 `default` | 饼店 · {count} 款点心 | Pastry shop · {count} pastries |
| 面包店卡片 | 主题清单 `bakery` | 面包店 · {count} 款面包和蛋糕 | Bakery · {count} breads and cakes |
| 保存时换了主题、去掉了配图 | `settings.themeChanged` | 主题换好了。有 {count} 个福利的配图新主题里没有，已经去掉，可以重新配。 | Theme changed. {count} benefit icon(s) aren’t in this theme, so they were removed. You can pick new ones. |

**改过的三句**（在原句里加上收藏主题）：

| 键 | 中文 | English |
| --- | --- | --- |
| `settings.locked` | 已有奖励记录，奖励方式、币种、解锁台阶和收藏主题已经固定，过去的数额保持原意。 | Rewards have been recorded, so the reward type, currency, unlock step and collection theme are fixed. Earlier amounts keep their meaning. |
| `setup.rulesNote` | 奖励方式和币种，在第一个福利定价或第一次请下午茶之前都能改；解锁台阶和收藏主题在第一次请下午茶之前能改。之后就定住了，免得以前的数额变了意思。 | Reward type and currency can change until the first benefit is priced or the first treat goes out; the unlock step and collection theme until the first treat. After that they’re set, so earlier amounts keep meaning the same thing. |
| `settings.lockedByBenefits` | 已有福利按这个单位定价，奖励方式和币种已经固定。解锁台阶和收藏主题在记下第一笔奖励之前仍可修改。 | Benefits already have prices in this unit, so the reward type and currency are fixed. The unlock step and collection theme can change until the first reward is recorded. |

锁定后改主题被服务器拒绝时，沿用现有的 `error.RULES_LOCKED`（「已有奖励记录，这些奖励规则已经固定。」），不另加句子。

## 7. 公开演示页

- **切换**：「Pastry shop | Bakery」两个按钮，放在「Take control」旁边，`.stage` 外面（点它不算「接管」，不会停掉自动播放）。点了以后放「拉闸换货」（§7.1），门后换好收藏架、吉祥物（页头、应用图标、开场动画、「咬一口」、浏览器标签小图标）、点心柜、三张说明卡的小图。正在自动播放的话，切完从头再播一遍，不再放开场动画。
- **默认与记忆**：第一次来是饼店。选过的主题存在访客自己的浏览器里，用单独的键（不放进 `crumb_demo_v1`），「Reset the demo」不会把它清掉；读写失败就当没记过。带着记住的主题打开页面时，直接画那套主题，不放动效。
- **吉祥物按钮的读屏名字**跟着主题：饼店保持「Mascot: wife cake」，面包店是「Mascot: bitten toast」。
- **面包屑**：点吉祥物和「咬一口」掉的面包屑，颜色取当前主题吉祥物的外框色。
- **数字跟着主题**，从清单算出来，不再手写：顶上统计的「Collectibles」和点心柜的「All {n}」是这套主题的总款数；图例第一行「In this demo’s rotation — {n}」是轮换的款数；第二行「Also collectible in the self-hosted app — {n}」只在有这种款时显示，柜子里照旧把它们标成虚线。饼店仍是 33 / 6，面包店只有一行 24。
- **面包店版的文字**（演示页是英文的）：

| 位置 | 饼店（原句） | 面包店 |
| --- | --- | --- |
| 自动播放第一句 | Sam is six months in. Six pastries on the shelf, $84.25 to spend. | Sam is six months in. Six bakes on the shelf, $84.25 to spend. |
| 自动播放最后一句 | Alex, two years in: nineteen pastries — and not one of them the same as Sam’s. | Alex, two years in: nineteen bakes, in an order nobody else has. |
| 花钱后的提示 | …the shelf keeps every pastry 🍞 | …the shelf keeps every bake 🍞 |
| 右边的步骤 | watch a pastry come out of the oven<br>different pastries, same rule | watch a bake come out of the oven<br>different bakes, same rule |
| 第一张说明卡 | …and your pastries stay.<br>$50 received = 1 pastry | …and your bakes stay.<br>$50 received = 1 bake |
| 第二张说明卡 | “Egg Tart is in the oven” | “Croissant is in the oven” |
| 点心柜标题 | The pastry cabinet | The bakery case |

  三张说明卡的小图，面包店用：`toastbite`、`croissant`、`bolo`；`cupcake`；`donut`、`pretzel`、`mango`、`bagel`。
- **不动的**：页面顶上的简介、来历那段（第三张说明卡的正文）、分享链接的预览图（`assets/og.png`）和它的文字、README 截图里的主题，都保持饼店。

### 7.1 切换动效：拉闸换货

参考：[Motion 的 Shutter](https://motion.dev/docs/curtains)（盖住、换、揭开）、[OPEN/CLOSED 挂牌翻面](https://codepen.io/aimieisanxious/pen/vzwrbM)。

1. **0–300 ms**：一扇木色卷闸门从手机顶上分 8 档落下，盖满手机屏幕。门上是横条纹（每 12px 一道深色缝），中间偏上挂一块奶油色牌子，用现有的像素字写着当前的店名：`PASTRY SHOP` 或 `BAKERY`。
2. **300–550 ms**：牌子横着压扁成一条线（3 档），在最窄那一下换成新店名，再展开（3 档）。同时在门后换好收藏架、吉祥物和「正在烤箱里」那行；点心柜和说明卡在手机外面，直接换。
3. **550–650 ms**：牌子左右晃两下。
4. **650–950 ms**：卷闸门分 8 档收上去。
5. **之后**：架子上的点心依次弹一下（现有的 `slotPop`），表示新货上架。

- 全程约 1.1 秒。翻牌只用横向压扁，不用 3D 旋转，像素不会糊。
- 门和牌子是叠在手机里的一层，和现有开场动画同一种做法；不用任何库，从电脑上直接打开页面也能用。
- **减少动效**（`prefers-reduced-motion`）：不拉闸，直接换。
- 只用在公开演示页。应用里的设置页保存后直接按新主题刷新，不放动效。

## 8. 数据与接口

- **迁移 `003-theme.sql`**：`organization` 加一列 `theme TEXT NOT NULL DEFAULT 'default'`，只查形状（2 到 32 个字符）。主题有哪些由主题清单文件决定，不写进约束，以后加主题不用重建表。已有数据库升级后是 `default`。
- **主题清单文件**：`themes/default.json`、`themes/bakery.json`，都由 `scripts/theme-manifest.mjs` 从 `assets/sprites.js` 生成，不手改。每份有 `themeId`、`version`、`source`、`mascot`、`keys`、`names`（每个键的 `en`、`zh-Hant`、`zh-CN`）。新的小模块 `server/themes.mjs` 读进全部清单，服务器、数据库检查和恢复都从它取。
- **不认识的主题**：
  - 打开数据库时（`server/db.mjs` 的 `openDatabase`，跑完迁移、和「数据库来自更新的版本」同一个地方），团队记的主题不在已有的清单里，就拒绝，错误代码 `THEME_UNKNOWN`：「This database uses the collection theme "{id}", which this version of Crumb does not include. Run a newer Crumb, or restore a backup made by this version.」还没建团队的数据库照常打开。服务器、`npm run demo`、`recover-owner` 都走这里，所以都会拒绝；服务器启动时打印「Crumb cannot start: …」。
  - 恢复备份时（`server/backup.mjs` 的 `restoreDatabase`），在查版本之后、写任何文件之前做同样的检查。只有 schema 3 以上、已经建了团队的备份才查；schema 1、2 的备份和建团队前的备份算 `default`，照常恢复。
  - `THEME_UNKNOWN` 和 `SCHEMA_TOO_NEW` 一样只在服务器端出现，加进 `tests/i18n.test.mjs` 的豁免名单，不加界面文字。
- **服务器按团队的主题工作**：解锁顺序和上限、`/api/me` 里的 `theme`（`id`、`size`、`complete`、`next`）和收藏的名字、`GET /api/admin/rewards` 带的 `theme`（`keys`、`names`），都用这个团队的主题，不再用写死的 `default`。
- **福利配图的检查**分两步：格式检查照旧在读请求时做（不填＝不变，`null` 或 `''`＝不配图，否则是 2 到 32 个字符）；「是不是这个团队主题里的键」放进写入的事务里查。新加福利带请求键时，这一步放在幂等操作里面，和现有的单位检查（`assertSameMode`）在一起：第一次已经成功、回应丢了的重发，即使中间换过主题，也拿到原来那份回应；被拒的不留记录。编辑福利时，在同一个写事务里查。
- **建团队**：`POST /api/setup` 的 `org` 多一个可选的 `theme`（不填是 `default`，不认识的主题按现有的字段校验报错）。操作日志的 `org.setup` 记下 `theme`。
- **改设置**：`PATCH /api/org` 多一个可选的 `theme`。有账本记录时改它返回 `RULES_LOCKED`。回应照旧是登录后的团队信息，多一个顶层整数 `iconsRemoved`：这次请求把多少条福利（上架和下架的都算）的 `icon_key` 设成了 `null`；没换主题或配图都是共有的，就是 0。这个字段只在这个回应里，不进团队信息本身。去掉配图和改主题在同一个事务里。换了主题时，操作日志 `org.update` 的内容是 `{ changed: [..., 'theme'], theme: { from, to }, iconsRemoved }`；没换主题时照旧只有 `{ changed }`。
- **会话里的团队信息**：登录后多 `theme` 和 `locks.theme`；没登录时（登录页）也带 `theme`。页面自己拼没登录的团队信息的地方（`app/main.js` 退出登录成功、但接着问「现在谁在」没回应时）也带上 `theme`。页面上凡是从团队的 `theme` 找吉祥物的地方，没有或不认识的 id 一律画饼店的吉祥物，不报错。
- **图标**：
  - 饼店用现在的文件：`app/favicon.svg`（仍是手画的那张，脚本不会改它）和 `app/icons/icon-{180,192,512}.png`。其他主题放在 `app/icons/<id>/favicon.svg` 和 `app/icons/<id>/icon-{180,192,512}.png`，由 `scripts/make-icons.mjs` 从这套主题的吉祥物生成。
  - `/favicon.svg`、`/icons/icon-180.png`、`/icons/icon-192.png`、`/icons/icon-512.png`（网页清单里的图标也是这几个地址）由服务器按团队的主题给；还没建团队时给饼店的。
  - 页面拿到会话后、建好团队后、设置里换了主题后，把 `<link rel="icon">` 和 `<link rel="apple-touch-icon">` 指到这套主题自己的地址，标签图标不用刷新就换。
  - GitHub Pages 上没有服务器，给的是饼店的。这里说的是 `app/` 的图标；演示页的标签图标见 §7。

## 9. 图和文件

- **`assets/sprites.js`**：
  - 新加 12 张图（11 款新图和吉祥物）。
  - `NAMES` 里每个键多一个简体名字 `cn`（原来放在 `scripts/theme-manifest.mjs` 的 `SIMPLIFIED` 里，搬过来，让一套主题的东西都在这一个文件里）。
  - 新加 `THEMES`：每套主题是 `{ mascot, rotation, limited, version, label, card }`。`rotation` 是演示页的轮换；`limited` 是只在应用里能攒到的款（饼店是现在的 `LIMITED`，面包店是空的）；一套主题的全部键（清单文件的 `keys`）是 `rotation` 接着 `limited`。饼店：`rotation` 就是现在的 `CYCLE`（33，同一个数组），`limited` 是 `LIMITED`（6），所以 `default.json` 的键不变，版本仍是 1。面包店：`rotation` 是 §2 的 24 款，版本 1。`label` 和 `card` 是中英两份的名字和卡片文字（§6）。
  - `CYCLE`、`LIMITED` 保留，是饼店的，现有用法（分享预览图脚本等）不受影响。
  - `forSlot(seed, index, themeId = 'default')` 取 `THEMES[themeId].rotation[(index + sum) % rotation.length]`，不给主题时和 0.2 一模一样。
- **规则检查**（`node scripts/theme-manifest.mjs --check`，CI 已经在跑）：每张图至少属于一套主题；一套主题里没有重复的键，`rotation` 和 `limited` 不重叠；吉祥物在自己的 `rotation` 里；每个键有英文、繁体、简体名字；每套主题的 `label` 和 `card` 中英都有，`card` 里有 `{count}` 而没有写死的数字；`version` 是正整数；生成的清单文件和提交的一致，没有多出来的旧清单文件。原来「每张图必须在 `CYCLE` 或 `LIMITED` 里」那条检查换成这些按主题的检查。这个脚本自己不再存任何主题的数据。
- **`scripts/make-icons.mjs`**：一次生成每套主题的图标（饼店照旧只生成三张 PNG）。`package.json` 加 `npm run themes`，依次跑清单生成和图标生成。
- **键按主题永远不删**：`tests/collections.test.mjs` 的已发布键名单改成按主题分：`{ default: [现在的 39 个], bakery: [24 个，含共有的 12 个和 toastbite] }`。对每套主题，测试检查：提交的清单文件和重新生成的一致；清单里的键正好是这套主题的已发布名单（新键要在同一次改动里登记）；每套主题都有名单；服务器读进来的和提交的文件一致。一个键属于两套主题时两边都登记；从其中一套拿掉就失败，另一套还有也不行——那套主题的成员手里有它，`/api/me` 只在团队自己的清单里找它的名字和上限。
- **应用里的吉祥物**不再写死 `laopo`，一律从主题取。

## 10. 别人加一套自己的主题

`docs/THEMES.md` 改写成三部分：现有两套主题、画法（§2 那段）、加一套主题的步骤：

1. **在 `assets/sprites.js` 里画图、写清单**：照画法画好每一款，在 `NAMES` 写英文、繁体、简体名字，在 `THEMES` 加一套：吉祥物、轮换顺序（可选只在应用里的款）、中英名字、中英卡片文字（款数写 `{count}`）、版本 1。
2. **跑 `npm run themes`**：生成清单文件和图标。
3. **登记新键**：在 `tests/collections.test.mjs` 的已发布键名单里加这套主题的一项（共有的键也要写），跑 `npm test`。漏了第 2 步或吉祥物改了没重跑，测试会失败。
4. **（可选）换说法**：§6 那几句想换成自己的说法，在两个语言文件里加 `<原键>.<主题 id>`；不加就用饼店的。

## 11. 本轮不做

- 咖啡店主题（下一轮：同一套做法，新画咖啡和它自己的句子；到时再定吉祥物用哪个）。
- 每套主题各自的配色。咖啡店打算用暗色系，和饼店、面包店的暖色区分开，下一轮连同配色按主题切换一起做（咖啡的图要按深色背景来画）。为此，本轮新写的界面代码一律用 `app/app.css` 和 `assets/style.css` 里现有的颜色变量，不再写死颜色。
- README 开头和演示页分享文案里还带 recognition 的那两句。
- 奶茶店、植物主题。
- README 截图、分享预览图换成面包店的样子。
- 应用设置页换主题的动效。

## 12. 测试与验收

单元测试（`node --test`）：

- **迁移**：0.2 的数据库升级后 `theme` 是 `default`，原有数据不变。
- **不认识的主题**：`openDatabase` 拒绝 `theme` 不在清单里的数据库（`THEME_UNKNOWN`），照常打开还没建团队的新数据库；`recover-owner` 同样拒绝；`restoreDatabase` 拒绝这样的 schema 3 备份、不留任何文件，schema 1、2 的备份和建团队前的备份照常恢复。
- **建团队**：不填主题是饼店；填 `bakery` 是面包店；填不存在的主题被拒绝；`org.setup` 记下主题。
- **改主题**：所有者在请下午茶之前能改，管理员不能改；请过之后返回 `RULES_LOCKED`；改了以后不在新主题里的配图去掉、共有的留下，`iconsRemoved` 和操作日志（`changed` 含 `theme`、`theme.from/to`、`iconsRemoved`）对；不带 `theme` 的改动照旧返回团队信息、`iconsRemoved` 是 0、操作日志照旧只有 `changed`。
- **福利配图与重发**：用只在饼店有的图加一条福利（请求键 K），换成面包店后这条的图变成空；同样内容带 K 重发，拿到原来的回应，福利仍只有一条；新加一条只在饼店有的图被拒（422），不留幂等记录。
- **收藏**：面包店团队按面包店的 24 个键解锁，上限 24，顺序按哈希；饼店团队不变。
- **接口**：`/api/me`、`/api/admin/rewards`、会话（登录前后）都带对的主题；福利配图只接受本团队主题的键。
- **图标**：面包店团队拿到面包店的图标，饼店团队拿到原来的；还没建团队时给饼店的；每套非饼店主题的四个文件都在，PNG 解出来的像素和用现在的吉祥物画出来的一致（比像素不比字节）。
- **主题清单**：每份都和 `sprites.js` 一致；按主题检查已发布键（见 §9）；每个键有三种名字；`card` 有 `{count}` 没有数字；`forSlot` 不给主题或给 `default` 时和 0.2 的 `CYCLE[(index + sum) % 33]` 一样。
- **文案**：中英键和占位符一致；`<原键>.<主题 id>` 这种键必须有原键、占位符和原键一样；面包店的句子都有用到；新加的界面文字不含 recognition / 认可。

浏览器测试（Playwright）：

- 选面包店建团队：成员页、页头、开场动画、登录页都是面包店的；页面的标签图标链接指向面包店的图标。
- 面包店团队退出登录、之后问「现在谁在」没回应：登录页仍是面包店的吉祥物。
- 设置页：请下午茶之前能换；换了去掉配图时显示去掉的个数，没去掉时显示「设置已保存。」；有福利、没请过下午茶时显示改过的 `lockedByBenefits`，卡片能选；请过之后变灰。
- 公开演示页：饼店的架子和图例（33 / 6）和 0.2 一样；切到面包店后收藏架、吉祥物、读屏名字、点心柜、数字都变，三张说明卡都有图，控制台没有错误；刷新后记得；「Reset the demo」不清掉选的主题；自动播放从头开始；`prefers-reduced-motion` 下没有卷闸、直接换。
- 无障碍检查（现有）在建团队页、设置页的主题选择上也过（390px 与 1440px）。

验收：

1. **12 款新图**（新画 11 款＋咬一口吐司；吐司照 §3 的格子画）分两批给维护者看，吐司和山形吐司放在同一批，每款都给开场动画和页头两种大小，点头才算定稿。
2. 全新克隆下跑单元测试、浏览器测试和运维演练，结果写进 `docs/VALIDATION.md`，没跑的写明「未验证」。
3. 面包店的成员页、设置页、演示页截图和拉闸动效给维护者看。
4. 版本 0.3.0。推送、开 PR、合并都等维护者开口。

## 13. 文档

- **`docs/THEMES.md`**：按 §10 改写；「键永远不删」改成按主题；删掉「福利还在、只是不显示图标」那句旧说法（换主题时配图会被去掉，见 §4）；列出由 `sprites.js` 生成的东西时加上手机主屏图标。
- **`README.md`、`README.zh-CN.md`**：
  - 版本内容加「收藏主题」，升级说明指向 `OPERATIONS.md` 的「从 0.2 升级到 0.3」（保留 0.1 到 0.2 的链接）。
  - 「换成你自己的」一节加主题；「想换一套点心？只要改一个文件」换成照 `docs/THEMES.md` 加主题的说法。
  - 「现状与限制」里「只有一套收藏主题（点心）」换成两套主题可选、每个团队一套。
  - 写 39 的地方改成两套主题各自的款数（39 和 24）。
  - 这些新句子随文档改动一起给维护者过目。
  - 截图在版本号是 0.3.0 之后用 `scripts/screenshots.mjs` 重拍（仍是饼店），页脚显示「Crumb 0.3.0」；`RELEASE-CHECKLIST.md` 的「0.3.0」一行照 0.2.0 那样用眼睛核对页脚。
- **`docs/OPERATIONS.md`**：
  - 开头列的升级加上 0.2 到 0.3。
  - 新的「从 0.2 升级到 0.3」一节，照 0.1 到 0.2 那节写：schema 2 变 schema 3，升级后备份显示 `schema 3`；迁移 003 加 `organization.theme`，已有团队是饼店；跑过之后 0.2 不认这个数据库，要回去只能恢复升级前的备份（指向「回退」）。
  - 0.1 可以直接升到 0.3：002 和 003 在同一个事务里跑，失败时的提示写的是 schema 3。
  - 「不认识的主题」：原文照录 `THEME_UNKNOWN` 的提示和解决办法；恢复和回退那里加一句：用了这一版没有的主题的数据库或备份，和更新版本的 schema 一样会被拒绝。
  - 锁定前怎么换主题；已经放到手机主屏上的图标要重新添加才会换；升级上来、已经请过下午茶的团队，设置页的主题卡片是灰的、停在饼店。
  - 「改错的记录」和「一次请几个人」里的「点心」改成「收藏」。
- **`docs/DEPLOYMENT.md`**：「开始之前」加「选一套收藏主题，第一次请下午茶后定住」；建团队那一步列出的选项加上主题；「建好之后」里福利配图改成「这套主题里的一款」，设置列出收藏主题（第一次请下午茶之前能改）；「升级」加 0.2 到 0.3 并指向新的运维一节；安全说明里的「点心数」改成「收藏数」。
- **`scripts/restore.mjs`** 开头的说明：会拒绝用了这一版没有的主题的备份。
- **`CONTRIBUTING.md`**：改了吉祥物或加了主题要跑 `npm run themes`。
- **`docs/VALIDATION.md`、`docs/RELEASE-CHECKLIST.md`** 按本轮更新。

## 14. 假设（按批准稿实施）

1. 主题 id：饼店沿用 `default`（已发布的键和清单文件都叫它），面包店是 `bakery`。
2. `npm run demo` 的示例团队仍是饼店；加 `--theme bakery` 可以起一个面包店的示例团队，方便看效果和截图。
3. 饼店清单文件多了 `mascot` 字段，键没变，版本号仍是 1；面包店版本号从 1 开始。
4. 新图照 §2 的画法画，不另定配色表。
