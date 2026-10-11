import { Page } from "@/models/Page";
import { SearchResult } from "@/models/SearchResult";
import clsx from "clsx";
import { Fragment, useEffect, useRef, useState } from "react";
import { PageClient } from "../clients/PageClient";
import { usePageIndex } from "../hooks/usePageIndex";
import { useRegistry } from "../hooks/useRegistry";
import { useWorkspaces } from "../hooks/useWorkspaces";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

type Props = {
  close: () => void;
  done: (page: Page.Summary) => void;
};

export function SearchModal({ close, done }: Props) {
  const pageClient = useRegistry(PageClient);
  const workspace = useWorkspaces().current;
  const pages = usePageIndex() ?? [];
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>();
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults(undefined);
      return;
    }
    let current = true;
    const timer = setTimeout(() => workspace && pageClient.search(workspace.id, query).then((found) => current && setResults(found)), 120);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);

  const recent = pages
    .toSorted((a, b) => (b.updated ?? b.created).epochMilliseconds - (a.updated ?? a.created).epochMilliseconds)
    .slice(0, 8)
    .map((page): SearchResult => ({ object: "search_result", page, snippet: "" }));
  const items = results ?? recent;

  useEffect(() => setSelected(0), [results]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && items[selected]) {
      e.preventDefault();
      done(items[selected].page);
    }
  }

  return (
    <Modal isOpen issueCloseRequestWhenClickingBackdrop issueCloseRequestWhenPressingEscape onCloseRequest={close} className="top-[15%]! max-w-xl translate-y-0! overflow-hidden">
      <div className="flex items-center gap-2 border-b border-c-hover px-4">
        <Icon.Search className="size-[18px] text-c-dark-half" />
        <input
          autoFocus
          aria-label="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Search ${workspace?.name ?? "pages"}…`}
          className="h-12 flex-1 bg-transparent text-base outline-none"
        />
      </div>
      <div ref={listRef} role="listbox" aria-label="search results" className="max-h-[50vh] overflow-y-auto p-1.5">
        {!results && items.length > 0 && <div className="px-2 pt-1 pb-1.5 text-xs font-medium text-c-dark-half">Recent</div>}
        {results?.length === 0 && <div className="px-3 py-6 text-center text-sm text-c-dark-half">No results</div>}
        {items.map(({ page, snippet }, index) => (
          <button
            key={page.id}
            role="option"
            aria-selected={index === selected}
            data-index={index}
            onMouseMove={() => setSelected(index)}
            onClick={() => done(page)}
            className={clsx("flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left", index === selected && "bg-c-hover")}
          >
            <span className="flex w-5 shrink-0 justify-center pt-px">{page.icon ?? <Icon.Page className="size-[18px] text-c-dark-half" />}</span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {page.title || "Untitled"}
                <span className="ml-2 font-normal text-c-dark-half">{breadcrumb(pages, page)}</span>
              </span>
              {snippet && <span className="line-clamp-2 text-xs text-c-dark-half">{highlight(snippet)}</span>}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function breadcrumb(pages: Page.Summary[], page: Page.Summary): string {
  let parent = pages.find(({ id }) => id === page.parent);
  const path: string[] = [];
  while (parent) {
    path.unshift(parent.title || "Untitled");
    parent = pages.find(({ id }) => id === parent!.parent);
  }
  return path.join(" / ");
}

// matches arrive wrapped in control characters; an unpaired one (markdown stripping) just stays unhighlighted
function highlight(snippet: string) {
  return snippet.split(SearchResult.MARK_START).map((part, i) => {
    const [marked, rest] = i === 0 ? [undefined, part] : part.includes(SearchResult.MARK_END) ? part.split(SearchResult.MARK_END, 2) : [undefined, part];
    return (
      <Fragment key={i}>
        {marked !== undefined && <mark className="rounded-sm bg-c-mark text-inherit">{marked}</mark>}
        {rest?.replaceAll(SearchResult.MARK_END, "")}
      </Fragment>
    );
  });
}
