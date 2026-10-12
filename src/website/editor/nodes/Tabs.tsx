import { Icon } from "@/website/comps/Icon";
import { JSONContent, mergeAttributes, Node } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { NodeViewContent, NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer, useEditorState } from "@tiptap/react";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { Directive } from "../markdown/Directive";

// The open tab is a node attribute, never written to the markdown: switching tabs stores nothing and leaves no undo step.
const Tabs = Node.create({
  name: "tabs",
  group: "block",
  content: "tab+",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="tabs"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "tabs" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TabsView);
  },

  markdownTokenizer: Directive.container("tabs"),

  parseMarkdown(token, h) {
    const tabs: JSONContent[] = [];
    for (const child of h.parseChildren(token.tokens ?? [])) {
      if (child.type === "tab") {
        tabs.push(child);
      } else if (tabs.at(-1)) {
        tabs.at(-1)!.content!.push(child);
      } else {
        tabs.push(h.createNode("tab", { label: "Tab" }, [child]));
      }
    }
    if (tabs.length === 0) {
      tabs.push(h.createNode("tab", { label: "Tab" }, [h.createNode("paragraph")]));
    }
    tabs[0]!.attrs = { ...tabs[0]!.attrs, active: true };
    return h.createNode("tabs", {}, tabs);
  },

  renderMarkdown(node, h) {
    return Directive.renderContainer("tabs", node, h.renderChildren(node.content ?? [], "\n"));
  },
});

const Tab = Node.create({
  name: "tab",
  content: "block+",
  isolating: true,

  addAttributes() {
    return {
      label: {
        default: "Tab",
        parseHTML: (element) => element.getAttribute("data-label"),
        renderHTML: ({ label }) => ({ "data-label": label }),
      },
      active: {
        default: false,
        parseHTML: (element) => element.hasAttribute("data-active"),
        renderHTML: ({ active }) => (active ? { "data-active": "" } : { class: "hidden" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="tab"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "tab" }), 0];
  },

  markdownTokenizer: Directive.container("tab"),

  parseMarkdown(token, h) {
    const content = h.parseChildren(token.tokens ?? []);
    return h.createNode("tab", { label: (token as Directive.Token).labelText || "Tab" }, content.length ? content : [h.createNode("paragraph")]);
  },

  renderMarkdown(node, h) {
    return Directive.renderContainer("tab", node, h.renderChildren(node.content ?? [], "\n\n"), {
      label: Directive.escapeLabel(node.attrs?.label ?? "Tab"),
    });
  },
});

export const TabsKit = [Tabs, Tab];

const LABEL = "-mb-px flex items-center rounded-t px-2.5 py-1.5 text-sm";

function TabsView({ node, editor, getPos }: NodeViewProps) {
  const tabs: { label: string; active: boolean }[] = [];
  node.forEach((child) => tabs.push({ label: child.attrs.label, active: child.attrs.active }));
  const active = Math.max(0, tabs.findIndex((tab) => tab.active));
  const [renaming, setRenaming] = useState<number>();

  function childPos(index: number): number {
    let pos = getPos()! + 1;
    for (let i = 0; i < index; i++) pos += node.child(i).nodeSize;
    return pos;
  }

  // a click also moves the cursor in, since the cursor's tab is the open one; otherwise the first tab reopens
  function activate(index: number, { moveCursor = false } = {}) {
    const tr = editor.state.tr;
    tabs.forEach((_, i) => tr.setNodeAttribute(childPos(i), "active", i === index));
    if (moveCursor) tr.setSelection(TextSelection.near(tr.doc.resolve(childPos(index) + 1)));
    editor.view.dispatch(tr.setMeta("addToHistory", false));
    if (moveCursor) editor.view.focus();
  }

  function rename(index: number, label: string) {
    setRenaming(undefined);
    if (label.trim() && label !== tabs[index]!.label) {
      editor.view.dispatch(editor.state.tr.setNodeAttribute(childPos(index), "label", label.trim()));
    }
  }

  function add() {
    const end = getPos()! + node.nodeSize - 1;
    const tab = editor.schema.nodes.tab!.create({ label: `Tab ${tabs.length + 1}`, active: true }, editor.schema.nodes.paragraph!.create());
    const tr = editor.state.tr;
    tabs.forEach((_, i) => tr.setNodeAttribute(childPos(i), "active", false));
    tr.insert(end, tab).setSelection(TextSelection.create(tr.doc, end + 2));
    editor.view.dispatch(tr);
    setRenaming(tabs.length);
  }

  function remove(index: number) {
    if (tabs.length < 2) return;
    const from = childPos(index);
    const tr = editor.state.tr.delete(from, from + node.child(index).nodeSize);
    editor.view.dispatch(tr);
  }

  // whatever tab the cursor moves into, by keyboard or search, opens
  const selected = useEditorState({
    editor,
    selector: ({ editor }) => {
      const pos = getPos();
      const { from } = editor.state.selection;
      if (pos === undefined || from <= pos || from >= pos + node.nodeSize) return -1;
      let start = pos + 1;
      for (let i = 0; i < node.childCount; i++) {
        const end = start + node.child(i).nodeSize;
        if (from > start && from < end) return i;
        start = end;
      }
      return -1;
    },
  });
  useEffect(() => {
    if ((selected >= 0 && selected !== active) || !tabs.some((tab) => tab.active)) {
      activate(selected >= 0 ? selected : active);
    }
  }, [selected, active, tabs.length]);

  return (
    <NodeViewWrapper className="rounded-md border border-c-border" data-type="tabs">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-c-border px-1.5 pt-1.5" contentEditable={false} role="tablist">
        {tabs.map(({ label }, index) =>
          renaming === index ? (
            <input
              key={index}
              autoFocus
              defaultValue={label}
              aria-label="tab label"
              onBlur={(e) => rename(index, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") rename(index, e.currentTarget.value);
                if (e.key === "Escape") setRenaming(undefined);
              }}
              className={clsx(LABEL, "w-28 bg-c-surface text-c-dark-half outline-none")}
            />
          ) : (
            <button
              key={index}
              role="tab"
              aria-selected={index === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => activate(index, { moveCursor: true })}
              onDoubleClick={() => editor.isEditable && setRenaming(index)}
              className={clsx(LABEL, "group/tab hover:bg-c-hover", index === active ? "border-b-2 border-c-dark-full font-medium text-c-dark-full" : "text-c-dark-half")}
            >
              {label}
              {editor.isEditable && tabs.length > 1 && index === active && (
                <span
                  role="button"
                  aria-label="remove tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(index);
                  }}
                  className="ml-1 hidden rounded px-0.5 text-c-dark-half group-hover/tab:inline hover:bg-c-hover pointer-coarse:inline"
                >
                  ×
                </span>
              )}
            </button>
          ),
        )}
        {editor.isEditable && (
          <button aria-label="add tab" onClick={add} className={clsx(LABEL, "text-c-dark-half hover:bg-c-hover")}>
            <Icon.Plus className="size-3.5" />
          </button>
        )}
      </div>
      <NodeViewContent className="px-4 py-3" />
    </NodeViewWrapper>
  );
}
