import { useRef, useState } from 'react';
import { useTracker } from '../../hooks/useTracker';
import {
  archiveFileName,
  describeSummary,
  formatArchiveTime,
  parseArchive,
  serialiseArchive,
  type TrackerArchive,
} from '../../lib/trackerTransfer';

type Notice = { tone: 'ok' | 'error'; text: string };

function downloadText(text: string, fileName: string) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Local progress lives in this browser only. This panel moves it between
 *  devices: export a JSON save, then import it elsewhere — either merged into
 *  what is already there, or replacing it outright. */
export default function TrackerTransfer() {
  const { snapshot, importProgress, backup, undoBackup, dismissBackup } = useTracker();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<TrackerArchive | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(false);

  const applyArchive = (archive: TrackerArchive) => {
    setPending(archive);
    setNotice(null);
    setConfirmReplace(false);
    setPasteOpen(false);
  };

  const readText = (text: string) => {
    try {
      applyArchive(parseArchive(text));
    } catch (error) {
      setPending(null);
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '存档读取失败。' });
    }
  };

  const handleExport = () => {
    const now = new Date();
    downloadText(serialiseArchive(snapshot(), now), archiveFileName(now));
    setNotice({ tone: 'ok', text: '存档文件已下载，把它传到另一台设备后导入即可。' });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(serialiseArchive(snapshot(), new Date(), false));
      setNotice({ tone: 'ok', text: '存档内容已复制到剪贴板，可直接粘贴到另一台设备。' });
    } catch {
      setNotice({
        tone: 'error',
        text: '当前浏览器不允许写剪贴板（需要 https 或 localhost），请改用「导出文件」。',
      });
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      readText(await file.text());
    } catch {
      setNotice({ tone: 'error', text: '读取文件失败，请重新选择。' });
    }
  };

  const handleApply = (mode: 'merge' | 'replace') => {
    if (!pending) return;
    if (mode === 'replace' && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    importProgress(pending.data, mode);
    setNotice({
      tone: 'ok',
      text:
        mode === 'merge'
          ? `已合并 ${pending.summary.lines} 条有记录的线，本机原有进度都保留着。`
          : '已用存档覆盖本机进度。',
    });
    setPending(null);
    setConfirmReplace(false);
    setPasteText('');
  };

  const secondary =
    'rounded-ui-sm border border-line px-2.5 py-1.5 text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:bg-brand-soft hover:text-brand-strong';
  const primary =
    'rounded-ui-sm border border-brand-line bg-brand-soft px-2.5 py-1.5 text-ui-2xs font-medium text-brand-strong transition-colors hover:bg-brand-line';

  return (
    <section
      data-transfer-panel
      className="rounded-ui-md border border-line bg-surface p-5 shadow-soft"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-ui-sm font-bold text-brand-strong">进度存档</h2>
        <span className="text-ui-2xs text-ink-faint">多端同步</span>
      </div>
      <p className="mt-2 text-ui-2xs leading-[1.7] text-ink-faint">
        进度只保存在本机浏览器。导出存档后在另一台设备导入，就能接着之前的记录继续。
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" data-transfer-export onClick={handleExport} className={primary}>
          导出文件
        </button>
        <button type="button" data-transfer-copy onClick={() => void handleCopy()} className={secondary}>
          复制文本
        </button>
        <button
          type="button"
          data-transfer-import
          onClick={() => fileRef.current?.click()}
          className={secondary}
        >
          导入文件
        </button>
        <button
          type="button"
          data-transfer-paste
          aria-expanded={pasteOpen}
          onClick={() => {
            setPasteOpen((open) => !open);
            setNotice(null);
          }}
          className={secondary}
        >
          {pasteOpen ? '收起文本' : '粘贴文本'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          data-transfer-input
          onChange={(event) => {
            const file = event.target.files?.[0];
            void handleFile(file);
            // Reset so picking the same file twice still fires onChange.
            event.target.value = '';
          }}
        />
      </div>

      {pasteOpen && (
        <div className="mt-2">
          <textarea
            data-transfer-paste-input
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            spellCheck={false}
            placeholder="把另一台设备「复制文本」得到的存档内容粘贴到这里"
            className="h-20 w-full resize-y rounded-ui-sm border border-line bg-surface-soft p-2 font-mono text-[11px] leading-[1.6] text-ink outline-none focus:border-brand-line"
          />
          <button
            type="button"
            data-transfer-read
            onClick={() => readText(pasteText)}
            className={`mt-1.5 w-full ${secondary}`}
          >
            读取这段存档
          </button>
        </div>
      )}

      {pending && (
        <div
          data-transfer-preview
          className="mt-3 rounded-ui-sm border border-brand-line bg-brand-soft/60 p-2.5"
        >
          <p className="text-ui-2xs font-medium text-brand-strong">准备导入的存档</p>
          <p className="mt-1 text-ui-2xs text-ink-muted">
            {pending.exportedAt
              ? `${formatArchiveTime(pending.exportedAt)} 导出`
              : '存档未标注导出时间'}
          </p>
          <p className="mt-0.5 text-ui-2xs text-ink-faint">{describeSummary(pending.summary)}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              data-transfer-merge
              onClick={() => handleApply('merge')}
              className={primary}
            >
              合并到本机
            </button>
            <button
              type="button"
              data-transfer-replace
              onClick={() => handleApply('replace')}
              className={
                confirmReplace
                  ? 'rounded-ui-sm border border-missing bg-missing-soft px-2.5 py-1.5 text-ui-2xs font-medium text-missing'
                  : secondary
              }
            >
              {confirmReplace ? '确认覆盖？' : '覆盖本机'}
            </button>
          </div>
          <button
            type="button"
            data-transfer-cancel
            onClick={() => {
              setPending(null);
              setConfirmReplace(false);
            }}
            className="mt-1.5 w-full text-center text-ui-2xs text-ink-faint transition-colors hover:text-brand-strong"
          >
            取消
          </button>
        </div>
      )}

      {notice && (
        <p
          data-transfer-notice
          data-tone={notice.tone}
          className={
            notice.tone === 'ok'
              ? 'mt-2 rounded-ui-sm bg-growth-soft px-2 py-1.5 text-ui-2xs leading-[1.6] text-growth-strong'
              : 'mt-2 rounded-ui-sm bg-missing-soft px-2 py-1.5 text-ui-2xs leading-[1.6] text-missing'
          }
        >
          {notice.text}
        </p>
      )}

      {backup && (
        <div
          data-transfer-backup
          className="mt-2 rounded-ui-sm border border-gold-line bg-gold-soft px-2.5 py-2"
        >
          <p className="text-ui-2xs leading-[1.6] text-gold">
            已保留{backup.reason === 'replace' ? '覆盖' : '重置'}前的进度（
            {formatArchiveTime(backup.at)}）
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              data-transfer-undo
              onClick={undoBackup}
              className="rounded-ui-xs border border-gold-line bg-surface px-2 py-1 text-ui-2xs font-semibold text-gold transition-colors hover:border-gold"
            >
              撤销，恢复回去
            </button>
            <button
              type="button"
              data-transfer-dismiss-backup
              onClick={dismissBackup}
              className="text-ui-2xs text-gold/80 underline-offset-2 transition-colors hover:text-gold hover:underline"
            >
              不用了
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
