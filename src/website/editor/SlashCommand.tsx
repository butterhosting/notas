import { Icon } from "@/website/comps/Icon";
import { Editor, Extension, JSONContent, Range } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import clsx from "clsx";
import { ComponentType, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

type SlashItem = {
  title: string;
  group: "Basic blocks" | "Media" | "Advanced";
  keywords?: string[];
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  run: (editor: Editor, range: Range) => void;
};

export namespace SlashCommand {
  export const extension = Extension.create<{ items: SlashItem[] }>({
    name: "slashCommand",

    addOptions() {
      return { items: [] };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          char: "/",
          // "2 col" and "toggle heading 2" are queries too
          allowSpaces: true,
          allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
          items: ({ query }) => filter(this.options.items, query),
          command: ({ editor, range, props }) => props.run(editor, range),
          render: () => {
            let renderer: ReactRenderer<SlashMenu.Handle, SuggestionProps<SlashItem, SlashItem>> | undefined;
            let unmount: (() => void) | undefined;
            return {
              onStart: (props) => {
                renderer = new ReactRenderer(SlashMenu, { props, editor: props.editor });
                unmount = props.mount(renderer.element as HTMLElement);
              },
              onUpdate: (props) => renderer?.updateProps(props),
              onKeyDown: (props) => renderer?.ref?.onKeyDown(props) ?? false,
              onExit: () => {
                unmount?.();
                renderer?.destroy();
              },
            };
          },
        }),
      ];
    },
  });

  export type Actions = {
    createSubpage: () => Promise<string | undefined>;
    openPage: (id: string) => void;
  };

  export function items({ createSubpage, openPage }: Actions): SlashItem[] {
    return [
      { title: "Text", group: "Basic blocks", keywords: ["paragraph", "plain"], icon: Icon.Text, run: (e, r) => chain(e, r).setParagraph().run() },
      ...([1, 2, 3] as const).map(
        (level): SlashItem => ({
          title: `Heading ${level}`,
          group: "Basic blocks",
          keywords: [`h${level}`, "title"],
          hint: "#".repeat(level),
          icon: [Icon.H1, Icon.H2, Icon.H3][level - 1]!,
          run: (e, r) => chain(e, r).setHeading({ level }).run(),
        }),
      ),
      { title: "Bulleted list", group: "Basic blocks", keywords: ["unordered", "ul"], hint: "-", icon: Icon.Bullet, run: (e, r) => chain(e, r).toggleBulletList().run() },
      { title: "Numbered list", group: "Basic blocks", keywords: ["ordered", "ol"], hint: "1.", icon: Icon.Numbered, run: (e, r) => chain(e, r).toggleOrderedList().run() },
      { title: "To-do list", group: "Basic blocks", keywords: ["task", "checkbox", "check"], hint: "[]", icon: Icon.Todo, run: (e, r) => chain(e, r).toggleTaskList().run() },
      { title: "Toggle list", group: "Basic blocks", keywords: ["collapse", "details", "fold"], icon: Icon.Toggle, run: (e, r) => toggle(e, r, null) },
      {
        title: "Page",
        group: "Basic blocks",
        keywords: ["subpage", "new", "link"],
        icon: Icon.Page,
        run: (e, r) => {
          chain(e, r).run();
          createSubpage().then((id) => {
            if (id) {
              insertBlock(e, { type: "pageLink", attrs: { id } });
              openPage(id);
            }
          });
        },
      },
      { title: "Callout", group: "Basic blocks", keywords: ["note", "info", "tip", "warning"], icon: Icon.Callout, run: (e, r) => chain(e, r).setCallout().run() },
      { title: "Quote", group: "Basic blocks", keywords: ["blockquote", "citation"], hint: ">", icon: Icon.Quote, run: (e, r) => chain(e, r).setBlockquote().run() },
      {
        title: "Table",
        group: "Basic blocks",
        keywords: ["grid", "spreadsheet"],
        icon: Icon.Table,
        run: (e, r) => chain(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      },
      { title: "Divider", group: "Basic blocks", keywords: ["separator", "line", "hr"], hint: "---", icon: Icon.Divider, run: (e, r) => chain(e, r).setHorizontalRule().run() },
      { title: "Image", group: "Media", keywords: ["picture", "photo", "upload"], icon: Icon.Image, run: (e, r) => media(e, r, "image") },
      { title: "Video", group: "Media", keywords: ["youtube", "vimeo", "movie", "film"], icon: Icon.Video, run: (e, r) => media(e, r, "video") },
      { title: "Audio", group: "Media", keywords: ["sound", "music", "mp3", "voice"], icon: Icon.Audio, run: (e, r) => media(e, r, "audio") },
      { title: "Code", group: "Media", keywords: ["snippet", "pre"], hint: "```", icon: Icon.Code, run: (e, r) => chain(e, r).setCodeBlock().run() },
      { title: "File", group: "Media", keywords: ["attachment", "upload", "pdf", "download"], icon: Icon.File, run: (e, r) => media(e, r, "file") },
      { title: "Embed", group: "Media", keywords: ["iframe", "link", "website"], icon: Icon.Embed, run: (e, r) => media(e, r, "embed") },
      {
        title: "Table of contents",
        group: "Advanced",
        keywords: ["toc", "outline", "headings"],
        icon: Icon.Contents,
        run: (e, r) => {
          chain(e, r).run();
          insertBlock(e, { type: "toc" });
        },
      },
      ...([2, 3] as const).map(
        (count): SlashItem => ({
          title: `${count} columns`,
          group: "Advanced",
          keywords: ["columns", "layout", "side", "grid"],
          icon: Icon.Columns,
          run: (e, r) =>
            wrapLine(e, r, (line) => ({
              type: "columns",
              content: Array.from({ length: count }, (_, i) => ({ type: "column", content: [i === 0 ? line : { type: "paragraph" }] })),
            })),
        }),
      ),
      {
        title: "Tabs",
        group: "Advanced",
        keywords: ["tabbed", "switch", "sections"],
        icon: Icon.Tabs,
        run: (e, r) =>
          wrapLine(e, r, (line) => ({
            type: "tabs",
            content: [
              { type: "tab", attrs: { label: "Tab 1", active: true }, content: [line] },
              { type: "tab", attrs: { label: "Tab 2" }, content: [{ type: "paragraph" }] },
            ],
          })),
      },
      ...([1, 2, 3] as const).map(
        (level): SlashItem => ({
          title: `Toggle heading ${level}`,
          group: "Advanced",
          keywords: ["collapse", "details", `h${level}`],
          hint: `${"#".repeat(level)} >`,
          icon: Icon.Toggle,
          run: (e, r) => toggle(e, r, level),
        }),
      ),
    ];
  }

  export function filter(items: SlashItem[], query: string): SlashItem[] {
    const q = query.toLowerCase().trim();
    if (!q) {
      return items;
    }
    const matches = (item: SlashItem) => [item.title, ...(item.keywords ?? [])].some((word) => word.toLowerCase().includes(q));
    const starts = (item: SlashItem) => item.title.toLowerCase().startsWith(q);
    return items.filter(matches).toSorted((a, b) => Number(starts(b)) - Number(starts(a)));
  }

  function chain(editor: Editor, range: Range) {
    return editor.chain().focus().deleteRange(range);
  }

  // ends up selected either way, which makes a media block ask for its file straight away
  function insertBlock(editor: Editor, node: JSONContent) {
    const { $from } = editor.state.selection;
    const block = $from.parent;
    const empty = block.isTextblock && block.content.size === 0 && $from.depth > 0;
    const at = empty ? $from.before() : $from.depth > 0 ? $from.after() : $from.pos;
    editor
      .chain()
      .focus()
      .insertContentAt(empty ? { from: $from.before(), to: $from.after() } : at, node)
      .command(({ tr }) => {
        tr.setSelection(NodeSelection.create(tr.doc, at));
        return true;
      })
      .run();
  }

  function media(editor: Editor, range: Range, type: string) {
    chain(editor, range).run();
    insertBlock(editor, { type });
  }

  function toggle(editor: Editor, range: Range, level: number | null) {
    wrapLine(editor, range, (line) => ({
      type: "details",
      attrs: { level },
      content: [
        { type: "detailsSummary", content: line.content },
        { type: "detailsContent", content: [{ type: "paragraph" }] },
      ],
    }));
  }

  function wrapLine(editor: Editor, range: Range, build: (line: JSONContent) => JSONContent) {
    chain(editor, range).run();
    const { $from } = editor.state.selection;
    const from = $from.before();
    const line: JSONContent = { type: "paragraph", content: $from.parent.content.toJSON() ?? undefined };
    editor
      .chain()
      .insertContentAt({ from, to: $from.after() }, build(line))
      .command(({ tr }) => {
        let cursor: number | undefined;
        tr.doc.nodesBetween(from, tr.doc.content.size, (node, pos) => {
          if (cursor === undefined && node.isTextblock) cursor = pos + 1 + node.content.size;
          return cursor === undefined;
        });
        if (cursor !== undefined) tr.setSelection(TextSelection.create(tr.doc, cursor));
        return true;
      })
      .run();
  }
}

