# 开发备忘：内容管线与渲染细节

给要改这个仓库的人看的一页：数据是怎么从原始资料变成 `public/data/guide.json` 的、
页面又是怎么把这些块渲染出来的，以及测试与提交相关的东西。改解析脚本或改正文样式之前先读这一页。

## 内容来源

- 《明星志愿3攻略.docx》（本地原始文档，不入库）：经纪人事件簿 / 艺人事件簿 / 六大特殊通告 / 其他事件四类的主体正文。「路欧桑剧情整理」原本是「其他事件」的最后一条，现在单独提成一个类目（`extract_guide.py` 建树时把这一项从 `other_items` 里 `pop` 出来插到第三位），正文仍来自 `sources/luousang-*.txt` 那五份分支文件。**类目 id 与五个分支 id 一直是 `other-events/luousang*`，提升时没有改名**，老书签、CG 落点、追踪器的分支线都靠它。
- `sources/game-initial-questions.txt`：开局访谈 14 题的完整选项与友好度变化，**以这份 txt 为唯一来源**，原文（GBK）转 UTF-8 后原样使用，不做改写。首行 `★标题` 只是页面标题（与页面同名时不重复渲染）；首个问题之前的说明行合并成一条黄底提示条；`问题结束（补充说明）` 的括号文字作为该选项的脚注（`hint`），选项本身仍显示「问题结束」终止标记。
- `sources/initial-events.txt`：初始事件（新手事件 1–5 / 女艺人的疑惑 / 女艺人的请求），**以该 txt 为唯一来源**，docx 里的同名章节不再参与渲染，原文（GBK）转 UTF-8 后原样使用。解析规则：首行 `★新手事件：` 是页面标题，跳过；`#`、`*` 开头与**以冒号结尾的独行标题**（`初始女艺人的事件（指…）：`）都解析为 `section`；章节内不含标点的短行（`女艺人的疑惑`）解析为 `heading` 子标题；编号行（`1 （自动）`、`3－1 （跟随）`）解析为 `event` 并保留编号与触发方式标签，`提醒：` 行渲染为提示条，「旗下艺人为…」缩进为选项样式。txt 里已经没有 `#初始剧情` 这个标签，所以第一个 `event` 之前若还没有任何 `section`，脚本会自动补一个「初始剧情」小节，让开局 5 条事件不再裸挂在页面下。正文里混用的 `--` 与半角逗号会统一成 `——` 与 `，`。
- `sources/character-stats.txt`：18 位可签约艺人（含资料片新增）的初始属性，**以游戏内「初始属性(女)」「初始属性(男)」两张截图为准**。源文件保持截图的行列形状：一段以角色名开头，随后是属性行与紧跟其后的 `成长` 行；女、男两段合并成**一张表**（`table` 块）而不分性别——一人一行、一项一列，每个格子上面是初始值、下面一行小字是成长加成。姓名列在窄屏横向滑动时保持固定；每列最高的数值套浅粉胶囊，成长加成的最高值用金色，**并列第一不标**。
- 文档里确实没有收录的条目（物品总览、贺总相关事件等）保留在树中并标注「待补充」，重跑脚本不会丢位置。

## 甜蜜乐章（sweet 站）

甜蜜乐章是与原站平级的第二个站点（`sweet.html`），共用同一套组件与设计令牌，但**数据、目录顺序、进度键全部另起一套**——改这边的正文永远不会碰到原站的 `public/data/guide.json`。

