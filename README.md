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

1. **游戏攻略**（原目录：明3·原片+资料集·攻略）
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
- `sources/game-initial-questions.txt`：开局访谈 14 题的完整选项与友好度变化。原文是 GBK 的 txt，这里转成 UTF-8 并修正了两处笔误（「第一次完」→「第一次玩」、重复的「天晴」→「贺总、天晴」）。
- `sources/initial-events.txt`：初始事件（初始剧情 / 女艺人的疑惑 / 女艺人的请求）。原文同源 txt，`#` 与 `*` 视为**同一级**大标题，解析为 `section` 块；编号行（`1.（自动）`、`3－1 （跟随）`）解析为 `event` 块并保留编号，`提醒：` 行渲染为提示条，「旗下艺人为…」缩进为选项样式。文末「其他场景补充」两条（医院选项、第一周行程提醒）docx 里有、这份 txt 没有，为避免丢内容一并保留。
- 文档里确实没有收录的条目（物品总览、贺总相关事件等）保留在树中并标注「待补充」，重跑脚本不会丢位置。

## 体量统计口径

页面上显示的是**字数**，不再是段落数：「约 X 字」取正文非空白字符数（含标点），分类页按「自身 + 全部子条目」累计；叶子条目只显示字数，没有子条目时不再显示「0 个子条目」。超过 1 万字折算成「1.2 万」，由 `src/lib/guide.ts` 的 `countChars` / `countCharsDeep` / `formatCount` 统一处理。

## 锚点跳转

攻略正文里带 `id` 的标题块可以在页内跳转，`target` 指向目标块的 `id`：

- 「游戏初始问题」每题是一个 `heading` 块（`id: q1`…`q14`），每个选项记录 `target`（下一题）、`targetLabel`（显示为「接问题３」）与可选的 `reward`。
- 点击跳转链接会平滑滚动到目标、加一圈高亮闪动，并把地址写成 `#/game-guide/initial-questions~q3`（用 `replaceState`，不会触发 `hashchange` 重置选中项）。
- 刷新或分享该地址会直接落回对应题目：`useHashSelection` 只取 `~` 之前的部分作为节点 id，`useAnchorJump` 负责滚到锚点。
- 「本页小节」默认折叠成一行标题，点击展开为竖向编号列表（超过 320px 行内滚动），跳转行为与「接问题Ｎ」一致；展开状态在切换条目时保留，刷新后回到折叠。

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

重新生成攻略数据（第二个参数可省略，默认读 `sources/game-initial-questions.txt`）：

```bash
python scripts/extract_guide.py "E:/Downloads/明星志愿3攻略.docx"
```
