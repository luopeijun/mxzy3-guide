# 开发备忘：内容管线与渲染细节

给要改这个仓库的人看的一页：数据是怎么从原始资料变成 `public/data/guide.json` 的、
页面又是怎么把这些块渲染出来的，以及测试与提交相关的东西。改解析脚本或改正文样式之前先读这一页。

## 内容来源

- 《明星志愿3攻略.docx》（本地原始文档，不入库）：四大分级的主体正文。
- `sources/game-initial-questions.txt`：开局访谈 14 题的完整选项与友好度变化，**以这份 txt 为唯一来源**，原文（GBK）转 UTF-8 后原样使用，不做改写。首行 `★标题` 只是页面标题（与页面同名时不重复渲染）；首个问题之前的说明行合并成一条黄底提示条；`问题结束（补充说明）` 的括号文字作为该选项的脚注（`hint`），选项本身仍显示「问题结束」终止标记。
- `sources/initial-events.txt`：初始事件（新手事件 1–5 / 女艺人的疑惑 / 女艺人的请求），**以该 txt 为唯一来源**，docx 里的同名章节不再参与渲染，原文（GBK）转 UTF-8 后原样使用。解析规则：首行 `★新手事件：` 是页面标题，跳过；`#`、`*` 开头与**以冒号结尾的独行标题**（`初始女艺人的事件（指…）：`）都解析为 `section`；章节内不含标点的短行（`女艺人的疑惑`）解析为 `heading` 子标题；编号行（`1 （自动）`、`3－1 （跟随）`）解析为 `event` 并保留编号与触发方式标签，`提醒：` 行渲染为提示条，「旗下艺人为…」缩进为选项样式。txt 里已经没有 `#初始剧情` 这个标签，所以第一个 `event` 之前若还没有任何 `section`，脚本会自动补一个「初始剧情」小节，让开局 5 条事件不再裸挂在页面下。正文里混用的 `--` 与半角逗号会统一成 `——` 与 `，`。
- `sources/character-stats.txt`：18 位可签约艺人（含资料片新增）的初始属性，**以游戏内「初始属性(女)」「初始属性(男)」两张截图为准**。源文件保持截图的行列形状：一段以角色名开头，随后是属性行与紧跟其后的 `成长` 行；女、男两段合并成**一张表**（`table` 块）而不分性别——一人一行、一项一列，每个格子上面是初始值、下面一行小字是成长加成。姓名列在窄屏横向滑动时保持固定；每列最高的数值套浅粉胶囊，成长加成的最高值用金色，**并列第一不标**。
- 文档里确实没有收录的条目（物品总览、贺总相关事件等）保留在树中并标注「待补充」，重跑脚本不会丢位置。

## 通告数据

通告库是**另一条独立管线**，和攻略正文互不影响：

