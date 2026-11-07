# 明星志愿3 攻略助手

把《明星志愿3攻略.docx》变成可分级浏览的网页，并最终支持游戏过程中的进度追踪。

## 技术选型

| 层面 | 选择 | 理由 |
| --- | --- | --- |
| 构建 | Vite 6 | 启动快、配置少，纯静态产物便于 GitHub Pages 托管 |
| 框架 | React 19 + TypeScript | 组件化 + 类型约束，后续功能扩展成本低 |
| 样式 | CSS Modules + 全局 design tokens | 统一视觉语言，组件样式隔离，零运行时依赖 |
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
scripts/extract_guide.py    # docx → guide.json 抽取脚本（零第三方依赖）
public/data/guide.json      # 生成的结构化攻略数据（运行时加载）
src/types/guide.ts          # 数据类型
src/components/             # 可复用 UI 组件
src/hooks/                  # 数据、选中态、搜索逻辑
src/styles/                 # design tokens 与全局样式
```

## 路线图

- [x] 第一步：分级浏览（纯浏览）
- [ ] 第二步：条目进度勾选与本地保存
- [ ] 第三步：按条件/事件筛选、全局搜索增强
- [ ] 第四步：GitHub Pages 部署

## 本地运行

```bash
npm install
npm run dev
```

重新生成攻略数据：

```bash
python scripts/extract_guide.py "E:/Downloads/明星志愿3攻略.docx"
```