function groupBy(items: SlashItem[]): [SlashItem["group"], SlashItem[]][] {
  const groups = new Map<SlashItem["group"], SlashItem[]>();
  items.forEach((item) => groups.set(item.group, [...(groups.get(item.group) ?? []), item]));
  return [...groups.entries()];
}

const SlashMenu = forwardRef<SlashMenu.Handle, SuggestionProps<SlashItem, SlashItem>>(function SlashMenu({ items, query, command }, ref) {
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSelected(0), [items]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) {
        return false;
      }
      if (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey)) {
        setSelected((s) => (s + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) {
        setSelected((s) => (s - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        const item = items[selected];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  // with `allowSpaces`, an unmatched query with a space is more likely a sentence than a search
  if (items.length === 0 && query.includes(" ")) {
    return null;
  }

  let index = 0;
  return (
    <div ref={listRef} role="listbox" aria-label="blocks" className="z-50 max-h-[min(400px,40vh)] w-[324px] overflow-y-auto rounded-lg bg-c-surface p-1 shadow-popover">
      {items.length === 0 && <div className="px-3 py-2 text-sm text-c-dark-half">No results</div>}
      {groupBy(items).map(([group, groupItems]) => (
        <div key={group}>
          <div className="px-2 pt-2 pb-1 text-xs font-medium text-c-dark-half">{group}</div>
          {groupItems.map((item) => {
            const i = index++;
            return (
              <button
                key={item.title}
                role="option"
                aria-selected={i === selected}
                data-index={i}
                onMouseEnter={() => setSelected(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => command(item)}
                className={clsx("flex w-full items-center gap-2.5 rounded-md px-2 py-1 text-left text-sm", i === selected && "bg-c-hover")}
              >
                <span className="flex size-[22px] items-center justify-center rounded border border-c-hover bg-c-surface text-c-dark-full">
                  <item.icon className="size-4" />
                </span>
                <span className="flex-1">{item.title}</span>
                {item.hint && <span className="text-xs text-c-dark-half/70">{item.hint}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
});

namespace SlashMenu {
  export type Handle = {
    onKeyDown: (props: SuggestionKeyDownProps) => boolean;
  };
}
