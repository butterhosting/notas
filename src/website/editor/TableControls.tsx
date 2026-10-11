import { Icon } from "@/website/comps/Icon";
import { Popover } from "@/website/comps/Popover";
import { Editor } from "@tiptap/core";
import { TextSelection, Transaction } from "@tiptap/pm/state";
import { moveTableColumn, moveTableRow, TableMap } from "@tiptap/pm/tables";
import clsx from "clsx";
import { ReactNode, useEffect, useRef, useState } from "react";

type Hover = {
  table: HTMLElement;
  pos: number;
  row: number;
  col: number;
  rows: number;
  cols: number;
};

// Markdown tables have exactly one header row, the first: nothing goes above it, and deleting it promotes the next.
const GRIP = "absolute z-10 flex items-center justify-center rounded bg-c-surface text-c-dark-half shadow-popover hover:bg-c-hover";

export function TableControls({ editor, container }: { editor: Editor; container: HTMLElement | null }) {
  const [hover, setHover] = useState<Hover>();
  const [menu, setMenu] = useState<{ kind: "row" | "col"; anchor: HTMLElement }>();
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const menuRef = useRef(menu);
  menuRef.current = menu;

  const keep = () => clearTimeout(hideTimer.current);
  const hideSoon = () => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => !menuRef.current && setHover(undefined), 300);
  };

  useEffect(() => {
    if (!container) return;
    const onMouseMove = (e: MouseEvent) => {
      if (menuRef.current || !editor.isEditable || (e.target as HTMLElement).closest?.("[data-table-controls]")) return;
      const cell = (e.target as HTMLElement).closest?.("td, th") as HTMLTableCellElement | null;
      const found = cell && TableControls.locate(editor, cell);
      if (found) {
        keep();
        setHover(found);
      } else {
        hideSoon();
      }
    };
    container.addEventListener("mousemove", onMouseMove);
    container.addEventListener("mouseleave", hideSoon);
    return () => {
      container.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("mouseleave", hideSoon);
    };
  }, [editor, container]);

  // the table changes shape under the hover as rows and columns come and go
  useEffect(() => {
    const onUpdate = () => setHover((current) => current && TableControls.refresh(editor, current));
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
    };
  }, [editor]);

  if (!hover || !container || !hover.table.isConnected) {
    return null;
  }

  const box = container.getBoundingClientRect();
  const table = hover.table.getBoundingClientRect();
  const rowEl = hover.table.querySelectorAll("tr")[hover.row];
  const row = rowEl?.getBoundingClientRect();
  const col = rowEl?.children[hover.col]?.getBoundingClientRect();

  function run(row: number, col: number, command: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) {
    command(editor.chain().focus().command(TableControls.selectCell(hover!.pos, row, col))).run();
    setMenu(undefined);
  }

  function rowAction(action: "above" | "below" | "up" | "down" | "delete") {
    const { row: r, col: c, rows, pos } = hover!;
    if (action === "above") run(r, c, (chain) => chain.addRowBefore());
    if (action === "below") run(r, c, (chain) => chain.addRowAfter());
    if (action === "up" || action === "down") {
      editor.commands.command(TableControls.selectCell(pos, r, c));
      moveTableRow({ from: r, to: action === "up" ? r - 1 : r + 1, pos: pos + 1 })(editor.state, editor.view.dispatch);
      editor.view.focus();
      setMenu(undefined);
    }
    if (action === "delete" && rows > 1) {
      run(r, c, (chain) => (r === 0 ? chain.deleteRow().command(TableControls.selectCell(pos, 0, c)).toggleHeaderRow() : chain.deleteRow()));
    }
  }

  function colAction(action: "left" | "right" | "moveLeft" | "moveRight" | "delete") {
    const { row: r, col: c, cols, pos } = hover!;
    if (action === "left") run(r, c, (chain) => chain.addColumnBefore());
    if (action === "right") run(r, c, (chain) => chain.addColumnAfter());
    if (action === "moveLeft" || action === "moveRight") {
      editor.commands.command(TableControls.selectCell(pos, r, c));
      moveTableColumn({ from: c, to: action === "moveLeft" ? c - 1 : c + 1, pos: pos + 1 })(editor.state, editor.view.dispatch);
      editor.view.focus();
      setMenu(undefined);
    }
    if (action === "delete" && cols > 1) run(r, c, (chain) => chain.deleteColumn());
  }

  return (
    <div data-table-controls onMouseEnter={keep} onMouseLeave={hideSoon}>
      {row && (
        <button
          aria-label="row actions"
          onClick={(e) => setMenu({ kind: "row", anchor: e.currentTarget })}
          className={clsx(GRIP, "h-6 w-3")}
          style={{ left: table.left - box.left - 7, top: row.top - box.top + row.height / 2 - 12 }}
        >
          <Icon.Grip className="size-3" />
        </button>
      )}
      {col && (
        <button
          aria-label="column actions"
          onClick={(e) => setMenu({ kind: "col", anchor: e.currentTarget })}
          className={clsx(GRIP, "h-3 w-6")}
          style={{ left: col.left - box.left + col.width / 2 - 12, top: table.top - box.top - 7 }}
        >
          <Icon.Grip className="size-3 rotate-90" />
        </button>
      )}
      <AddBar
        axis="row"
        style={{ left: table.left - box.left, top: table.bottom - box.top + 4, width: table.width, height: 16 }}
        unit={row?.height ?? 36}
        // "last" as of the moment it's added: a drag adds several in a row
        add={() => run(Infinity, 0, (chain) => chain.addRowAfter())}
        removeLast={() => TableControls.removeLastIfEmpty(editor, hover.pos, "row")}
      />
      <AddBar
        axis="col"
        style={{ left: table.right - box.left + 4, top: table.top - box.top, width: 16, height: table.height }}
        unit={col?.width ?? 120}
        add={() => run(0, Infinity, (chain) => chain.addColumnAfter())}
        removeLast={() => TableControls.removeLastIfEmpty(editor, hover.pos, "col")}
      />
      {menu?.kind === "row" && (
        <Popover anchor={menu.anchor} placement="left-start" onClose={() => setMenu(undefined)} className="w-52 p-1 text-sm">
          <MenuItem disabled={hover.row === 0} onClick={() => rowAction("above")}>
            Insert above
          </MenuItem>
          <MenuItem onClick={() => rowAction("below")}>Insert below</MenuItem>
          <MenuItem disabled={hover.row < 2} onClick={() => rowAction("up")}>
            Move up
          </MenuItem>
          <MenuItem disabled={hover.row === 0 || hover.row === hover.rows - 1} onClick={() => rowAction("down")}>
            Move down
          </MenuItem>
          <MenuItem danger disabled={hover.rows < 2} onClick={() => rowAction("delete")}>
            Delete row
          </MenuItem>
        </Popover>
      )}
      {menu?.kind === "col" && (
        <Popover anchor={menu.anchor} placement="bottom-start" onClose={() => setMenu(undefined)} className="w-52 p-1 text-sm">
          <MenuItem onClick={() => colAction("left")}>Insert left</MenuItem>
          <MenuItem onClick={() => colAction("right")}>Insert right</MenuItem>
          <MenuItem disabled={hover.col === 0} onClick={() => colAction("moveLeft")}>
            Move left
          </MenuItem>
          <MenuItem disabled={hover.col === hover.cols - 1} onClick={() => colAction("moveRight")}>
            Move right
          </MenuItem>
          <MenuItem danger disabled={hover.cols < 2} onClick={() => colAction("delete")}>
            Delete column
          </MenuItem>
        </Popover>
      )}
    </div>
  );
}