- 源文本都在 `sources/sweet/`，原始资料是本地 GBK 繁体 TXT，导入时转成 UTF-8 简体（`zhconv` 转码，全角数字与连接号统一成 ASCII，全角字母归 ASCII），入了 `sources/` 之后这些就是唯一来源，**不再回读本地原文件**。转换统一走 `python scripts/convert_sweet_source.py 关于天晴.txt:tian-qing.txt`（也接受 `约会/城仲瑄.txt:cheng-zhongxuan-date.txt` 这种子目录），转码规则与原文错字补正都写在脚本的 `FIXES` 里。
- `python scripts/extract_sweet_guide.py` → `public/data/sweet/guide.json`：目录结构（类目 / 每节标题 / 顺序 / 可选副标题）写在脚本的 `CATEGORIES` 里，正文按节名读 `sources/sweet/<slug>.txt`；没有对应 txt 的节点保留 `status: "missing"`，页面给「这一页还没整理」的占位提示。新增一节 = 加一条 `CATEGORIES` 条目 + 放一份 txt + 在 `PARSERS` 里登记解析函数。
- 事件页解析规则（主线、公司改建共用 `parse_event_page`）：首行是正文页副标题（与页面标题重复时不再重复显示）；不带编号的行是章节；`数字.标题` 是带编号的章节（`4.改建` → 标题取「改建」）；`数字-数字．标题` 是事件（编号进 pill、标题进卡头，句尾的 `．．` 统一成 `…`）；细节行按前缀决定类型——`时间：` / `概要：` / `条件：` 是普通段落，`提示：` 与 `（…` 是金色备注，**缩进可有可无**（公司改建的源文本就是顶格写的）。主线文末不带编号但含冒号的行视为作者注解，连同续行收进「结局分歧」一节；公司改建没有这段，解析时不开启该规则，避免误吞正文。
- 角色页解析规则（8 位共用 `parse_character`）：靠 `可创作作品：` / `事件：` / 三个「…条件：」小节切换四区，区外的编号行（`1.公司自制作品10个以上`）不当事件；事件标题尾括号只有在内容是 `友好度上升` / `好感度上升` / `CG` 时才拆成标记（CG → 玫红卡 + 金色徽标，其余 → 灰色 tag），`出去走走吧～（2）` 这种序号留在标题里；`*` 开头的作品是特殊作品（金色菱形），自带 `1、` 序号的作品行不再叠圆点。角色头像按 `<slug>-logo.*` 放 `public/images/sweet/`，探测到才写进节点的 `avatar`，目录与角色卡在人名左侧渲染圆圈头像（约定与主站 `images/characters/` 一致）。
- 约会选项（`<slug>-date.txt`，8 位角色都有）：`parse_date` 出「页首四行邀约门槛 + 两组对话」，`_merge_date` 把门槛接在基础信息后面、对话追加到页尾；地点是小标题，每个提问一个 `qa` 块（编号 pill + 问题 + 多行「答」），外壳与事件卡同一套。小节名后面带不带冒号各页不一致，入库时统一去掉；`提示：…` 走金色便签。
- 支线页解析规则（6 页共用 `parse_side`）：`#章节` 与「`1.变身`」（下一行是 `1-1.` 才认章）是小节；`1-1.xxx` 与 `（1）xxx` 是步骤卡；`条件：` / `附注：` / `附：` 自成小节，`公司结局：` / `感情结局：` 是圆点条目；`※` 与 `提示：` 是卡内备注，续行留在同一步里。
- 表格页解析规则（国外通告）：首行是副标题，之后每三行一组「城市 / 公司（类型）/ 接拍条件」，校验总行数是 3 的倍数、公司行必须带全角括号，错位直接报错而不是生成半截表；产出一个 `kind: "table"` 块，前端复用通用的 `DataTable`。
- 目录按用户裁决：第一类叫「**经纪人事件簿**」（10 节，**不含「角色介绍」**），角色攻略 8 位（感情线与约会选项合并成同一个角色页），支线攻略 6 条（标题直接用角色名，不写「关于 X」），合计 24 节，**已全部有正文**。
- `scripts/test_sweet_guide.py`（26 项）：锁住「提交的 guide.json 与脚本重算完全一致」+ 各节章数与事件数（主线 4 章 23 事件、角色页 8 位、约会问答 8 页、支线 6 页）+ 事件都带时间与概要 + 表格内容 + 目录结构与「副标题只能来自原文首行」+ `cgIds` / `anchor` 与 `sources/sweet/cg-links.tsv` 完全对齐，防手改 JSON 导致的静默回退。
- **攻略 ⇄ CG 映射**：`sources/sweet/cg-links.tsv`（4 列：`cgId / nodeId / event|text / key`）由核对表 xlsx 经 `scripts/build_sweet_cg_links.py` 生成，`extract_sweet_guide.py` 的 `_apply_cg_links()` 把 `cgIds` 与 `anchor="ev<块下标>"` 写到命中的块上，事件类顺带补 `cg: True`（这样支线里没在标题标 CG 的步骤也渲染成 CG 卡）。`event` 按事件号精确匹配、`text` 按正文片段匹配；对不上直接报错，不会静默断链。
- 界面回归 `scripts/cdp_sweet_entry.mjs`：站点身份（标题 / `data-game="sweet"` / 粉色令牌）、目录 10-8-6、主线 23 张事件卡 + 5 条本页小节、公司改建 9 张、国外通告表格 5 行 3 列、角色页（事件卡 / 双标记 / 约会问答卡 / 白底与描边）、支线六页、CG 徽标点进图鉴、跨站胶囊，以及原站五个页签未受影响。

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
- **列表按页渲染**：默认每页 24 条（可选 12 / 24 / 48 / 96），分页器在 `NoticePager.tsx`，只挂当前页的卡片。分页器只留上一页/下一页两个箭头，首页与末页靠页码序列本身（`pageSlots` 始终把 1 和末页排在两端），远距离跳转用「跳至 N 页」。列表列数用 `repeat(auto-fill,minmax(min(340px,100%),1fr))` 跟着容器宽度走，不绑视口断点——1120 起右栏出现会把列表压窄，自动退回一列；900 这种「没有右栏但也不宽」的尺寸反倒排得下两列。卡片简介整段展开、不截断，同页卡片的最小高度由 `NoticesApp` 量完这页最高的一张再统一设上——量的是内层 `[data-notice-card-inner]`，量之前先把上一轮写上去的 `minHeight` 同步摘掉再还原，否则量到的是撑过之后的高度、翻到简介更短的页也缩不回去。同一个征求对象出现两次（特殊要求不同）就并排两个 chip，不折成 `×2`。
- **卡片的信息位固定**：右上角五颗星（`StarBadge`，点亮几颗就是几星，区间难度把「一定满足」的星打成实心金、可能区间打成半透明）、名称、类型/时间/公司三格元信息、角色行。剧种细分（连续剧 / 单元剧 / 短片）与广告篇名收成类型格标签行里的一枚小徽章，不再占第三行——否则这一格会比旁边两格高一行，三格对不齐。徽章用 `--color-series*`（中性石板蓝），原来的 tag-scene 青绿和「电视剧」分类 pill 撞色。
- **元信息配色（时间 + 公司）**：`infoStyle.ts` 把时间四档映射到 `text-year-1/2/3/x`（同族深色文字，L21–30，卡面上 ≥4.5:1），公司映射到 11 枚 `bg-dot-*` 索引点（统一 S42/L36–44 的一族 muted 色，色相按行业分组：电视冷蓝、音乐紫粉、电影红、广告金棕、经纪绿/灰紫）。分工原则是「大块颜色给有顺序性的时间、点缀给公司」——色相允许与既有令牌相邻，但 hex 一律不重复；时间色与最近旧令牌的 RGB 距离、点色两两距离都在落地前用脚本核过。没登记的公司/时间回落墨色与灰点。角色 chip 里有默认艺人的直接把艺人名写出来（粉底实线），没人接的只有角色与星数（灰底虚线），不再写「待定」字样，也不再有 `待定 N` 汇总行；星数在 chip 里写作 `4★`（五颗星留给卡片右上角与详情标题）。
- **能力对照是便签墙**：`ReferenceView.tsx` 把五块内容排成 `grid`，窄表（难度换算、特殊要求影响）并排占一行，宽表（类型能力要求、艺人成长率）`col-span-2`；每块顶部一条 3px 色带 + 标题同色圆点当作索引，不再是「一列铺到底、每块只占左半边」。右侧 176px 的「本页小结」是滚动定位器：点条目把对应便签滚到容器顶部（`scrollTo` + 减去 8px 留白），滚动时按「顶部已越过容器上沿且最贴近上沿的那块」反高亮——并排两块会同时越线，所以不能简单取最后一块。小于 1120 收藏起 rail，单列便签照常。
- **七种特殊要求各有一个色相**：`specialStyle.ts` 把搞笑（琥珀）、反串（墨绿）、暴力（砖红，`--color-alert*`）、反派（暗玫）、裸露（紫）、丑化（暖灰）、吻戏（品牌粉）分开，每个标签带同色圆点和描边；没登记的标签回落到中性灰，不会因为新增标签而消失。`cdp_notices.mjs` 断言七行样式的 class 两两不同，防止以后被合并成同一个灰 chip。

