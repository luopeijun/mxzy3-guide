interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SearchBox({ value, onChange, placeholder = '搜索攻略标题或正文' }: Props) {
  return (
    <div className="relative flex items-center">
      <span className="pointer-events-none absolute left-[10px] text-[13px] text-ink-faint" aria-hidden="true">
        ⌕
      </span>
      <input
        className="h-[34px] w-full rounded-ui-sm border border-line-strong bg-surface px-[30px] text-ui-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-faint focus:border-brand focus:ring-3 focus:ring-brand-soft"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label="搜索攻略"
      />
      {value && (
        <button
          className="absolute right-[6px] flex h-[22px] w-[22px] items-center justify-center rounded-full text-[14px] leading-none text-ink-faint hover:bg-missing-soft hover:text-ink"
          onClick={() => onChange('')}
          aria-label="清空搜索"
          type="button"
        >
          ×
        </button>
      )}
    </div>
  );
}
