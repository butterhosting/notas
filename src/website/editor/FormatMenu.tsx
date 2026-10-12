import { Icon } from "@/website/comps/Icon";
import { Editor, isTextSelection } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import clsx from "clsx";
import { ReactNode, useState } from "react";

export function FormatMenu({ editor }: { editor: Editor }) {
  const [linking, setLinking] = useState(false);
  const [href, setHref] = useState("");
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      strike: editor.isActive("strike"),
      code: editor.isActive("code"),
      link: editor.isActive("link"),
    }),
  });

  function applyLink() {
    const chain = editor.chain().focus().extendMarkRange("link");
    (href.trim() ? chain.setLink({ href: href.trim() }) : chain.unsetLink()).run();
    setLinking(false);
  }

  return (
    <BubbleMenu
      editor={editor}
      // below on touch screens, where the system's own selection menu sits above
      options={{ placement: matchMedia("(pointer: coarse)").matches ? "bottom" : "top", offset: 8 }}
      shouldShow={({ editor, state, from, to }) =>
        editor.isEditable && isTextSelection(state.selection) && from !== to && !state.selection.$from.parent.type.spec.code
      }
      className="z-40 flex items-center rounded-lg bg-c-surface p-1 shadow-popover"
    >
      {linking ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
        >
          <input
            autoFocus
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setLinking(false)}
            placeholder="Paste a link…"
            className="w-64 rounded bg-c-hover px-2 py-1 text-sm outline-none"
          />
          <Button onClick={applyLink}>{href.trim() ? "Link" : "Unlink"}</Button>
        </form>
      ) : (
        <>
          <Button label="bold" active={active.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
            <b>B</b>
          </Button>
          <Button label="italic" active={active.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <i className="font-serif">i</i>
          </Button>
          <Button label="underline" active={active.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <u>U</u>
          </Button>
          <Button label="strikethrough" active={active.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <s>S</s>
          </Button>
          <Button label="code" active={active.code} onClick={() => editor.chain().focus().toggleCode().run()}>
            <Icon.Code className="size-4" />
          </Button>
          <Button
            label="link"
            active={active.link}
            onClick={() => {
              setHref(editor.getAttributes("link").href ?? "");
              setLinking(true);
            }}
          >
            <Icon.Link className="size-4" />
          </Button>
        </>
      )}
    </BubbleMenu>
  );
}

function Button({ label, active, onClick, children }: { label?: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={clsx("flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-sm hover:bg-c-hover", active && "text-c-accent")}
    >
      {children}
    </button>
  );
}
