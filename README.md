# 明星志愿3 攻略助手

把《明星志愿3攻略.docx》变成可分级浏览的网页，并最终支持游戏过程中的进度追踪。

## 技术选型

| 层面 | 选择 | 理由 |
| --- | --- | --- |
| 构建 | Vite 6 | 启动快、配置少，纯静态产物便于 GitHub Pages 托管 |
| 框架 | React 19 + TypeScript | 组件化 + 类型约束，后续功能扩展成本低 |
| 样式 | Tailwind CSS v4（`@tailwindcss/vite`）+ `@theme` design tokens | 语义化色板/字号/圆角/阴影统一收口，组件内直接写工具类，无运行时依赖；重复配方抽到 `patterns.ts` 复用 |
| 内容数据 | Python 标准库脚本解析 docx → `public/data/guide.json`，运行时加载 | 内容与 UI 解耦；攻略更新只需替换 JSON，无需重新打包前端 |
| 导航状态 | React hooks + URL Hash | 第一步纯浏览，Hash 即可支持刷新保留、深链分享，暂不引入路由库 |
| 包管理 | npm | 环境自带，无额外工具链 |
| 进度持久化 | localStorage（第二步接入） | 数据条目使用稳定 id，勾选状态不随内容顺序变化 |

## 攻略分级

按原攻略目录分为四类，每类下可继续展开条目与子条目：

1. **经纪人事件簿**（原目录：明3·原片+资料集·攻略）
2. **角色攻略**（原目录：全角色事件攻略）
3. **六大特殊通告**（原目录：六大特殊国际通告）
4. **其他事件**（原目录：其他事件相关攻略）

## 目录结构

```
scripts/extract_guide.py       # docx + sources/*.txt → guide.json 抽取脚本（零第三方依赖）
sources/                       # 补充攻略的纯文本来源（UTF-8，可重跑）
public/data/guide.json         # 生成的结构化攻略数据（运行时加载）
src/types/guide.ts             # 数据类型
src/components/                # 可复用 UI 组件
src/hooks/                     # 数据、选中态、锚点跳转
src/lib/cn.ts                  # 条件类名拼接
src/styles/global.css          # @theme design tokens + 全局基底样式
src/styles/patterns.ts         # 跨组件复用的 Tailwind 配方（卡片、栅格、版心等）
```

## 内容来源

- `E:/Downloads/明星志愿3攻略.docx`：四大分级的主体正文。
- `sources/game-initial-questions.txt`：开局访谈 14 题的完整选项与友好度变化，**以这份 txt 为唯一来源**，原文（GBK）转 UTF-8 后原样使用，不做改写。首行 `★标题` 只是页面标题（与页面同名时不重复渲染）；首个问题之前的说明行合并成一条黄底提示条；`问题结束（补充说明）` 的括号文字作为该选项的脚注（`hint`），选项本身仍显示「问题结束」终止标记。
- `sources/initial-events.txt`：初始事件（新手事件 1–5 / 女艺人的疑惑 / 女艺人的请求），**以该 txt 为唯一来源**，docx 里的同名章节不再参与渲染，原文（GBK）转 UTF-8 后原样使用。解析规则：首行 `★新手事件：` 是页面标题，跳过；`#`、`*` 开头与**以冒号结尾的独行标题**（`初始女艺人的事件（指…）：`）都解析为 `section`；章节内不含标点的短行（`女艺人的疑惑`）解析为 `heading` 子标题；编号行（`1 （自动）`、`3－1 （跟随）`）解析为 `event` 并保留编号与触发方式标签，`提醒：` 行渲染为提示条，「旗下艺人为…」缩进为选项样式。txt 里已经没有 `#初始剧情` 这个标签，所以第一个 `event` 之前若还没有任何 `section`，脚本会自动补一个「初始剧情」小节，让开局 5 条事件不再裸挂在页面下。正文里混用的 `--` 与半角逗号会统一成 `——` 与 `，`。
- `sources/character-stats.txt`：12 位可签约艺人的初始属性，**以该 txt 为唯一来源**。原文每人一段 `姓名 / 年龄 / 生日` + 九项属性，解析成**一张表**（`table` 块）而不是逐行文字：一人一行、一项一列，姓名列在窄屏横向滑动时保持固定，每列最高的数值用浅粉胶囊标出。
- 文档里确实没有收录的条目（物品总览、贺总相关事件等）保留在树中并标注「待补充」，重跑脚本不会丢位置。

## 体量统计口径

