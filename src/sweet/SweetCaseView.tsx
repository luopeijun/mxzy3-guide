import { useRef, useState } from 'react';
import { cn } from '../lib/cn';
import EmptyState from '../components/EmptyState';

/** 甜蜜乐章存档解析的入口占位：页签、整页容器、选档 / 拖拽已经接通，
 *  真正的解析逻辑还没做，选中文件后只显示文件名并明确提示不会读取。 */
export default function SweetCaseView() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);

  const receive = (file?: File | null) => {
    if (file) setFileName(file.name);
  };

  return (
    <div
      data-sweet-case-reader
      data-sweet-case-dropzone
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        receive(event.dataTransfer.files?.[0] ?? null);
      }}
      className={cn(
        'fixed inset-x-0 bottom-0 top-16 z-50 overflow-y-auto bg-canvas',
        dragging && 'ring-2 ring-inset ring-brand',
      )}
    >
      <div className="mx-auto w-full max-w-[1600px] px-8 pt-3 pb-10 nav:px-5">
        <div
          data-sweet-case-toolbar
          className="flex flex-wrap items-center gap-2 rounded-ui-md border border-line bg-surface px-3 py-2"
        >
          <button
            type="button"
            data-sweet-case-upload-button
            onClick={() => inputRef.current?.click()}
            className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-ui-2xs font-semibold text-white transition-colors hover:bg-brand-strong"
          >
            {fileName ? '换一个存档' : '选择存档'}
          </button>
          <input
            ref={inputRef}
            data-sweet-case-upload
            type="file"
            accept=".sa2,.sav,.SA2,.SAV"
            className="hidden"
            onChange={(event) => {
              receive(event.target.files?.[0] ?? null);
              event.currentTarget.value = '';
            }}
            aria-label="选择甜蜜乐章存档文件"
          />
          {fileName ? (
            <span
              data-sweet-case-file
              className="max-w-[320px] truncate text-ui-2xs text-ink-muted"
              title={fileName}
            >
              {fileName}
            </span>
          ) : (
            <span className="text-ui-2xs text-ink-faint">
              把甜蜜乐章游戏存档拖到这里，或点上面的按钮选择。
            </span>
          )}
        </div>

        <div data-sweet-case-pending className="mt-3">
          <EmptyState
            title="甜蜜乐章存档解析"
            text={fileName
              ? '存档入口已经接好，实际读取逻辑还在开发中；这份文件暂时不会读出内容。'
              : '存档入口已经接好，实际读取逻辑还在开发中。'}
          />
        </div>
      </div>
    </div>
  );
}
