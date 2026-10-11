import { EmojiPicker as Frimousse } from "frimousse";

type Props = {
  onSelect: (emoji: string) => void;
  onRemove?: () => void;
};

export function EmojiPicker({ onSelect, onRemove }: Props) {
  return (
    <Frimousse.Root
      className="isolate flex h-[340px] w-[352px] flex-col"
      emojibaseUrl="/emojibase"
      columns={10}
      onEmojiSelect={({ emoji }) => onSelect(emoji)}
    >
      <div className="flex items-center gap-2 p-2 pb-1">
        <Frimousse.Search
          autoFocus
          placeholder="Filter…"
          className="flex-1 rounded-md bg-c-hover px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-c-accent/40"
        />
        {onRemove && (
          <button onClick={onRemove} className="rounded-md px-2 py-1.5 text-sm text-c-dark-half hover:bg-c-hover">
            Remove
          </button>
        )}
      </div>
      <Frimousse.Viewport className="relative flex-1 outline-none">
        <Frimousse.Loading className="absolute inset-0 flex items-center justify-center text-sm text-c-dark-half">Loading…</Frimousse.Loading>
        <Frimousse.Empty className="absolute inset-0 flex items-center justify-center text-sm text-c-dark-half">No emoji found.</Frimousse.Empty>
        <Frimousse.List
          className="select-none pb-1.5"
          components={{
            CategoryHeader: ({ category, ...props }) => (
              <div className="bg-c-surface px-3 pt-3 pb-1.5 text-xs font-medium text-c-dark-half" {...props}>
                {category.label}
              </div>
            ),
            Row: ({ children, ...props }) => (
              <div className="scroll-my-1.5 px-1.5" {...props}>
                {children}
              </div>
            ),
            Emoji: ({ emoji, ...props }) => (
              <button className="flex size-8 items-center justify-center rounded-md text-xl data-[active]:bg-c-hover" {...props}>
                {emoji.emoji}
              </button>
            ),
          }}
        />
      </Frimousse.Viewport>
    </Frimousse.Root>
  );
}

export namespace EmojiPicker {
  const RANDOM = ["📝", "📚", "💡", "🚀", "🌱", "🎯", "🧭", "🗂️", "🎨", "🧪", "🌊", "🔥", "⭐", "🍀", "🎬", "📌"];

  export function random(): string {
    return RANDOM[Math.floor(Math.random() * RANDOM.length)]!;
  }
}