## 六大通告条件表

这是**第三条独立管线**，和通告库、攻略正文都不共用解析脚本。它服务 `#/specials` 条件看板，刻意不自动从攻略正文抽条件（条件散在提醒句、括号、区间、否定和时间窗里，抽不准且改一句就崩）：

- `sources/special-notices.tsv`：人工维护的唯一内容来源，101 行 × 13 列（BOM + LF），六个通告各一列拆成行。**条件行 73 条**（计入达标数）、**只读备注行 28 条**（时间线与「注」，零状态、不计数、只跳事件追踪器）。`verify` 列保留 10 条裁决的依据；只要还有 `?` 开头的疑点，运行时数据就拒绝生成。改这张表时按字节补，别手抄整份（弯引号会被改成直引号）。
- `scripts/build_specials_review.py`：校验表结构、把 `节点id#事件号` 逐条对到 `guide.json` 的事件块、生成 `outputs/specials-review.html` 审阅页（不入库）。10 条裁决记录在 `DECISIONS` 常量里，改表时可回查。
- `scripts/extract_specials.py` → `public/data/specials.json`（约 56KB，进入「六大通告」tab 才 fetch）。生成时**复用审阅页那份节点与深链校验**，把 `notices/angel#3` 直接算成 `#/guide/notices/angel~ev19`；`tracker:` 开头的行落成 `#/tracker`。守护测试在 `scripts/test_extract_specials.py`（7 项），其中两条是硬拦：表里塞未裁决疑点、或事件号写成不存在的 `#9999`，都必须直接失败。
- 每行字段：`id / notice / slot / phase / kind / type / scope / name / target / hint / link / source / verify`。`slot` 是槽位骨架（`main` / `group` / `role:男主` 等），`scope` 只写「这条该读谁的数值」这条**规则**——`global` 公司共享、`artist` 按艺人、`group` 按团体、`role` 按角色位、`notice` 仅本通告。**表里绝不写艺人名**，具体是谁由前端「指派艺人」在运行时产生。
- 前端状态在 `src/lib/specialsState.ts`（纯判定）与 `src/hooks/useSpecials.ts`（`guide.specials.v1` 存档）。旗下 4 人**读 `guide.progress.v1`**，这里不复制名单。共享不是维护一张映射表，而是由状态键决定：同名的公司计数 / 资金共用一个键，证书按「艺人 + 证书」共用，同一个艺人挂两张卡时两处读同一份属性数字，一处改动多卡同步。属性 10 格（人气 0–5 单列）、课程等级 5 档与证书门槛都从 `tipsData.ts` 的 `TRAINING_ROWS` / `CERT_ROWS` 派生，不另造一份游戏数值。**数值录入集中在 `StatsPanel.tsx`**（`data-stats-panel`）：一张表填 10 项属性 × 旗下艺人，外加团体名气 / 人气（`state.values` 的 `gval:` 键），条件行只读它算缺口，不在每行重复输入；`stat` / `resource` 行仍保留逐行 ▸ 可选 peek，但只是冗余视图。
- 课程清单**按需**：只列该艺人挂的、且已启用的通告所需证书对应的几门课（音乐 4 / 戏剧 3 / 舞蹈 3），没挂通告的人一行都不出现；等级不从属性自动派生，属性够只代表够格升级。
- 名额：命名角色位（昆仑）1 人、银河团体 2–4 人、落入凡间的天使 / 万年之恋（`soloMain`，由 `extract_specials.py` 的 `SOLO_MAIN` 写入）只能 1 人，其余候选池最多 4 人。选满后下拉消失并显示「已满 N 人」；单人通告例外——下拉变成「换人」，选中即替换。
- **默认全启用**：全新存档（没有 `guide.specials.v1`）时 `emptyState(defaultEnabled)` / `readState(defaultEnabled)` 从运行时 notices 派生默认列表（排除 `_global`），六张卡一进来就全勾，不想做的自己取消。已有存档**保留用户自己的勾选**（`sanitiseState` 不改写 enabled），只有「清空本看板」会回到默认全启用。截图脚本传 `fresh` 可去掉 specials 存档复现真实默认态。
- **多平台存档**：六大通告复用事件追踪器「全部存档」的统一导出/导入（`saveArchive.ts` 的 `specials` 段），与 CG 收集对称。导出时若本机从未碰过看板则省略该段（不覆盖别人的默认全勾）；导入时 `mergeSpecialsState` 对数值与计数取较大值、其余（启用 / 指派 / 已勾 / 团体锁定）并集合并，`applySpecialsToLocal` 写回后派发 `SPECIALS_CHANGED_EVENT`，看板监听后重读，和 CG 的 `CG_CHANGED_EVENT` 同一套路。**入口三处都有**：事件追踪器右侧栏、CG 图鉴顶栏、六大通告页顶栏，渲染的是同一个 `SaveArchivePanel`（`SpecialsApp` 的 `data-specials-archive` 按钮 + `data-specials-archive-modal` 弹窗，Esc 可关）。
- 一个条件行摊到多位艺人时（末日战士的证书 / 属性行、昆仑的三位角色）**每人一行**，不再把所有人的控件塞进同一行。
- 条件行外框统一 1px 浅边框 + 圆角，完成的靠淡绿底和绿色控件区分；**不要用 2px 左侧状态条**（用户觉得那条竖杠很怪）。
- 「提前准备」的道具 / 前置计数行把数据表里的 `hint` 直接常驻成一行淡灰纯文字备注（`data-item-source`，零状态、不可点、不加装饰符号）；证书行不铺备注，课程等级与属性缺口仍走 ▸ 展开。备注内容全部来自 `special-notices.tsv`，**不需要另造字段**。
- 回归 `scripts/cdp_specials_board.mjs`（94 项）覆盖指派名额、单人换人、多人拆行、清单勾选、共享、按需课程、数值录入面板、昆仑三位、银河锁定、道具来源备注、备注零状态、存档持久化，以及右侧跳转导航（rail 存在、六入口齐全、点末张/首张滚到贴顶并高亮）；`scripts/cdp_specials_shot.mjs` 用来截看板界面；`scripts/cdp_save_archive.mjs`（11 项）覆盖六大通告并入统一存档的导入、合并与覆盖，以及六大通告页「全部存档」按钮 + 弹窗的存在与开关。