- `sources/notices/notices.xls`：通告主表 + 角色表 + 三张参照表。11 个 sheet，其中 `电影/电视剧/广告` 表头在第 0 行、`唱片/主持` 因上方多一行「特殊要求」分组，表头在第 1 行、数据从第 2 行开始，脚本里按 sheet 分别写死起始行（`SHEETS[*].first`）。
- `sources/notices/requirements.xlsx`：只取其中的 `特殊要求影响` 表（搞笑 +2 亲和 / -2 叛逆 这类），其余 sheet 是「等级字母 × 星数 → 数值区间」的原始写法，和 `notices.xls` 里的 `说明` 表重复，因此不再解析。
- `python scripts/extract_notices.py` → `public/data/notices.json`（约 900KB，运行时 fetch，进入「通告」tab 才加载）。这条管线需要 `pip install openpyxl xlrd`，只有重生成数据时才要，跑站点不需要。
- 归一后的结构：`notices[]` 每条含 `cat / name / type / time / company / producer / brief`，外加 `roles[]`；唱片与主持没有角色表，用通告行本身合成唯一角色（`征求对象` 即角色名），电影/电视剧/广告的角色按 `通告编号` 回填。
- 复合特殊要求（`暴力反派`、`反串搞笑丑化`）在脚本里拆成 `specialKinds[]`，前端再按 `specialEffects` 查每天的三项增减。没给数值的（目前只有 `吻戏`）只显示要求本身，不加「无影响」之类的填充文案。
- **「能力影响」和「特殊要求影响」都是按天结算**：拍摄期间每天各结算一次，拍多少天就结算多少次，所以页面统一用「每天影响」表述，不做总量换算（表里没有天数）。角色表里的 `gains` 优先，缺失时回落到 `grades` 按类型给的数值。**数值口径**：`notices.xls` 的能力影响是十位数量级（36 / 48），游戏内每天实际结算的是它的 1/10（3.6 / 4.8），与 `requirements.xlsx` 的「能力影响（每天）」列逐格相符（203 格全是精确 ÷10）。所以 `extract_notices.py` 用 `daily()` 统一乘以 `GAIN_SCALE = 0.1` 再落盘，JSON 里存的就是游戏内数值；`叛逆 / 性感 / 亲和` 三列是接演门槛，不参与换算。改口径只需动这一个常量。
- `说明` 表除难度对照外还有几段散文（独家代理限制、S/L 刷属性、数据来源），脚本按「整行只有一个非空单元格且够长」筛成 `notes[]`，在「能力对照」页末尾照录；`取消隐藏即可重新显示` 那句是对着 Excel 说的，直接跳过。
- **能力要求不在数据里展开**：`grades`（类型 × 对象 → A/B/C/D）与 `scale`（星级 × 字母 → 区间）分开存，前端用 `requirementsFor()` 现算，换算法不用重生成 JSON。区间的正确性由 `scripts/test_notices.py` 兜底——它把 1100 多个「类型/对象/能力/星级」组合与原 xlsx 逐一比对，必须完全一致。

## 体量统计口径

页面上显示的是**字数**，不再是段落数：「约 X 字」取正文非空白字符数（含标点），`table` 块的单元格也算在内，分类页按「自身 + 全部子条目」累计；叶子条目只显示字数，没有子条目时不再显示「0 个子条目」。超过 1 万字折算成「1.2 万」，由 `src/lib/guide.ts` 的 `countChars` / `countCharsDeep` / `formatCount` 统一处理。

## 内容块渲染

`ContentBlockList` 把内容块按 `group` 聚合，一个 group 就是一段不可拆的整体：

- group 首块是 `event`（编号事件）时，整组渲染成**一张卡片**：编号徽章 + 正文在第一行，其下的选项、补充说明、`提醒：` 提示条都与正文左对齐缩进在卡内，不会出现「选项落在卡片外面」的割裂感。事件行原本写在编号后的 `（自动）`、`（场景）`、`（跟随）`、`（手动）` 会被解析成 `tag` 字段，渲染成彩色标签（墨灰 / 莓红 / 金 / 紫），一眼能看出触发方式。四色各自偏一个色相、刻意避开主色玫瑰，`自动` 与 `场景` 才不会糊成一片；对应令牌是 `--color-auto*` / `--color-scene*` / `--color-gold*` / `--color-violet*`。
- 选项（`A.先接电话——…`、`C 关古威…`、`b.自制唱片5张…`）统一由 `OptionLine` 渲染：`A`/`B`/`C` 提成白底小方块徽章（统一大写），整行再往右缩进一级、铺一层中性灰底（`--color-choice*`），与事件正文区分开；没有字母的补充行（`旗下艺人为…`）只留一条灰色竖线。docx 里字母后有点号也有空格，解析器（`OPTION_RE`）两种都认，前端正则同样放宽，因此同一份清单不会一半带徽章一半是纯文本。
- group 首块是带 `id` 的 `heading` 且有选项时，渲染成 `QuestionCard`（开局问题用的选项卡，带跳转 chip）。
- `table` 块交给 `DataTable`：表头用 sidebar 底色，数值列右对齐并用 `tabular-nums` 对齐位数，奇偶行交替换色；`highlight` 列为真的列会把该列最高值套上 `bg-brand-soft` 胶囊，列上有 `growthKey` 时该格会多渲染一行「＋成长值」（最高值转金色）。最高值只在该列唯一时才标，和游戏内表格「多於一人時不會標示」一致。
- 其余情况逐块渲染：`section`（`#`/`*` 大标题）、`heading`、段落、提示条各自成段。

