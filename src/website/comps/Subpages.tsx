import { usePageIndex } from "../hooks/usePageIndex";
import { PageLinkRow } from "./PageLinkRow";

/** Shown, not stored: kept by the page index, it follows every page added, renamed, moved or trashed. */
export function Subpages({ parent }: { parent: string }) {
  // the index is in sidebar order already
  const children = usePageIndex()?.filter((page) => page.parent === parent) ?? [];
  if (children.length === 0) {
    return null;
  }
  return (
    <nav aria-label="subpages" className="mt-12 border-t border-c-border pt-4">
      <div className="mb-1 px-0.5 text-xs font-medium text-c-dark-half">Subpages</div>
      {children.map((page) => (
        <PageLinkRow key={page.id} page={page} />
      ))}
    </nav>
  );
}