## 体量统计口径

页面上显示的是**字数**，不再是段落数：「约 X 字」取正文非空白字符数（含标点），`table` 块的单元格也算在内，分类页按「自身 + 全部子条目」累计；叶子条目只显示字数，没有子条目时不再显示「0 个子条目」。超过 1 万字折算成「1.2 万」，由 `src/lib/guide.ts` 的 `countChars` / `countCharsDeep` / `formatCount` 统一处理。

## 内容块渲染

`ContentBlockList` 把内容块按 `group` 聚合，一个 group 就是一段不可拆的整体：

- group 首块是 `event`（编号事件）时，整组渲染成**一张卡片**：编号徽章 + 正文在第一行，其下的选项、补充说明、`提醒：` 提示条都与正文左对齐缩进在卡内，不会出现「选项落在卡片外面」的割裂感。事件行原本写在编号后的 `（自动）`、`（场景）`、`（跟随）`、`（手动）` 会被解析成 `tag` 字段，渲染成彩色标签（墨灰 / 莓红 / 金 / 紫），一眼能看出触发方式。四色各自偏一个色相、刻意避开主色玫瑰，`自动` 与 `场景` 才不会糊成一片；对应令牌是 `--color-auto*` / `--color-scene*` / `--color-gold*` / `--color-violet*`。
- 选项（`A.先接电话——…`、`C 关古威…`、`b.自制唱片5张…`）统一由 `OptionLine` 渲染：`A`/`B`/`C` 提成白底小方块徽章（统一大写），整行再往右缩进一级、铺一层中性灰底（`--color-choice*`），与事件正文区分开；没有字母的补充行（`旗下艺人为…`）只留一条灰色竖线。docx 里字母后有点号也有空格，解析器（`OPTION_RE`）两种都认，前端正则同样放宽，因此同一份清单不会一半带徽章一半是纯文本。
- group 首块是带 `id` 的 `heading` 且有选项时，渲染成 `QuestionCard`（开局问题用的选项卡，带跳转 chip）。
- `table` 块交给 `DataTable`：表头用 sidebar 底色，数值列右对齐并用 `tabular-nums` 对齐位数，奇偶行交替换色；`highlight` 列为真的列会把该列最高值套上 `bg-brand-soft` 胶囊，列上有 `growthKey` 时该格会多渲染一行「＋成长值」（最高值转金色）。最高值只在该列唯一时才标，和游戏内表格「多於一人時不會標示」一致。
- 其余情况逐块渲染：`section`（`#`/`*` 大标题）、`heading`、段落、提示条各自成段。