## 锚点跳转

攻略正文里带 `id` 的标题块可以在页内跳转，`target` 指向目标块的 `id`：

- 「游戏初始问题」每题是一个 `heading` 块（`id: q1`…`q14`），每个选项记录 `target`（下一题）、`targetLabel`（显示为「接问题３」或终止的「问题结束」）、可选的 `reward` 与 `hint`。
- 点击跳转链接会平滑滚动到目标、加一圈高亮闪动，并把地址写成 `#/game-guide/initial-questions~q3`（用 `replaceState`，不会触发 `hashchange` 重置选中项）。
- 刷新或分享该地址会直接落回对应题目：`useHashSelection` 只取 `~` 之前的部分作为节点 id，`useAnchorJump` 负责滚到锚点。
- 「本页小节」在宽屏常驻正文右侧一列（`PageRail`），窄屏仍保留正文顶部的折叠卡片；两者都是**布局里的一列 / 一张卡，不是浮层**，因此永远不会盖住正文。右侧栏列出本页全部 `section` / `heading`，点击与「接问题Ｎ」一样平滑滚动 + 高亮闪动，当前读到的小节用玫瑰底色高亮（`useActiveOutline` 用 `IntersectionObserver` 取窗口上半区最靠前的小节）。`section` 编号为 `1.`，`heading` 子标题按父级编号成 `2.1.` 并向右缩进一格、左侧带一条细竖线，层级一眼可分（`outlineOf` 里的 `depth` 字段来自数据）；编号规则由 `numberOutline` 统一生成，侧栏与顶部卡片共用。

## 本页导航与回到顶部

- 右侧栏顶部可以折叠：点右上角箭头收成一条 36px 的竖排「本页小节」标签，点标签再展开。折叠状态存在 `localStorage`（`guide.rail.v1`），刷新后保持；**折叠时列宽不变**，正文不会左右跳动。
- 侧栏只在正文列够宽时出现：`AppShell` 用 `ResizeObserver` 量 `<main>` 的实际宽度（侧栏抽屉占掉 302px，量视口不准），小于 960px 就收回侧栏、改用正文顶部的折叠卡片，正文列不会被挤到没法读。
- 「回到顶部」：侧栏底部是一个 `^` 按钮（折叠时在标签下方，正方形图标按钮），点击把 `<main>` 平滑滚回顶部——页面只有一个滚动容器，滚的是 `<main>` 而不是 `window`。
- 窄屏没有侧栏时，右下角在读过 320px 后浮出圆形 `^` 按钮；正文右侧为此预留了 24px 空档，按钮落在空隙里，不压在文字或卡片上。

## 目录排序

侧栏目录可以按自己的习惯重排，但**只在同一层级内**移动：把「初始事件」拖到「游戏初始问题」上方，它就成了该类目的第一条；把「艺人事件簿」拖到「经纪人事件簿」上方，整个艺人事件簿连同它下面所有条目一起上移。类目里的条目不能被拖进另一个类目，跨层级一律不接收（悬停时不会出现插入线）。

- 拖拽落点是目标行的上半 / 下半，分别表示「插入到它之前 / 之后」，落点处显示一条玫瑰色插入线，被拖的行变淡。
- 顺序存在 `localStorage`（`guide.tree-order.v1`），只记录**真正动过的层级**（父级 id → 子 id 列表）。重新生成 `guide.json` 时，未动过的层级不受影响；列表里已不存在的 id 会被忽略，新增条目回落到该层级末尾。
- 只改顺序不改数据：页头的四个分类 tab、搜索命中的排列、「上一条 / 下一条」都按新顺序走。URL 里仍是稳定的节点 id，重排不会让链接失效。
- 侧栏标题右侧出现「恢复默认」时表示顺序已被改过，点一下即回到脚本生成的顺序（同时清掉本地记录）。
- 键盘可用 `Alt+↑` / `Alt+↓` 把焦点所在的条目上移 / 下移一位。触摸屏不支持 HTML5 拖拽，此时每行右侧显示 `↑` `↓` 两个按钮（`touch:` 变体，`pointer: coarse`）。

