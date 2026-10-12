import { ProblemDetails } from "@/models/internal/ProblemDetails";
import { MediaClient } from "@/website/clients/MediaClient";
import { useRegistry } from "@/website/hooks/useRegistry";
import { Editor as TiptapEditor } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { EditorView } from "@tiptap/pm/view";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { BlockHandle } from "./BlockHandle";
import { EditorExtensions } from "./EditorExtensions";
import { FormatMenu } from "./FormatMenu";
import { Media } from "./nodes/Media";
import { SlashCommand } from "./SlashCommand";
import { TableControls } from "./TableControls";

type Props = SlashCommand.Actions & {
  workspace: string;
  markdown: string;
  editable?: boolean;
  onChange: (markdown: string) => void;
  onReady?: (editor: TiptapEditor) => void;
};

// `markdown` is only read once; later outside changes go through the editor `onReady` hands out
export function Editor({ workspace, markdown, editable = true, onChange, onReady, ...actions }: Props) {
  const mediaClient = useRegistry(MediaClient);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [uploads, setUploads] = useState<{ name: string; progress: number; error?: string }[]>([]);
  const latest = useRef({ onChange, actions, workspace });
  latest.current = { onChange, actions, workspace };

  function uploadFiles(view: EditorView, files: File[], pos: number) {
    for (const file of files) {
      const update = (patch: Partial<(typeof uploads)[number]>) =>
        setUploads((list) => list.map((upload) => (upload.name === file.name ? { ...upload, ...patch } : upload)));
      setUploads((list) => [...list, { name: file.name, progress: 0 }]);
      mediaClient
        .upload(latest.current.workspace, file, (progress) => update({ progress }))
        .then((media) => {
          const { doc } = view.state;
          const $pos = doc.resolve(Math.min(pos, doc.content.size));
          const at = $pos.depth === 0 ? $pos.pos : $pos.after(1);
          const node = view.state.schema.nodes[Media.kindOf(media.mime)]!.create(Media.attributesOf(media));
          view.dispatch(view.state.tr.insert(at, node));
          setUploads((list) => list.filter((upload) => upload.name !== file.name));
        })
        .catch((e) => update({ error: ProblemDetails.isInstance(e) ? e.problem : String(e) }));
    }
  }

  const editor = useEditor({
    extensions: [
      ...EditorExtensions.CONTENT,
      Markdown.configure({ indentation: { style: "space", size: 2 } }),
      // every empty block gets a hint; the stylesheet decides which show
      Placeholder.configure({
        includeChildren: true,
        showOnlyCurrent: false,
        emptyNodeClass: ({ hasAnchor }) => (hasAnchor ? "is-empty is-current" : "is-empty"),
        placeholder: ({ node }) => {
          if (node.type.name === "heading") return `Heading ${node.attrs.level}`;
          if (node.type.name === "detailsSummary") return "Toggle";
          return "Write something, or press '/' for commands…";
        },
      }),
      SlashCommand.extension.configure({
        items: SlashCommand.items({
          createSubpage: () => latest.current.actions.createSubpage(),
          openPage: (id) => latest.current.actions.openPage(id),
        }),
      }),
    ],
    content: markdown,
    contentType: "markdown",
    editable,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: "notas-editor", "aria-label": "page content" },
      handleDrop: (view, event, _slice, moved) => {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (moved || files.length === 0) return false;
        event.preventDefault();
        uploadFiles(view, files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.doc.content.size);
        return true;
      },
      handlePaste: (view, event) => {
        const files = [...(event.clipboardData?.files ?? [])];
        if (files.length === 0) return false;
        uploadFiles(view, files, view.state.selection.from);
        return true;
      },
    },
    // drops the trailing empty line the editor keeps to click into
    onUpdate: ({ editor }) => latest.current.onChange(editor.getMarkdown().trimEnd()),
  });

  useEffect(() => {
    if (editor) onReady?.(editor);
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  return (
    // the padding is the block handle's gutter, which has to count as hovering the editor
    <div ref={setContainer} className="relative -ml-14 pl-14 md:-ml-6 md:pl-6">
      <EditorContent editor={editor} />
      {editor && <BlockHandle editor={editor} container={container} />}
      {editor && <FormatMenu editor={editor} />}
      {editor && <TableControls editor={editor} container={container} />}
      {uploads.length > 0 && (
        <div className="fixed right-4 bottom-4 z-40 flex w-72 flex-col gap-2">
          {uploads.map(({ name, progress, error }) => (
            <div key={name} className="rounded-lg bg-c-surface px-3 py-2 text-sm shadow-popover">
              <div className="truncate">{name}</div>
              {error ? (
                <div className="flex justify-between text-c-error">
                  {error}
                  <button onClick={() => setUploads((list) => list.filter((upload) => upload.name !== name))}>Dismiss</button>
                </div>
              ) : (
                <div className="mt-1 h-1 rounded bg-c-hover">
                  <div className="h-1 rounded bg-c-accent transition-[width]" style={{ width: `${progress * 100}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