## 攻略 ⇄ CG 映射

两张手写表是唯一事实来源，改映射只改这两张，再重跑对应脚本：

| 表 | 用途 | 格式 |
| --- | --- | --- |
| `sources/cg-links.tsv` | 一对一：事件 → 它出的那张（或那几张）CG | `节点id <TAB> 事件号 <TAB> cgId[,cgId] <TAB> 章节?` |
| `sources/cg-node-links.tsv` | 多对一：多张 CG 共用一个事件，或只能整页落点 | `cgId <TAB> 节点id <TAB> 备注 <TAB> 事件号? <TAB> 章节?` |

- **章节列必须写「最内层」heading**，`☆d2` 子标题（「拒绝」「在巴黎」「同志传闻」）也算一层。同一编号在一页里出现两次时不写章节会报 `ambiguous event`，写错报 `no such event … @ 章节`，整条映射让生成直接失败，不会静默断链。
- `extract_guide.py` 的 `apply_cg_links()` 给命中事件的块补 `cgIds` 与 `anchor="ev<块下标>"`；事件卡的 DOM id 用 `head.anchor ?? ev<index>` 兜底，所以任何事件都能被 `#/guide/<nodeId>~ev<n>` 深链，哪怕它没有 CG。
- `extract_cg.py` 的 `apply_node_links()` 处理多对一：有事件号就现算 `ev<块下标>`（美丽之星写真集 18 张都锚 #14），没有就只写整页落点。两份结果分别落在 `guide.json` 的块上和 `cg.json` 的 `item.guide`。
- 前端 `CgApp.linkFor()` 先认事件级（`cgIds` 反查），再认页面级；多个候选落点时**优先 `other-events/luousang/` 前缀**——三人恋情事件在各自艺人页只做浏览，跳转与收集统一走剧情整理。`src/lib/cgOrigin.ts` 另外记住「从哪条事件点进图鉴的」（sessionStorage，不进存档），同一张图有多处出处时按原路返回。
- 允许的重复：同一张 CG 出现在同节点的两个事件（苏嫚君 CG05 圣诞布置，育幼院 #40 与达成结局 #55 各一次），以及 `other-events/luousang/` 五个分支页之间（同一段剧情写了五遍）。跨节点重复会被 `test_cg_links.py` 拦下，除非登记进 `DUPLICATED_ACROSS_NODES`。
- 事件池里被挡掉的重复章节由 `src/lib/tracker.ts` 的 `POOL_SKIP` 按「节点 id + 章节名」配置（路风 / 桑禾蓓的整个「事件」节、欧怡青的「路欧恋」章）；**被挡的线仍递增序号**，其余线的 id 不位移，老存档才不会失联。

### 双站点事件追踪器

- `src/lib/trackerConfig.ts` 是两站追踪器**唯一**的差异来源：`MAIN_TRACKER_CONFIG` / `SWEET_TRACKER_CONFIG` 各自持有进度 / 备忘 / 备份的 localStorage 键、签约上限、艺人节点前缀、分组 chips 与文案、存档信封 format。所有 lib 函数默认取主站配置，共享组件从 `useTracker().config` 读取；甜站只在 `SweetApp` 把配置传给 `TrackerProvider`，**原站行为零变化**（共享组件里不写 `if (site === ...)`）。
- 甜蜜乐章：旗下最多 **4 位**（主角 + 还能再签 3 位艺人），`protagonist` 即主角 **杜云芊**（红发双马尾），恒占一位。头像 `public/images/sweet/protagonist-logo.png` 来自 `E:/Pictures/mxzy3/甜蜜乐章/2/620-1.bmp`，**不是卫亚那张**；回归会逐字节比对，防止再复制错图。她没有攻略节点，作为固定项插进选择器，`normaliseArtists()` 在读存档 / 重置 / 导入三条路径都保证归位；被主角挤掉的艺人转为「已解约」而不是消失，进度线照常保留。点击主角按钮、解约角标都不生效。
- 选择器展开区**只保留一行操作说明**：不写 `protagonist.hint` 就不渲染主角说明框，`setupIntro` 也不要再加「既当经纪人也是艺人」之类的括注；`cdp_sweet_tracker.mjs` 会断言这两段文案都不出现。
- **事件详情常驻**：甜站 event 块只放标题，「时间 / 概要 / 提示」是紧随其后、同一 `group` 的 `paragraph` / `note` 块（明星志愿3 的 `event.text` 本身就是整段正文）。`stepDetails: true` 让 `extractLines()` 把这些行收进 `TaskStep.details`，`TaskLineCard` **直接常驻渲染在步骤标题下方**，不折叠、不存展开状态——追踪器是逐条对照打勾用的，详情本来就该一眼看到；搜索也会命中详情文本。
  - 详情区 `data-step-details` 用 `flex-wrap` 分三层：`data-step-detail-role` ＝ `time`（`时间：` 开头，`border-line-strong` / `bg-surface-soft` / `text-ink-muted` 的**极淡中性描边胶囊**）/ `body`（`概要：` 与无前缀正文，深色小字）/ `tip`（note 或 `提示：` 开头，独占一行、左侧 2px 金色细线 + 小字）。**时间标签刻意压到最淡、不用任何彩色填充**：上方编号 pill 是实心 `bg-brand-soft` 粉底，两个粉块挨着容易被误认成同类；试过冷调蓝灰（`tag-news`）用户嫌抢眼，最终改成近乎白的底 + 一圈淡边 + 灰字，靠「实心 / 空心」区分而不是靠色相。`cdp_sweet_tracker.mjs` 会读 computed style 比对 `data-step-label` 与时间标签底色，防止改回撞色或重新上彩色。原文一字不改，只按前缀分样式；提示**不再用整块黄底**（122 步带提示，全平铺后一屏多个黄块会太花）。没有详情的 148 步不渲染详情区，步骤行靠 `min-h-[44px]` 保底不显得参差。
  - 头部工具按钮因此只剩「置顶 / 放弃 / 移出池子」三个；**线级「展开全部 / 收起全部」、单步 `data-step-expand` 箭头、整份 `expandedSteps` 状态全部删除**，卡片本身仍可点标题折叠整条线。
  - 主站不开开关、没有 `details` → 详情区 / 层次属性都不渲染，行为零变化；`cdp_tracker_content.mjs` 有防呆断言。
