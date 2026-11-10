import { useMemo, useRef, useState } from 'react';
import { useTracker } from '../../hooks/useTracker';
import { useGuideContext } from '../../hooks/useGuideContext';
import { extractLines } from '../../lib/tracker';
import {
  captureStepRefs,
  describeReport,
  reanchorProgress,
  type ReanchorReport,
} from '../../lib/trackerReanchor';
import {
  createArchive,
  describeSummary,
  formatArchiveTime,
  type TrackerArchive,
} from '../../lib/trackerTransfer';
import {
  applyCgToLocal,
  createSaveArchive,
  describeSaveSummary,
  parseSaveArchive,
  saveArchiveFileName,
  serialiseSaveArchive,
  type SaveArchive,
} from '../../lib/saveArchive';
import { readCgRaw } from '../../lib/cg';

type Notice = { tone: 'ok' | 'error'; text: string };

interface PendingImport {
  /** The whole unified save, so the preview can show both halves' summaries. */
  archive: SaveArchive;
  /** Tracker progress after indices were re-pointed at the right events. */
  trackerData: TrackerArchive['data'] | null;
  /** `null` when the archive predates step snapshots and cannot be checked. */
  report: ReanchorReport | null;
}

function downloadText(text: string, fileName: string) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A single backup file carrying both the event-tracker progress and the CG
 *  collection, so one export/import moves every local save between devices.
 *  The tracker half keeps its re-anchor + merge/replace machinery; the CG half
 *  is always merged (never replaced) so a ticked CG can never be dropped. */
export default function SaveArchivePanel() {
  const { snapshot, importProgress, backup, undoBackup, dismissBackup } = useTracker();
  const guide = useGuideContext();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(false);

  // Every task line in the guide: an imported save can mention other artists.
  const allLines = useMemo(() => (guide ? extractLines(guide) : []), [guide]);

  const buildTrackerArchive = (now: Date): TrackerArchive => {
    const save = snapshot();
    return createArchive(save, captureStepRefs(allLines, save), now);
  };

  const buildCgPart = () => ({ version: 1 as const, collected: readCgRaw() });

  const applyArchive = (archive: SaveArchive) => {
    const { data, report } = archive.tracker
      ? reanchorProgress(archive.tracker.data, archive.tracker.steps, allLines)
      : { data: null, report: null };
    setPending({ archive, trackerData: data, report });
    setNotice(null);
    setConfirmReplace(false);
    setPasteOpen(false);
  };

  const readText = (text: string) => {
    try {
      applyArchive(parseSaveArchive(text));
    } catch (error) {
      setPending(null);
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '存档读取失败。' });
    }
  };

  const handleExport = () => {
    const now = new Date();
    downloadText(
      serialiseSaveArchive(createSaveArchive(buildTrackerArchive(now), buildCgPart(), now)),
      saveArchiveFileName(now),
    );
    setNotice({ tone: 'ok', text: '存档文件已下载，传到另一台设备后导入即可（含进度与 CG 收集）。' });
  };

  const handleCopy = async () => {
    try {
      const now = new Date();
      await navigator.clipboard.writeText(
        serialiseSaveArchive(createSaveArchive(buildTrackerArchive(now), buildCgPart(), now), false),
      );
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
    if (pending.trackerData) importProgress(pending.trackerData, mode);
    if (pending.archive?.cg) applyCgToLocal(pending.archive.cg.collected);
    const base =
      mode === 'merge'
        ? '已合并存档，本机原有进度与 CG 收集都保留着。'
        : '已用存档覆盖本机进度（CG 收集仍按合并处理，不会丢失）。';
    const extra = pending.report ? describeReport(pending.report) : '';
    setNotice({ tone: 'ok', text: extra ? `${base} ${extra}。` : base });
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
        <h2 className="text-ui-sm font-bold text-brand-strong">全部存档</h2>
        <span className="text-ui-2xs text-ink-faint">多端同步</span>
      </div>
      <p className="mt-2 text-ui-2xs leading-[1.7] text-ink-faint">
        进度与 CG 收藏只保存在本机浏览器。导出存档后在另一台设备导入，就能接着之前的记录继续。
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
            {pending.archive?.exportedAt
              ? `${formatArchiveTime(pending.archive.exportedAt)} 导出`
              : '存档未标注导出时间'}
          </p>
          {pending.archive && (
            <p className="mt-0.5 text-ui-2xs text-ink-faint">
              {describeSaveSummary(pending.archive.summary)}
            </p>
          )}
          {pending.archive?.tracker && (
            <p className="mt-0.5 text-ui-2xs text-ink-faint">
              {describeSummary(pending.archive.tracker.summary)}
            </p>
          )}
          {pending.report === null ? (
            <p
              data-transfer-legacy
              className="mt-1.5 rounded-ui-xs bg-gold-soft px-2 py-1 text-ui-2xs leading-[1.6] text-gold"
            >
              这份存档来自旧版本，没有步骤指纹，无法校验位置。若攻略数据更新过，个别勾选可能错位。
            </p>
          ) : (
            describeReport(pending.report) && (
              <p
                data-transfer-report
                className="mt-1.5 rounded-ui-xs bg-gold-soft px-2 py-1 text-ui-2xs leading-[1.6] text-gold"
              >
                {describeReport(pending.report)}
              </p>
            )
          )}
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
