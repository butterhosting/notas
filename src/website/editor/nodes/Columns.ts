import { JSONContent, mergeAttributes, Node } from "@tiptap/core";
import { Directive } from "../markdown/Directive";

const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "column column+",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "columns" }), 0];
  },

  markdownTokenizer: Directive.container("columns"),

  // loose blocks become a column of their own; there are always at least two
  parseMarkdown(token, h) {
    const columns: JSONContent[] = [];
    let loose: JSONContent | undefined;
    for (const child of h.parseChildren(token.tokens ?? [])) {
      if (child.type === "column") {
        columns.push(child);
        loose = undefined;
      } else {
        if (!loose) columns.push((loose = h.createNode("column", {}, [])));
        loose.content!.push(child);
      }
    }
    while (columns.length < 2) {
      columns.push(h.createNode("column", {}, [h.createNode("paragraph")]));
    }
    return h.createNode("columns", {}, columns);
  },

  renderMarkdown(node, h) {
    return Directive.renderContainer("columns", node, h.renderChildren(node.content ?? [], "\n"));
  },
});

const Column = Node.create({
  name: "column",
  content: "block+",
  // backspace at the start of a column doesn't pull it into its neighbour
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "column" }), 0];
  },

  markdownTokenizer: Directive.container("column"),

  parseMarkdown(token, h) {
    const content = h.parseChildren(token.tokens ?? []);
    return h.createNode("column", {}, content.length ? content : [h.createNode("paragraph")]);
  },

  renderMarkdown(node, h) {
    return Directive.renderContainer("column", node, h.renderChildren(node.content ?? [], "\n\n"));
  },
});

export const ColumnsKit = [Columns, Column];