export namespace TableControls {
  export function locate(editor: Editor, cell: HTMLTableCellElement): Hover | undefined {
    const table = cell.closest("table");
    const rowEl = cell.parentElement as HTMLTableRowElement | null;
    if (!table || !rowEl || !editor.view.dom.contains(table)) return;
    const $pos = editor.state.doc.resolve(editor.view.posAtDOM(cell, 0));
    for (let depth = $pos.depth; depth > 0; depth--) {
      if ($pos.node(depth).type.name === "table") {
        const map = TableMap.get($pos.node(depth));
        return { table, pos: $pos.before(depth), row: rowEl.rowIndex, col: cell.cellIndex, rows: map.height, cols: map.width };
      }
    }
  }

  export function refresh(editor: Editor, hover: Hover): Hover | undefined {
    const node = editor.state.doc.nodeAt(hover.pos);
    if (node?.type.name !== "table") return;
    const map = TableMap.get(node);
    const table = (editor.view.nodeDOM(hover.pos) as HTMLElement | null)?.querySelector("table") ?? (editor.view.nodeDOM(hover.pos) as HTMLElement);
    return { ...hover, table, rows: map.height, cols: map.width, row: Math.min(hover.row, map.height - 1), col: Math.min(hover.col, map.width - 1) };
  }

