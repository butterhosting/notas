import { EmojiPicker } from "@/website/comps/EmojiPicker";
import { Popover } from "@/website/comps/Popover";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewContent, NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { useState } from "react";
import { Directive } from "../markdown/Directive";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: () => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      icon: {
        default: "💡",
        parseHTML: (element) => element.getAttribute("data-icon"),
        renderHTML: ({ icon }) => ({ "data-icon": icon }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "callout" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },

  addCommands() {
    return {
      setCallout:
        () =>
        ({ commands }) =>
          commands.wrapIn(this.name),
    };
  },

  markdownTokenizer: Directive.container("callout"),

  parseMarkdown(token, h) {
    const content = h.parseChildren(token.tokens ?? []);
    return h.createNode("callout", { icon: (token as Directive.Token).attributes.icon ?? "💡" }, content.length ? content : [h.createNode("paragraph")]);
  },

  renderMarkdown(node, h) {
    return Directive.renderContainer("callout", node, h.renderChildren(node.content ?? [], "\n\n"), { attributes: { icon: node.attrs?.icon } });
  },
});

function CalloutView({ node, updateAttributes, editor }: NodeViewProps) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <NodeViewWrapper className="flex gap-2 rounded bg-c-callout py-4 pr-4 pl-3" data-type="callout">
      <button
        ref={setAnchor}
        contentEditable={false}
        disabled={!editor.isEditable}
        onClick={() => setOpen(true)}
        className="flex size-6 shrink-0 items-center justify-center rounded text-xl leading-none hover:bg-c-hover"
        aria-label="callout icon"
      >
        {node.attrs.icon}
      </button>
      {open && (
        <Popover anchor={anchor} onClose={() => setOpen(false)}>
          <EmojiPicker
            onSelect={(icon) => {
              updateAttributes({ icon });
              setOpen(false);
            }}
          />
        </Popover>
      )}
      <NodeViewContent className="callout-content min-w-0 flex-1" />
    </NodeViewWrapper>
  );
}
