import { Icon } from "@/website/comps/Icon";
import { Popover } from "@/website/comps/Popover";
import { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { useEffect, useRef, useState } from "react";

type Block = {
  pos: number;
  top: number;
  left: number;
  // just the grip: no room for both buttons
  compact: boolean;
};

export function BlockHandle({ editor, container }: { editor: Editor; container: HTMLElement | null }) {
  const [block, setBlock] = useState<Block>();
  const [menu, setMenu] = useState(false);
  const gripRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef(menu);
  menuRef.current = menu;

  useEffect(() => {
    if (!container) {
      return;
    }
    const onMouseMove = (e: MouseEvent) => {
      if (menuRef.current || !editor.isEditable || (e.target as HTMLElement).closest?.("[data-block-handle]")) {
        return;
      }
      setBlock(BlockHandle.find(editor, container, e.clientY));
    };
    const onMouseLeave = () => !menuRef.current && setBlock(undefined);
    const onKeyDown = () => !menuRef.current && setBlock(undefined);
    container.addEventListener("mousemove", onMouseMove);
    container.addEventListener("mouseleave", onMouseLeave);
    editor.view.dom.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("mouseleave", onMouseLeave);
      editor.view.dom.removeEventListener("keydown", onKeyDown);
    };
  }, [editor, container]);

  if (!block) {
    return null;
  }

  function select() {
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, block!.pos)));
  }

  function onDragStart(e: React.DragEvent) {
    const { view } = editor;
    select();
    const selection = view.state.selection as NodeSelection;
    const dom = view.nodeDOM(block!.pos) as HTMLElement | null;
    e.dataTransfer.effectAllowed = "copyMove";
    e.dataTransfer.setData("text/plain", selection.node.textContent);
    if (dom) e.dataTransfer.setDragImage(dom, 0, 0);
    // what ProseMirror's own drop handling reads: the node is removed from its old spot as it lands in the new one
    view.dragging = { slice: selection.content(), move: true, node: selection } as typeof view.dragging;
  }

  function addBelow() {
    const node = editor.state.doc.nodeAt(block!.pos);
    if (!node) return;
    if (node.isTextblock && node.content.size === 0) {
      editor.chain().focus().setTextSelection(block!.pos + 1).insertContent("/").run();
      return;
    }
    const at = block!.pos + node.nodeSize;
    editor.chain().focus().insertContentAt(at, { type: "paragraph" }).setTextSelection(at + 1).insertContent("/").run();
  }

  function duplicate() {
    const node = editor.state.doc.nodeAt(block!.pos);
    if (node) editor.chain().focus().insertContentAt(block!.pos + node.nodeSize, node.toJSON()).run();
    setMenu(false);
  }

  function remove() {
    select();
    editor.chain().focus().deleteSelection().run();
    setMenu(false);
    setBlock(undefined);
  }

  return (
    <div data-block-handle className="absolute z-10 flex items-center" style={{ top: block.top, left: block.left }}>
      {!block.compact && (
        <button aria-label="add block" onClick={addBelow} className="flex size-6 items-center justify-center rounded text-c-dark-half/70 hover:bg-c-hover">
          <Icon.Plus className="size-4" />
        </button>
      )}
      <button
        ref={gripRef}
        aria-label="drag block"
        draggable
        onDragStart={onDragStart}
        onDragEnd={() => (editor.view.dragging = null)}
        onClick={() => {
          select();
          setMenu(true);
        }}
        className="flex h-6 w-[18px] cursor-grab items-center justify-center rounded text-c-dark-half/70 hover:bg-c-hover"
      >
        <Icon.Grip className="size-3.5" />
      </button>
      {menu && (
        <Popover anchor={gripRef.current} placement="left-start" onClose={() => setMenu(false)} className="w-48 p-1 text-sm">
          <button onClick={duplicate} className="flex w-full items-center gap-2 rounded px-2 py-1 hover:bg-c-hover">
            <Icon.Page className="size-4" /> Duplicate
          </button>
          <button onClick={remove} className="flex w-full items-center gap-2 rounded px-2 py-1 text-c-error hover:bg-c-hover">
            <Icon.Trash className="size-4" /> Delete
          </button>
        </Popover>
      )}
    </div>
  );
}

export namespace BlockHandle {
  const HANDLED_PARENTS = new Set(["doc", "callout", "detailsContent", "column", "tab"]);
  const HANDLED_TYPES = new Set(["listItem", "taskItem"]);

  export function find(editor: Editor, container: HTMLElement, clientY: number): Block | undefined {
    const { view } = editor;
    const bounds = view.dom.getBoundingClientRect();
    const hit = view.posAtCoords({ left: bounds.left + Math.min(60, bounds.width / 2), top: clientY });
    if (!hit) {
      return;
    }
    const $pos = view.state.doc.resolve(hit.inside >= 0 ? hit.inside : hit.pos);
    const candidates: number[] = [];
    for (let depth = 1; depth <= $pos.depth; depth++) {
      const node = $pos.node(depth);
      if (HANDLED_TYPES.has(node.type.name) || HANDLED_PARENTS.has($pos.node(depth - 1).type.name)) {
        candidates.push($pos.before(depth));
      }
    }
    if ($pos.nodeAfter && hit.inside >= 0 && HANDLED_PARENTS.has($pos.parent.type.name)) {
      candidates.push($pos.pos);
    }
    const pos = candidates.at(-1);
    const dom = pos === undefined ? null : (view.nodeDOM(pos) as HTMLElement | null);
    if (pos === undefined || !dom?.getBoundingClientRect) {
      return;
    }
    const rect = dom.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    const style = getComputedStyle(dom);
    const lineHeight = parseFloat(style.lineHeight) || 24;
    // centred on the block's first line
    const top = rect.top - box.top + parseFloat(style.paddingTop || "0") + (Math.min(lineHeight, rect.height) - 24) / 2;
    const { left, compact } = anchor(view.state.doc.nodeAt(pos)?.type.name, view.state.doc.resolve(pos).parent.type.name, dom, rect);
    return { pos, top, left: left - box.left - (compact ? 22 : 46), compact };
  }

  // moves the handle out past a list marker, callout icon or toggle arrow, which it would otherwise cover
  function anchor(type: string | undefined, parent: string, dom: HTMLElement, rect: DOMRect): { left: number; compact: boolean } {
    const leftOf = (element: Element | null) => element?.getBoundingClientRect().left ?? rect.left;
    if (HANDLED_TYPES.has(type ?? "")) return { left: leftOf(dom.parentElement), compact: false };
    if (parent === "callout") return { left: leftOf(dom.closest(".callout")), compact: false };
    if (parent === "detailsContent") return { left: leftOf(dom.closest('[data-type="details"]')), compact: false };
    return { left: rect.left, compact: parent === "column" };
  }
}