  // table commands act on the selected cell; even moveTableRow/moveTableColumn ignore their `pos` and use the selection
  export function selectCell(tablePos: number, row: number, col: number) {
    return ({ tr }: { tr: Transaction }) => {
      const table = tr.doc.nodeAt(tablePos);
      if (table?.type.name !== "table") return false;
      const map = TableMap.get(table);
      const cell = tablePos + 1 + map.positionAt(Math.min(row, map.height - 1), Math.min(col, map.width - 1), table);
      tr.setSelection(TextSelection.near(tr.doc.resolve(cell + 1)));
      return true;
    };
  }

  export function removeLastIfEmpty(editor: Editor, tablePos: number, axis: "row" | "col"): boolean {
    const table = editor.state.doc.nodeAt(tablePos);
    if (table?.type.name !== "table") return false;
    const map = TableMap.get(table);
    if ((axis === "row" ? map.height : map.width) < 2) return false;
    const last = axis === "row" ? map.height - 1 : map.width - 1;
    const cells = axis === "row" ? map.cellsInRect({ left: 0, right: map.width, top: last, bottom: last + 1 }) : map.cellsInRect({ left: last, right: last + 1, top: 0, bottom: map.height });
    if (cells.some((cell) => table.nodeAt(cell)!.textContent.trim() !== "")) return false;
    const chain = editor.chain().command(selectCell(tablePos, axis === "row" ? last : 0, axis === "row" ? 0 : last));
    return (axis === "row" ? chain.deleteRow() : chain.deleteColumn()).run();
  }
}

function AddBar({ axis, style, unit, add, removeLast }: { axis: "row" | "col"; style: React.CSSProperties; unit: number; add: () => void; removeLast: () => boolean }) {
  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    const start = axis === "row" ? e.clientY : e.clientX;
    let applied = 0;
    let moved = false;
    const onMove = (move: PointerEvent) => {
      const delta = Math.round(((axis === "row" ? move.clientY : move.clientX) - start) / unit);
      moved ||= delta !== 0;
      while (applied < delta) {
        add();
        applied++;
      }
      while (applied > delta && removeLast()) {
        applied--;
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!moved) add();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  return (
    <button
      aria-label={axis === "row" ? "add row" : "add column"}
      title={`Click to add a ${axis === "row" ? "row" : "column"}, drag to add or remove several`}
      onPointerDown={onPointerDown}
      className="absolute z-10 flex cursor-pointer items-center justify-center rounded bg-c-hover text-c-dark-half opacity-60 hover:opacity-100"
      style={style}
    >
      <Icon.Plus className="size-3" />
    </button>
  );
}

function MenuItem({ onClick, disabled, danger, children }: { onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={clsx("flex w-full items-center rounded px-2 py-1 text-left hover:bg-c-hover disabled:pointer-events-none disabled:opacity-40", danger && "text-c-error")}
    >
      {children}
    </button>
  );
}
