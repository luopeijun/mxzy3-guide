/** CG 图鉴的站点差异：两个入口共用 `src/components/cg/*`，区别只在这份配置。
 *
 *  主站是默认配置（MAIN_CG_CONFIG），所有开关都保持原样；甜蜜乐章只在
 *  `SweetApp` 里传 SWEET_CG_CONFIG。组件内部不写 `if (site === ...)`。
 *
 *  甜蜜乐章的 CG 目前只有编号：没有名称、没有获得条件、也还没做攻略跳转，
 *  所以对应开关先关掉；等资料齐了打开即生效，不必改组件。 */
import { CG_KEY } from './cg';

export interface CgSiteConfig {
  /** 收集进度存到哪个 localStorage 键，两站绝不共用。 */
  storageKey: string;
  /** 卡片 / 灯箱上的「攻略 ›」入口。需要 `cgIds` 或 `item.guide` 映射。 */
  guideLinks: boolean;
  /** 顶栏「全部存档」。主站是进度 + CG + 六大通告的统一信封；甜站以后单独接。 */
  archive: boolean;
  /** 是否开放「调整人物内 CG 顺序」的排序模式（甜站分批收图、需要人工微调顺序；
   *  主站顺序来自游戏原表，关掉保持零变化）。 */
  allowReorder: boolean;
  /** 灯箱里的「获得条件」一行。 */
  showCondition: boolean;
  /** 卡片底栏与灯箱标题里的 CG 名称；关掉后只显示编号。 */
  showName: boolean;
  /** 顶栏计数后面的补充说明。 */
  metaNote: string;
  /** `missingImageCount > 0` 时的量词后缀。 */
  missingImageNote: string;
  /** 分组没内容 / 只看未收集时的提示。 */
  emptyText: string;
  emptyFilteredText: string;
}

export const MAIN_CG_CONFIG: CgSiteConfig = {
  storageKey: CG_KEY,
  guideLinks: true,
  archive: true,
  allowReorder: false,
  showCondition: true,
  showName: true,
  metaNote: '',
  missingImageNote: '张站点未提供图片',
  emptyText: '这个分组暂时没有 CG。',
  emptyFilteredText: '这个分组已经全部收集完了。',
};

export const SWEET_CG_CONFIG: CgSiteConfig = {
  storageKey: 'sweet.cg.v1',
  guideLinks: false,
  archive: false,
  allowReorder: true,
  showCondition: false,
  showName: false,
  metaNote: '',
  missingImageNote: '张图片待导入',
  emptyText: '这一组还没有 CG。图片按人物放进素材目录后重新生成，这里会自动出现。',
  emptyFilteredText: '这一组已经全部收集完了。',
};