## 样式约定

- 颜色、字号、圆角、阴影只在 `src/styles/global.css` 的 `@theme` 中定义，组件统一使用 `text-ink`、`bg-brand-soft`、`rounded-ui-md` 这类语义类，不写裸色值。
- 响应式断点沿用原设计的向下阈值，用 `@custom-variant` 定义：`tab:`（≤980px）、`nav:`（≤860px，侧栏切换为抽屉）、`phone:`（≤520px）、`touch:`（`pointer: coarse`，触摸屏上的替代操作）。前三个是 **max-width** 变体，不是 Tailwind 默认的移动优先断点。
- 卡片、栅格、版心等重复组合放在 `src/styles/patterns.ts` 的 `ui` 对象里；组件特有的类名就近写在 JSX 中，条件类用 `cn()` 拼接并尽量互斥，避免同属性类互相覆盖。

## 命令与验证

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run build` | 类型检查 + 生产构建到 `dist/` |
| `npm run preview` | 预览构建产物 |
| `npm run typecheck` | 只跑 `tsc` |
| `npm run test:guide` | Python 回归测试：攻略解析（29 项）+ 通告数据（13 项） |
| `python scripts/extract_notices.py` | 重生成通告数据（需 `pip install openpyxl xlrd`） |

**解析回归**：解析脚本里积累了大量角色专属分支，改一个共享正则可能悄悄改坏别的角色页，所以 `test_extract.py` 会重跑真实管线，并断言产物与已提交的 `guide.json` **逐字节一致**。改完解析规则先重生成再测：

```bash
python scripts/extract_guide.py
npm run test:guide
```

**通告数据回归**：`test_notices.py` 只依赖标准库，检查编号唯一、每条都有角色、等级/星级表完整，装了 openpyxl 时还会把推导出来的区间与原始 xlsx 逐格比对（1100+ 组合）：

```bash
python scripts/extract_notices.py
python -m unittest scripts.test_notices -v
```

**界面回归**：`scripts/cdp_*.mjs` 通过 Chrome DevTools Protocol 跑真实交互（拖拽、筛选取舍、存档下载与导入、窄屏布局等）。先起开发服务器，再用桌面尺寸开一个调试实例：

```bash
# 终端 1
npm run dev

# 终端 2（--window-size 不能省，默认 800×600 会被脚本判成窄屏）
chrome --remote-debugging-port=9339 --user-data-dir=/tmp/cdp-profile \
       --headless=new --window-size=1440,900 about:blank

node scripts/cdp_tracker_memo.mjs
```

## 目录结构

```
public/data/guide.json       生成的结构化攻略数据（运行时加载）
public/data/notices.json     生成的通告数据（进入通告 tab 才加载）
sources/*.txt                补充攻略的纯文本来源（UTF-8，可重跑）
sources/notices/*.xls|xlsx   通告原始表格（重生成数据的输入）
scripts/extract_guide.py     docx + sources → guide.json（零第三方依赖）
scripts/extract_notices.py   表格 → notices.json（需 openpyxl / xlrd）
scripts/test_extract.py      攻略解析回归测试
scripts/test_notices.py      通告数据回归测试
scripts/cdp_*.mjs            浏览器端到端验证脚本
src/components/              攻略阅读页组件
src/components/notices/      通告库（筛选、详情、能力对照）
src/components/tracker/      事件追踪器
src/hooks/                   数据加载、选中态、进度存储、锚点跳转
src/lib/                     纯逻辑：内容解析、统计、排序、筛选、存档
```

## 提交约定

小步提交，每个可独立验证的功能点提交一次；提交信息用英文 `type: description`。
