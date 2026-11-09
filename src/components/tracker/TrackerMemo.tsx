import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { cn } from '../../lib/cn';
import {
  MEMO_MAX_LENGTH,
  countUndone,
  createMemo,
  readMemos,
  sortMemos,
  writeMemos,
  type MemoItem,
} from '../../lib/memo';

/** Free-form scratch list that sits directly under the 分类批量操作 panel in
 *  the left rail. It is completely independent of the event pool: no link to a
 *  task line, no progress maths, and it survives 重置进度 / save imports because
 *  it lives in its own storage key. Add with Enter, tick to finish, ✎ to edit,
 *  × to delete. */
export default function TrackerMemo() {
  const [items, setItems] = useState<MemoItem[]>(readMemos);
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  // Same contract as useTracker: write on every change, tolerate a dead
  // localStorage (private mode) without breaking the UI.
  useEffect(() => {
    writeMemos(items);
  }, [items]);

  useEffect(() => {
    if (editingId) editRef.current?.select();
  }, [editingId]);

  const undone = useMemo(() => items.filter((item) => !item.done), [items]);
  const done = useMemo(() => items.filter((item) => item.done), [items]);
  const finished = countUndone(items) === 0 && items.length > 0;

  const add = () => {
    const memo = createMemo(draft);
    if (!memo) return;
    setItems((previous) => sortMemos([...previous, memo]));
    setDraft('');
    // Keep the caret in the box so several memos can be typed in a row.
    inputRef.current?.focus();
  };

  const toggle = (id: string) => {
    setItems((previous) => sortMemos(previous.map((item) => (item.id === id ? { ...item, done: !item.done } : item))));
  };

  const remove = (id: string) => {
    setItems((previous) => previous.filter((item) => item.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const startEdit = (item: MemoItem) => {
    setEditingId(item.id);
    setEditText(item.text);
  };

  const commitEdit = () => {
    if (!editingId) return;
    const text = editText.trim().slice(0, MEMO_MAX_LENGTH);
    // Clearing the text is a delete: an empty memo has nothing to show.
    setItems((previous) =>
      text
        ? previous.map((item) => (item.id === editingId ? { ...item, text } : item))
        : previous.filter((item) => item.id !== editingId),
    );
    setEditingId(null);
    setEditText('');
  };

  const clearDone = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setItems((previous) => previous.filter((item) => !item.done));
    setConfirmClear(false);
  };

  return (
    <section data-memo className="rounded-ui-md border border-line bg-surface shadow-soft">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          data-memo-toggle
          aria-expanded={open}
          aria-label={open ? '收起备忘录' : '展开备忘录'}
          title={open ? '收起备忘录' : '展开备忘录'}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className="shrink-0 text-ink-muted transition-transform duration-150"
            style={{ transform: open ? 'rotate(90deg)' : 'none' }}
          >
            ▸
          </span>
          <h2 className="shrink-0 text-ui-sm font-bold text-brand-strong">备忘录</h2>
          <span data-memo-hint className="shrink-0 whitespace-nowrap text-ui-2xs text-ink-faint">
            {items.length === 0
              ? '待办与事件池无关'
              : finished
                ? `全部完成 ${items.length}`
                : `未完成 ${undone.length}/${items.length}`}
          </span>
        </button>
      </div>

      {open && (
        <div data-memo-body className="border-t border-line px-4 pb-4 pt-3">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              data-memo-input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={MEMO_MAX_LENGTH}
              placeholder="记一件要做的事，回车添加"
              aria-label="新建备忘"
              className="min-w-0 flex-1 rounded-ui-sm border border-line bg-surface-soft px-2.5 py-1.5 text-ui-xs text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand-line"
            />
            <button
              type="submit"
              data-memo-add
              disabled={!draft.trim()}
              aria-label="添加备忘"
              title="添加备忘"
              className="shrink-0 rounded-ui-sm border border-brand-line bg-brand-soft px-2.5 py-1.5 text-ui-xs font-semibold text-brand-strong transition-colors hover:border-brand hover:bg-brand hover:text-white disabled:opacity-40 disabled:hover:border-brand-line disabled:hover:bg-brand-soft disabled:hover:text-brand-strong"
            >
              ＋
            </button>
          </form>

          {items.length === 0 ? (
            <p data-memo-empty className="mt-2.5 text-ui-2xs leading-[1.7] text-ink-faint">
              想起什么就随手记在这里，比如「报考表演证书前先把演技练到 700」。它不进事件池，也不会被重置进度清掉。
            </p>
          ) : (
            <ul className="mt-2.5 flex flex-col gap-1">
              {undone.map((item) => (
                <MemoRow
                  key={item.id}
                  item={item}
                  editing={editingId === item.id}
                  editText={editText}
                  editRef={editRef}
                  onToggle={() => toggle(item.id)}
                  onStartEdit={() => startEdit(item)}
                  onEditText={setEditText}
                  onCommit={commitEdit}
                  onCancel={() => {
                    setEditingId(null);
                    setEditText('');
                  }}
                  onRemove={() => remove(item.id)}
                />
              ))}
            </ul>
          )}

          {done.length > 0 && (
            <div data-memo-done-group className="mt-3">
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-ui-2xs text-ink-faint">已完成 {done.length}</span>
                <span className="h-px flex-1 bg-line" />
                <button
                  type="button"
                  data-memo-clear
                  onClick={clearDone}
                  onBlur={() => setConfirmClear(false)}
                  className={cn(
                    'shrink-0 rounded-ui-sm border px-1.5 py-0.5 text-ui-2xs transition-colors',
                    confirmClear
                      ? 'border-missing bg-missing-soft text-missing'
                      : 'border-line text-ink-faint hover:border-brand-line hover:text-brand-strong',
                  )}
                >
                  {confirmClear ? '确认清除？' : '清除已完成'}
                </button>
              </div>
              <ul className="mt-1.5 flex flex-col gap-1">
                {done.map((item) => (
                  <MemoRow
                    key={item.id}
                    item={item}
                    editing={editingId === item.id}
                    editText={editText}
                    editRef={editRef}
                    onToggle={() => toggle(item.id)}
                    onStartEdit={() => startEdit(item)}
                    onEditText={setEditText}
                    onCommit={commitEdit}
                    onCancel={() => {
                      setEditingId(null);
                      setEditText('');
                    }}
                    onRemove={() => remove(item.id)}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

interface RowProps {
  item: MemoItem;
  editing: boolean;
  editText: string;
  editRef: RefObject<HTMLInputElement | null>;
  onToggle: () => void;
  onStartEdit: () => void;
  onEditText: (text: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onRemove: () => void;
}

function MemoRow({
  item,
  editing,
  editText,
  editRef,
  onToggle,
  onStartEdit,
  onEditText,
  onCommit,
  onCancel,
  onRemove,
}: RowProps) {
  return (
    <li
      data-memo-item
      data-memo-done={item.done ? 'yes' : 'no'}
      className="group flex items-start gap-1.5 rounded-ui-sm border border-transparent px-1 py-1 transition-colors hover:border-line hover:bg-surface-soft"
    >
      <button
        type="button"
        data-memo-check
        onClick={onToggle}
        role="checkbox"
        aria-checked={item.done}
        aria-label={item.done ? `标记未完成：${item.text}` : `标记完成：${item.text}`}
        title={item.done ? '标记为未完成' : '标记为完成'}
        className={cn(
          'mt-px flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border text-[10px] leading-none transition-colors',
          item.done
            ? 'border-growth bg-growth text-white'
            : 'border-line-strong bg-surface text-transparent hover:border-brand-line',
        )}
      >
        ✓
      </button>

      {editing ? (
        <input
          ref={editRef}
          data-memo-edit-input
          value={editText}
          onChange={(event) => onEditText(event.target.value)}
          maxLength={MEMO_MAX_LENGTH}
          aria-label="编辑备忘"
          onBlur={onCommit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onCommit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onCancel();
            }
          }}
          className="min-w-0 flex-1 rounded-[3px] border border-brand-line bg-surface px-1 py-0 text-ui-xs text-ink outline-none"
        />
      ) : (
        <button
          type="button"
          data-memo-text
          onClick={onStartEdit}
          title="点击编辑"
          className={cn(
            'min-w-0 flex-1 break-words text-left text-ui-xs leading-[1.6] transition-colors',
            item.done ? 'text-ink-faint line-through' : 'text-ink-muted hover:text-ink',
          )}
        >
          {item.text}
        </button>
      )}

      {!editing && (
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            data-memo-edit
            onClick={onStartEdit}
            aria-label={`编辑：${item.text}`}
            title="编辑"
            className="rounded-[3px] px-1 text-ui-2xs leading-[1.6] text-ink-faint transition-colors hover:bg-brand-soft hover:text-brand-strong"
          >
            ✎
          </button>
          <button
            type="button"
            data-memo-remove
            onClick={onRemove}
            aria-label={`删除：${item.text}`}
            title="删除"
            className="rounded-[3px] px-1 text-ui-2xs leading-[1.6] text-ink-faint transition-colors hover:bg-missing-soft hover:text-missing"
          >
            ×
          </button>
        </span>
      )}
    </li>
  );
}
