import { Node } from "@tiptap/core";
import { NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer, useEditorState } from "@tiptap/react";
import { Directive } from "../markdown/Directive";

export const TableOfContents = Node.create({
  name: "toc",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="toc"]' }];
  },

  renderHTML() {
    return ["div", { "data-type": "toc" }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableOfContentsView);
  },

  markdownTokenizer: Directive.leaf("toc"),

  parseMarkdown(_token, h) {
    return h.createNode("toc");
  },

  renderMarkdown() {
    return Directive.renderLeaf("toc", {});
  },
});

function TableOfContentsView({ editor }: NodeViewProps) {
  const headings = useEditorState({
    editor,
    selector: ({ editor }) => {
      const result: { level: number; text: string; pos: number }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading") {
          result.push({ level: node.attrs.level, text: node.textContent, pos });
        }
      });
      return result;
    },
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
  const minLevel = Math.min(...headings.map(({ level }) => level));
  return (
    <NodeViewWrapper className="flex flex-col items-start text-sm" contentEditable={false}>
      {headings.length === 0 && <div className="text-c-dark-half">Add headings to create a table of contents.</div>}
      {headings.map(({ level, text, pos }) => (
        <button
          key={pos}
          className="w-full rounded py-1 text-left text-c-dark-full/70 underline decoration-c-dark-full/20 underline-offset-2 hover:bg-c-hover"
          style={{ paddingLeft: `${(level - minLevel) * 1.5}rem` }}
          onClick={() => (editor.view.nodeDOM(pos) as HTMLElement | null)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        >
          {text || "Untitled"}
        </button>
      ))}
    </NodeViewWrapper>
  );
}
