import type { ReactNode } from 'react';
import SmartImage from './SmartImage';

interface CrossLink {
  href: string;
  label: string;
  hint: string;
}

interface Props {
  title: string;
  logoSrc: string;
  onBrandClick: () => void;
  /** 窄屏才出现的目录按钮（只有攻略视图需要）。 */
  menuButton?: ReactNode;
  /** 页签条（TabBar 实例）。 */
  tabs?: ReactNode;
  /** 顶栏右侧的内容（分类胶囊、开关等）。 */
  right?: ReactNode;
  /** 另一款游戏的入口，两站互跳；不传就不显示。 */
  crossLink?: CrossLink;
}

/** 两个站点共用的顶栏骨架：左边目录按钮 + 品牌，中间页签，右边自定义区 +
 *  跨站入口。站名、图标、页签、右侧内容都由调用方注入，样式只有这一份。 */
export default function GameHeader({
  title, logoSrc, onBrandClick, menuButton, tabs, right, crossLink,
}: Props) {
  return (
    <header className="relative z-20 h-16 shrink-0 border-b border-line bg-surface shadow-soft">
      <div className="flex h-full items-center gap-6 px-6 nav:gap-3 nav:px-[14px]">
        {menuButton}
        <button className="flex min-w-0 items-center gap-[11px]" type="button" onClick={onBrandClick}>
          <SmartImage
            src={logoSrc}
            thumb={false}
            priority
            alt=""
            className="h-[26px] w-[26px] shrink-0 rounded-[6px]"
            aria-hidden="true"
          />
          <span className="whitespace-nowrap text-ui-md font-bold tracking-[0.02em]">{title}</span>
        </button>

        {tabs}

        <div className="ml-auto flex items-center gap-4 nav:gap-3">
          {right}
          {crossLink && (
            <a
              data-game-switch
              href={crossLink.href}
              title={crossLink.hint}
              className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-line px-[11px] py-[5px] text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
            >
              {crossLink.label}
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