- **经纪人事件簿白名单**：`poolNodeAllowlist: { 'sweet-guide': [...] }` 只放行 `main-story` 主线攻略、`company` 公司改建攻略、`outfits` 服装获得方法和剧情三页（及其后代）；`extractLines()` 对配了白名单的类目跳过其它节点，没配的类目全收。「自制通告一览」等资料页也用 `event` 块排版（每个通告一条），原先被拆成 24 条人名重复的怪线，现在不进池；其它资料页本来就没有 event。攻略目录 / 正文一个字没动，只是追踪器不再把它们当待办。经纪人组从 35 条线降到 11 条（主线 4 + 改建 1 + 服装 6），池总数 83 → 59。
- 甜站的 `poolSkip` / `branchPrefix` 为空（没有路欧桑分支），`config.groups` 给出三组 chips（经纪人事件簿 / 角色攻略 / 支线攻略）。存档走和原站同一套统一信封，只是标记换成 `sweet-save`、文件名前缀「甜蜜乐章」：`saveFormat` / `cgStorageKey` / `hasSpecials` 三个字段（`hasSpecials: false` 让导出省略六大通告段、摘要与提示也不提）决定甜站装什么，`archiveFormat` 只留作「旧版 `sweet-tracker-save` 仍认」的兼容标记。`SaveArchivePanel` 因此没有 `if (site === ...)`，两站共用。
- 回归 `scripts/cdp_sweet_archive.mjs`（16 项）覆盖 CG 图鉴顶栏「全部存档」入口、弹窗里同一个面板、面板文案只说「进度与 CG 收藏」、导出信封为 `sweet-save`（含 tracker + cg、不含 specials、文件名「甜蜜乐章-存档-….json」）、导入只含 CG 的存档取并集写 `sweet.cg.v1` 且不碰 `guide.cg.v1`、主站 `mxzy3-save` 被拒、旧版 `sweet-tracker-save` 仍能读并标明「不含 CG 收集」、Esc 关弹窗。
- 回归 `scripts/cdp_sweet_tracker.mjs`（43 项）覆盖两个页签与 `#/tracker`、主角姓名与头像（不与任何角色头像重复）、主角锁死与 4 人上限、详情常驻且折叠控件已彻底移除、时间 / 概要 / 提示三层样式、时间标签与编号 pill 不同底色且保持极淡中性（三通道差 ≤12、亮度 ≥240）、头部只剩三个按钮、卡片仍可折叠、三组 chips、事件池前缀与经纪人三页白名单（无自制通告线）、勾选只写 `sweet.progress.v1`、`guide.progress.v1` 不受影响、存档面板文案。脚本开头会清空甜站的进度 / 备忘键，可反复运行。

### 甜蜜乐章 CG 图鉴

