interface Props {
  items: { id: string; text: string }[];
  onJump?: (anchor: string) => void;
}

export default function ArticleOutline({ items, onJump }: Props) {
  if (items.length === 0) return null;

  const jump = (id: string) => {
    if (onJump) {
      onJump(id);
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="mb-[26px] rounded-ui-md border border-line bg-surface-soft px-[18px] py-[14px]" aria-label="本页小节">
      <div className="mb-2 text-ui-2xs font-bold tracking-[0.08em] text-ink-muted">本页小节 · {items.length}</div>
      <div className="flex max-h-[136px] flex-wrap gap-x-[14px] gap-y-1.5 overflow-y-auto">
        {items.map((item) => (
          <button
            key={item.id}
            className="text-left text-ui-xs text-brand hover:underline"
            type="button"
            onClick={() => jump(item.id)}
            title={item.text}
          >
            {item.text}
          </button>
        ))}
      </div>
    </section>
  );
}
