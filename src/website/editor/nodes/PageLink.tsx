import { usePageIndex } from "@/website/hooks/usePageIndex";
import { Icon } from "@/website/comps/Icon";
import { Route } from "@/website/Route";
import { Node } from "@tiptap/core";
import { NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Link } from "react-router";
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
        <Link to={Route.page(page.id)} className="flex items-center gap-1.5 rounded px-0.5 py-1 font-medium no-underline hover:bg-c-hover">
          {page.icon ? <span className="w-5 text-center">{page.icon}</span> : <Icon.Page className="size-5 text-c-dark-half" />}
          <span className="underline decoration-c-dark-half/40 underline-offset-2">{page.title || "Untitled"}</span>
        </Link>
      ) : (
        <span className="text-c-dark-half">
          <Icon.Page className="inline size-5" /> Deleted page
        </span>
      )}
    </NodeViewWrapper>
  );
}