- **配置驱动**：`src/lib/cgConfig.ts` 是两站 CG 图鉴唯一的差异来源（`MAIN_CG_CONFIG` / `SWEET_CG_CONFIG`）。`CgApp` / `CgCard` / `CgLightbox` 共用主站那套组件，只从 `config` 读差异；`readCg` / `writeCg` 与 `useCgData` 都加了省略即主站的可选参数。甜站只在 `SweetApp` 传配置，**组件里不写 `if (site === ...)`，主站默认配置下 DOM 与行为零变化**。
- 甜站差异：收集进度存 `sweet.cg.v1`（不碰 `guide.cg.v1`）、清单读 `data/sweet/cg.json`、`archive: true`（顶栏「全部存档」和原站同一个面板，装甜站自己的进度 + CG）、`showName` / `guideLinks` 为 `true`（名称与「攻略 ›」都启用）、`showCondition: false`（没有获得条件文案）、`allowReorder: false`。
- **编号每人一套**：item 的 `code` 是展示用的 `CG 01`…`CG NN`（组内连续），`id` 是稳定的 `<slug>-<自然序号>`（调顺序不搬家、图片路径也不动）；`order` 是组内展示序，1 起连续。`meta.itemCount` 统计**唯一可收集数**，不是条目数。
- **共用一张 CG 去重**：按图片字节的 MD5 判重，同图跨人物只建一个 `collectionId`（`shared-<md5前8>`），图片落到 `_shared/<md5前8>.webp`，两条线的 item 共用同一个 `collectionId`；前端 `collectionKey(item) = item.collectionId ?? item.id`，收集一次两边都亮，主站没有该字段时回落 `id`，行为零变化。当前只有丹尼斯 / 史蒂芬的 `561-1` 命中。
- **顺序写死在数据里**：`public/data/sweet/sweet-cg-order.json`（应用内「导出顺序」下载的文件）是顺序的唯一真源，`extract_sweet_cg.py` 的 `apply_order_override()` 按它重排每组再重算 `order` / `code`，所以重跑管线不会把人工微调冲回自然序；文件缺失时退回自然序。
- **数据管线**：源图放 `E:/Pictures/mxzy3/甜蜜乐章/cg/<人物>/<原编号>.<ext>`（本地素材，不入库；目录不存在时退化到仓库内被忽略的 `outputs/sweet-cg/`），`scripts/extract_sweet_cg.py` 生成 `public/images/sweet-cg/<slug>/<原编号>.webp` 与 `public/data/sweet/cg.json`。编号按自然排序（`1, 2, 10` 不会变成 `1, 10, 2`），同一编号两种扩展名、分组文件夹名不认识都会直接报错；`--skip-images` 只重写 JSON（图片字节没变时用，避开全量重建）。
  - 分组从 `public/data/sweet/guide.json` 的 `sweet-characters` 带 `avatar` 的子节点派生（顺序、姓名、圆圈头像跟攻略一致），主角杜云芊是固定的第一组 `protagonist`（`images/sweet/protagonist-logo.png`）。**头像易错**：主角用 `620-1.bmp`、丹尼斯用 `695-1.bmp`，两张别对调（丹尼斯曾误用沈惟真那张）。支线五位定义在 `EXTRA_GROUPS`，`ENABLE_EXTRA_GROUPS` 翻成 `True` 才加组。当前 9 组 / 84 条 / 83 张唯一。
- **攻略 ⇄ CG 双向**：`sources/sweet/cg-links.tsv` 是唯一事实来源（由核对表 xlsx 经 `scripts/build_sweet_cg_links.py` 生成），**必须先跑 `extract_sweet_guide.py`**（给事件块补 `cgIds` 与 `anchor="ev<块下标>"`），**再跑 `extract_sweet_cg.py`**（反查事件标题写 `item.name` 与 `item.guide`）。当前 41 条映射、41 张有名称。攻略页 CG 徽标跳 `#/cg/<cgId>`，图鉴「攻略 ›」跳 `#/guide/<nodeId>~ev<n>`。
- **排序 UI 默认隐藏**：`allowReorder: false` 时「调整顺序」按钮、卡片 ↑/↓、拖拽全部不渲染，但 `CgApp` 里的整套实现（`draftOrder` / `savedOrder` / `sweet.cg.order.v1` / 拖拽落点从 `dataTransfer` 取 id / 导出 `sweet-cg-order.json`）一行没删；以后要改顺序把开关翻回 `true` 即可，不必重写。
- `scripts/test_sweet_cg.py`（10 项）锁住「提交的 cg.json 与脚本重算结果一致」、分组来自攻略、`CG NN` 编号与组内连续、共用图只出现一次、每组 `id` 序列与 `sweet-cg-order.json` 一致、图片路径与已生成 webp 一一对应、自然排序与两类报错。测试不依赖 Pillow。
- 入口：`SweetApp` 第三个页签「CG 图鉴」→ `#/cg`，分组写 `#/cg/group/<id>`（复用主站的 `cgTabHash` / `rememberCgGroup`），刷新仍停在同一人物。
- 回归 `scripts/cdp_sweet_cg.mjs`（43 项）：第一段用仓库真实数据验三个页签、9 组头像（主角不是卫亚那张）、顶栏「共 83 张 · 9 个分组」、真实映射的 CG 名称与「攻略 ›」往返（`#/guide/...~ev23` 落到同一条事件）、共用图在 DOM 里只渲染一份且两处共用、分类胶囊在追踪 / CG 页不出现、原站 `guide.cg.v1` 一字未动、排序 UI 已隐藏；第二段用 `Page.addScriptToEvaluateOnNewDocument` 覆盖 `fetch` 注入 4 张假 CG 验卡片编号、共用图收集一次两边亮、勾选只写 `sweet.cg.v1`。**脚本必须开 `about:blank` 再导航**，否则同 URL 的 fragment 跳转不会重跑注入脚本；两段开头都清 `sweet.cg.v1` 与 `sweet.cg.order.v1`，否则上轮残留会串味。

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
- 只改顺序不改数据：页头的五个分类 tab、搜索命中的排列、「上一条 / 下一条」都按新顺序走。URL 里仍是稳定的节点 id，重排不会让链接失效。
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
| `npm run test:guide` | Python 回归测试：攻略解析（30 项）+ 通告数据（13 项）+ 攻略 ⇄ CG 映射（9 项）+ 六大通告（7 项）+ 甜蜜乐章攻略（26 项）+ 甜蜜乐章 CG（10 项），共 **95 项** |
| `npm run test:sweet` | 只跑甜蜜乐章两套回归（攻略 26 + CG 10，共 36 项） |
| `python scripts/extract_notices.py` | 重生成通告数据（需 `pip install openpyxl xlrd`） |
| `python scripts/extract_cg.py` | 重生成 CG 图鉴与图片（需 Pillow，素材放在 `outputs/`） |
| `python scripts/extract_sweet_guide.py` | 重生成甜蜜乐章的 `public/data/sweet/guide.json` |
| `python scripts/extract_sweet_cg.py` | 全量重建甜蜜乐章 CG 清单与 webp（需 Pillow；源图在 `E:/Pictures/.../甜蜜乐章/cg/<人物>/`，缺省退化到 `outputs/sweet-cg/`；`--skip-images` 只重写 JSON） |
| `python scripts/build_sweet_cg_links.py` | 从核对表 xlsx 生成 `sources/sweet/cg-links.tsv`（甜站 攻略 ⇄ CG 映射） |