页面上显示的是**字数**，不再是段落数：「约 X 字」取正文非空白字符数（含标点），`table` 块的单元格也算在内，分类页按「自身 + 全部子条目」累计；叶子条目只显示字数，没有子条目时不再显示「0 个子条目」。超过 1 万字折算成「1.2 万」，由 `src/lib/guide.ts` 的 `countChars` / `countCharsDeep` / `formatCount` 统一处理。

## 内容块渲染

`ContentBlockList` 把内容块按 `group` 聚合，一个 group 就是一段不可拆的整体：

- group 首块是 `event`（编号事件）时，整组渲染成**一张卡片**：编号徽章 + 正文在第一行，其下的选项、补充说明、`提醒：` 提示条都与正文左对齐缩进在卡内，不会出现「选项落在卡片外面」的割裂感。事件行原本写在编号后的 `（自动）`、`（场景）`、`（跟随）`、`（手动）` 会被解析成 `tag` 字段，渲染成彩色标签（墨灰 / 莓红 / 金 / 紫），一眼能看出触发方式。四色各自偏一个色相、刻意避开主色玫瑰，`自动` 与 `场景` 才不会糊成一片；对应令牌是 `--color-auto*` / `--color-scene*` / `--color-gold*` / `--color-violet*`。
- group 首块是带 `id` 的 `heading` 且有选项时，渲染成 `QuestionCard`（开局问题用的选项卡，带跳转 chip）。
- `table` 块交给 `DataTable`：表头用 sidebar 底色，数值列右对齐并用 `tabular-nums` 对齐位数，奇偶行交替换色；`highlight` 列为真的列会把该列最高值套上 `bg-brand-soft` 胶囊（`年龄` 只右对齐、不参与比较）。
- 其余情况逐块渲染：`section`（`#`/`*` 大标题）、`heading`、段落、提示条各自成段。

## 锚点跳转

攻略正文里带 `id` 的标题块可以在页内跳转，`target` 指向目标块的 `id`：

- 「游戏初始问题」每题是一个 `heading` 块（`id: q1`…`q14`），每个选项记录 `target`（下一题）、`targetLabel`（显示为「接问题３」或终止的「问题结束」）、可选的 `reward` 与 `hint`。
- 点击跳转链接会平滑滚动到目标、加一圈高亮闪动，并把地址写成 `#/game-guide/initial-questions~q3`（用 `replaceState`，不会触发 `hashchange` 重置选中项）。
- 刷新或分享该地址会直接落回对应题目：`useHashSelection` 只取 `~` 之前的部分作为节点 id，`useAnchorJump` 负责滚到锚点。
- 「本页小节」默认折叠成一行标题，点击展开为竖向编号列表（超过 320px 行内滚动），跳转行为与「接问题Ｎ」一致；展开状态在切换条目时保留，刷新后回到折叠。`section` 编号为 `1.`，`heading` 子标题按父级编号成 `2.1.` 并向右缩进一格、左侧带一条细竖线，层级一眼可分（`outlineOf` 里的 `depth` 字段来自数据）。

## 样式约定

- 颜色、字号、圆角、阴影只在 `src/styles/global.css` 的 `@theme` 中定义，组件统一使用 `text-ink`、`bg-brand-soft`、`rounded-ui-md` 这类语义类，不写裸色值。
- 响应式断点沿用原设计的向下阈值，用 `@custom-variant` 定义：`tab:`（≤980px）、`nav:`（≤860px，侧栏切换为抽屉）、`phone:`（≤520px）。它们是 **max-width** 变体，不是 Tailwind 默认的移动优先断点。
- 卡片、栅格、版心等重复组合放在 `src/styles/patterns.ts` 的 `ui` 对象里；组件特有的类名就近写在 JSX 中，条件类用 `cn()` 拼接并尽量互斥，避免同属性类互相覆盖。

## 路线图

- [x] 第一步：分级浏览（纯浏览）
- [ ] 第二步：条目进度勾选与本地保存
- [ ] 第三步：按条件/事件筛选、全局搜索增强
- [ ] 第四步：GitHub Pages 部署

## 推送到 GitHub

本地仓库按小步提交管理（提交信息为英文 `type: description`），主分支为 `main`。在 GitHub 新建空仓库后：

```bash
git remote add origin git@github.com:<your-name>/stardom3-guide.git
git push -u origin main
```

## 本地运行

```bash
npm install
npm run dev
```

重新生成攻略数据（后三个参数可省略，默认读 `sources/` 下的三份 txt）：

```bash
python scripts/extract_guide.py "E:/Downloads/明星志愿3攻略.docx"
```
