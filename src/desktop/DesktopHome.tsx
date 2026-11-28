import { SAVE_EXTENSION, SITE_LABEL, type Site } from './types';

/** 桌面版启动页：一个程序两个入口，点哪个游戏就进哪个存档解析页。
 *  两个游戏的目录、档位、自动跟随状态都由主进程分开记，不在这里互相带过去。 */
export default function DesktopHome() {
  const open = (site: Site) => {
    window.location.hash = site === 'main' ? '#/case' : '#/sweet';
  };

  return (
    <main data-desktop-home className="flex min-h-screen items-center justify-center bg-canvas px-6 py-10">
      <div className="w-full max-w-[860px]">
        <h1 className="text-center text-ui-lg font-bold text-brand-strong">明星志愿3 攻略助手 · 桌面版</h1>
        <p className="mt-2 text-center text-ui-xs text-ink-muted">选择游戏，读取它的存档</p>
        <div className="mt-8 grid gap-4 grid-cols-2 tab:grid-cols-1">
          {(['main', 'sweet'] as Site[]).map((site) => (
            <button
              key={site}
              type="button"
              data-desktop-home-card={site}
              onClick={() => open(site)}
              className="rounded-ui-lg border border-line bg-surface p-6 text-left shadow-soft transition-colors hover:border-brand-line hover:bg-surface-soft"
            >
              <span className="block text-ui-md font-semibold text-ink">{SITE_LABEL[site]}</span>
              <span className="mt-1 block text-ui-xs text-ink-muted">存档解析</span>
              <span className="mt-4 block text-ui-2xs text-ink-faint">
                {SITE_LABEL[site]} · {SAVE_EXTENSION[site].hint}
              </span>
              <span className="mt-5 block text-ui-xs font-semibold text-brand-strong">进入 →</span>
            </button>
          ))}
        </div>
        <p className="mt-8 text-center text-ui-2xs text-ink-faint">
          也可以直接把游戏存档拖进解析页；两个游戏各有自己的存档目录设置。
        </p>
      </div>
    </main>
  );
}