**测试范围**：只改甜蜜乐章的内容或组件时，跑 `npm run test:sweet` + `node scripts/cdp_sweet_entry.mjs` 就够了，不必跑全量 `test:guide` 和其它站点的 `cdp_*.mjs`。只有动到共享层（`global.css` 令牌、`patterns.ts`、`src/ui/*`、路由、`useGuideData`、`treeOrder`）时，才需要补跑原站回归。

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
public/data/specials.json    生成的六大通告条件表（进入六大通告 tab 才加载）
public/data/cg.json          生成的 CG 图鉴数据（含 CG → 攻略落点）
public/data/sweet/guide.json 甜蜜乐章的结构化攻略数据（另一条管线）
public/data/sweet/cg.json    甜蜜乐章的 CG 清单（编号 + 事件名 + 攻略落点，按人物分组）
public/data/sweet/sweet-cg-order.json 甜蜜乐章人物内的 CG 顺序（管线输入，重跑不冲掉）
public/images/cg/*.webp      压缩后的 CG 图片（进仓库）
public/images/sweet-cg/*/*.webp 甜蜜乐章 CG 图片（按人物分目录，进仓库）
outputs/sweet-cg/            甜蜜乐章 CG 源图的仓库内副本（可选，按人物 / 原编号命名，不入库）
sources/*.txt                补充攻略的纯文本来源（UTF-8，可重跑）
sources/sweet/*.txt          甜蜜乐章的正文来源（UTF-8 简体，按节名对应节点）
sources/notices/*.xls|xlsx   通告原始表格（重生成数据的输入）
sources/special-notices.tsv  六大通告条件表（手写，BOM + LF）
sources/cg-links.tsv         事件 → CG 的一对一映射（手写）
sources/cg-node-links.tsv    CG → 事件 / 页面的多对一映射（手写）
sources/sweet/cg-links.tsv   甜蜜乐章 攻略事件 → CG 的映射（由核对表 xlsx 生成）
scripts/extract_guide.py     docx + sources → guide.json（零第三方依赖）
scripts/extract_sweet_guide.py  甜蜜乐章目录 + 正文 → sweet/guide.json
scripts/extract_notices.py   表格 → notices.json（需 openpyxl / xlrd）
scripts/extract_specials.py  六大通告条件表 → specials.json
scripts/extract_cg.py        CG 素材 → cg.json + webp（需 Pillow）
scripts/extract_sweet_cg.py  甜蜜乐章源图 → sweet/cg.json + webp（需 Pillow）
scripts/build_sweet_cg_links.py  甜站核对表 xlsx → sources/sweet/cg-links.tsv
scripts/test_extract.py      攻略解析回归测试
scripts/test_sweet_guide.py  甜蜜乐章数据回归测试
scripts/test_sweet_cg.py     甜蜜乐章 CG 清单回归测试
scripts/test_notices.py      通告数据回归测试
scripts/test_cg_links.py     事件 → CG 映射回归测试
scripts/test_cg_node_links.py  CG → 事件 / 页面映射回归测试
scripts/cdp_*.mjs            浏览器端到端验证脚本
src/sweet/                   甜蜜乐章站点入口（sweet.html 挂载：攻略 / 事件追踪 / CG 图鉴）
src/ui/                      两站共用的顶栏与页签
src/components/              攻略阅读页组件
src/components/notices/      通告库（筛选、详情、能力对照）
src/components/tracker/      事件追踪器
src/components/cg/           CG 图鉴
src/hooks/                   数据加载、选中态、进度存储、锚点跳转
src/lib/                     纯逻辑：内容解析、统计、排序、筛选、存档、CG 反向索引
```

## 提交约定

小步提交，每个可独立验证的功能点提交一次；提交信息用英文 `type: description`。
