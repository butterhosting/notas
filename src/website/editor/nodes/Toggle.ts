import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import { JSONContent } from "@tiptap/core";
import { Directive } from "../markdown/Directive";

// tiptap's `details`, stored as `:::toggle[summary]`; a `level` makes it a toggle heading
const Toggle = Details.extend({
  markdownTokenName: "toggle",

  addAttributes() {
    return {
      ...this.parent?.(),
      level: {
        default: null,
        parseHTML: (element) => Number(element.getAttribute("data-level")) || null,
        renderHTML: ({ level }) => (level ? { "data-level": level } : {}),
      },
    };
  },

  markdownTokenizer: Directive.container("toggle", "details"),

  parseMarkdown(token, h) {
    const { attributes, label } = token as Directive.Token;
    const content = h.parseChildren(token.tokens ?? []);
    return h.createNode("details", { level: Number(attributes.level) || null }, [
      h.createNode("detailsSummary", {}, h.parseInline(label ?? [])),
      h.createNode("detailsContent", {}, content.length ? content : [h.createNode("paragraph")]),
    ]);
  },

  renderMarkdown(node, h) {
    const [summary, content] = (node.content ?? []) as [JSONContent?, JSONContent?];
    return Directive.renderContainer("toggle", node, h.renderChildren(content?.content ?? [], "\n\n"), {
      label: h.renderChildren(summary?.content ?? []),
      attributes: { level: node.attrs?.level },
    });
  },
}).configure({ persist: false, HTMLAttributes: { class: "toggle" } });

export const ToggleKit = [Toggle, DetailsSummary, DetailsContent];
