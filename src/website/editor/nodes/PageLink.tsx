import { Icon } from "@/website/comps/Icon";
import { PageLinkRow } from "@/website/comps/PageLinkRow";
import { usePageIndex } from "@/website/hooks/usePageIndex";
import { Node } from "@tiptap/core";
import { NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Directive } from "../markdown/Directive";

export const PageLink = Node.create({
  name: "pageLink",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return { id: { default: null } };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="page-link"]' }];
  },

  renderHTML() {
    return ["div", { "data-type": "page-link" }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageLinkView);
  },

  markdownTokenName: "page",

  markdownTokenizer: Directive.leaf("page"),

  parseMarkdown(token, h) {
    return h.createNode("pageLink", { id: (token as Directive.Token).attributes.id ?? null });
  },

  renderMarkdown(node) {
    return Directive.renderLeaf("page", { id: node.attrs?.id });
  },
});

function PageLinkView({ node }: NodeViewProps) {
  const page = usePageIndex()?.find(({ id }) => id === node.attrs.id);
  return (
    <NodeViewWrapper contentEditable={false}>
      {page ? (
        <PageLinkRow page={page} />
      ) : (
        <span className="text-c-dark-half">
          <Icon.Page className="inline size-5" /> Deleted page
        </span>
      )}
    </NodeViewWrapper>
  );
}
