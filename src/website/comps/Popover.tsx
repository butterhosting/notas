import { autoUpdate, computePosition, flip, offset, Placement, shift } from "@floating-ui/dom";
import clsx from "clsx";
import { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type Props = {
  anchor: HTMLElement | null;
  onClose: () => void;
  placement?: Placement;
  className?: string;
  children: ReactNode;
};

export function Popover({ anchor, onClose, placement = "bottom-start", className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!anchor || !element) {
      return;
    }
    let shown = false;
    return autoUpdate(anchor, element, () => {
      computePosition(anchor, element, { placement, middleware: [offset(6), flip(), shift({ padding: 8, crossAxis: true })] }).then(({ x, y }) => {
        Object.assign(element.style, { left: `${x}px`, top: `${y}px`, visibility: "visible" });
        // an `autoFocus` fires while the panel is still hidden, and a hidden input can't take focus
        if (!shown) {
          shown = true;
          element.querySelector<HTMLInputElement>("input:not([type=file])")?.focus();
        }
      });
    });
  }, [anchor, placement]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !anchor?.contains(target)) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      // positioned before it is shown, so it never flashes in the corner
      style={{ visibility: "hidden" }}
      className={clsx("absolute top-0 left-0 z-50 max-w-[calc(100vw-1rem)] rounded-lg bg-c-surface shadow-popover", className)}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
