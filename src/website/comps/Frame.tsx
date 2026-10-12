import { Page } from "@/models/Page";
import { User } from "@/models/User";
import { Workspace } from "@/models/Workspace";
import clsx from "clsx";
import { ComponentProps, createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { AuthClient } from "../clients/AuthClient";
import { DialogClient } from "../clients/DialogClient";
import { PageClient } from "../clients/PageClient";
import { PageIndexClient } from "../clients/PageIndexClient";
import { ThemeClient } from "../clients/ThemeClient";
import { WorkspaceIndexClient } from "../clients/WorkspaceIndexClient";
import { usePageIndex } from "../hooks/usePageIndex";
import { useRegistry } from "../hooks/useRegistry";
import { useWorkspaces } from "../hooks/useWorkspaces";
import { Route } from "../Route";
import { Icon } from "./Icon";
import { DemoBanner } from "./DemoBanner";
import { Lockup } from "./Lockup";
import { Popover } from "./Popover";
import { RestrictedControls } from "./RestrictedControls";

type Props = ComponentProps<"main">;
export function Frame({ className, children, ...props }: Props) {
  const [drawer, setDrawer] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setDrawer(false), [pathname]);
  return (
    <div className="flex h-dvh flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <DemoBanner />
      <div className="flex min-h-0 flex-1">
        <Internal.Sidebar drawer={drawer} closeDrawer={() => setDrawer(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Internal.TopBar openDrawer={() => setDrawer(true)} />
          <main {...props} className={clsx("relative flex-1 overflow-y-auto", className)}>
            <div className="flex min-h-full flex-col">
              <div className="flex-1">{children}</div>
              <footer className="flex justify-center pt-24 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
                <Lockup.Small />
              </footer>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

namespace Internal {
  const EXPANDED = "notas.expanded";
  const WIDTH = "notas.sidebar-width";
  const WIDTHS = { min: 200, default: 240, max: 400 };

  type Drop = { target: string; where: "before" | "after" | "inside" };

  type Tree = {
    pages: Page.Summary[];
    canWrite: boolean;
    activeId?: string;
    expanded: Set<string>;
    toggle: (id: string, open?: boolean) => void;
    create: (parent?: string) => void;
    dragging?: string;
    setDragging: (id?: string) => void;
    drop?: Drop;
    setDrop: (drop?: Drop) => void;
    move: (drop: Drop) => void;
  };
  const TreeContext = createContext({} as Tree);

  function useSearch() {
    const navigate = useNavigate();
    const dialogClient = useRegistry(DialogClient);
    return async () => {
      const result = await dialogClient.search();
      if (result !== "cancel") navigate(Route.page(result.id));
    };
  }

  // phones only: the sidebar is a drawer there
  export function TopBar({ openDrawer }: { openDrawer: () => void }) {
    const { id } = useParams();
    const page = usePageIndex()?.find((summary) => summary.id === id);
    const { current } = useWorkspaces();
    const search = useSearch();
    return (
      <header className="hidden h-12 shrink-0 items-center gap-1 border-b border-c-border px-1.5 md:flex">
        <button aria-label="open sidebar" onClick={openDrawer} className="flex size-9 items-center justify-center rounded text-c-dark-half">
          <Icon.Menu className="size-5" />
        </button>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium">
          {page ? (
            <>
              {page.icon && <span className="shrink-0">{page.icon}</span>}
              <span className="truncate">{page.title || "Untitled"}</span>
            </>
          ) : (
            <span className="truncate">{current?.name}</span>
          )}
        </span>
        <button aria-label="search pages" onClick={search} className="flex size-9 items-center justify-center rounded text-c-dark-half">
          <Icon.Search className="size-5" />
        </button>
      </header>
    );
  }

  export function Sidebar({ drawer, closeDrawer }: { drawer: boolean; closeDrawer: () => void }) {
    const pages = usePageIndex() ?? [];
    const { current } = useWorkspaces();
    const canWrite = Workspace.canWrite(current?.role);
    const { id: activeId } = useParams();
    const navigate = useNavigate();
    const pageClient = useRegistry(PageClient);
    const pageIndexClient = useRegistry(PageIndexClient);
    const search = useSearch();
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem(EXPANDED) ?? "[]")));
    const [dragging, setDragging] = useState<string>();
    const [drop, setDrop] = useState<Drop>();
    const [width, setWidth] = useState(() => Sidebar.clampWidth(Number(localStorage.getItem(WIDTH)) || WIDTHS.default));

    useEffect(() => localStorage.setItem(WIDTH, String(width)), [width]);

    function startResize(e: React.PointerEvent) {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;
      const onMove = (move: PointerEvent) => setWidth(Sidebar.clampWidth(startWidth + move.clientX - startX));
      const onUp = () => {
        document.body.classList.remove("cursor-col-resize", "select-none");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      document.body.classList.add("cursor-col-resize", "select-none");
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    }

    useEffect(() => localStorage.setItem(EXPANDED, JSON.stringify([...expanded])), [expanded]);

    useEffect(() => {
      const ancestors = activeId ? PageIndexClient.ancestors(pages, activeId) : [];
      if (ancestors.some(({ id }) => !expanded.has(id))) {
        setExpanded((set) => new Set([...set, ...ancestors.map(({ id }) => id)]));
      }
    }, [activeId, pages.length]);

    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          search();
        }
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    async function create(parent?: string) {
      if (!current) return;
      const page = await pageClient.create(current.id, { parent });
      pageIndexClient.upsert(Page.summarize(page));
      if (parent) toggle(parent, true);
      navigate(Route.page(page.id));
    }

    function toggle(id: string, open?: boolean) {
      setExpanded((set) => {
        const next = new Set(set);
        (open ?? !next.has(id)) ? next.add(id) : next.delete(id);
        return next;
      });
    }

    async function move({ target, where }: Drop) {
      const page = pages.find(({ id }) => id === dragging);
      const anchor = pages.find(({ id }) => id === target);
      if (!page || !anchor) return;
      const patch = Sidebar.placement(pages, page, anchor, where);
      if (where === "inside") toggle(target, true);
      pageIndexClient.upsert({ ...page, ...patch, parent: patch.parent ?? undefined, position: patch.position ?? page.position });
      pageIndexClient.upsert(Page.summarize(await pageClient.update(page.id, patch)));
    }

    return (
      <>
        {drawer && <div aria-hidden onClick={closeDrawer} className="fixed inset-0 z-40 hidden bg-c-backdrop md:block" />}
        <aside
          aria-label="sidebar"
          style={{ width }}
          className={clsx(
            "relative flex shrink-0 flex-col bg-c-sidebar text-sm text-c-dark-full/80",
            "md:fixed md:inset-y-0 md:left-0 md:z-40 md:w-[min(85vw,320px)]! md:pt-[env(safe-area-inset-top)] md:pl-[env(safe-area-inset-left)] md:shadow-popover md:transition-[translate,visibility]",
            !drawer && "md:invisible md:-translate-x-full",
          )}
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="resize sidebar"
            aria-valuemin={WIDTHS.min}
            aria-valuemax={WIDTHS.max}
            aria-valuenow={width}
            onPointerDown={startResize}
            onDoubleClick={() => setWidth(WIDTHS.default)}
            className="group/resize absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize md:hidden"
          >
            <div className="mx-auto h-full w-0.5 bg-c-accent/0 transition-colors group-hover/resize:bg-c-accent/40" />
          </div>
          <div className="flex px-2 pt-2.5 pb-1">
            <WorkspaceSwitcher />
          </div>
          <div className="px-1.5">
            <button onClick={search} className="flex w-full items-center gap-2 rounded px-2 py-1 text-c-dark-half hover:bg-c-hover pointer-coarse:py-2">
              <Icon.Search className="size-4" />
              <span className="flex-1 text-left">Search</span>
              <kbd className="font-sans text-xs text-c-dark-half/70 pointer-coarse:hidden">⌘K</kbd>
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-1.5 pb-4">
            <div className="px-2 pt-4 pb-1 text-xs font-medium text-c-dark-half">Pages</div>
            <TreeContext.Provider value={{ pages, canWrite, activeId, expanded, toggle, create, dragging, setDragging, drop, setDrop, move }}>
              {PageIndexClient.children(pages, undefined).map((page) => (
                <TreeItem key={page.id} page={page} depth={0} />
              ))}
            </TreeContext.Provider>
            {canWrite && (
              <button onClick={() => create()} className="flex w-full items-center gap-2 rounded px-2 py-1 text-c-dark-half hover:bg-c-hover pointer-coarse:py-2">
                <Icon.Plus className="size-4" /> Add new
              </button>
            )}
            <Trash />
          </nav>
          <Footer />
        </aside>
      </>
    );
  }

  export namespace Sidebar {
    export function clampWidth(width: number): number {
      return Math.round(Math.min(WIDTHS.max, Math.max(WIDTHS.min, width)));
    }

    // onto a page: last inside it; beside one: between the two
    export function placement(pages: Page.Summary[], page: Page.Summary, anchor: Page.Summary, where: Drop["where"]) {
      if (where === "inside") {
        return { parent: anchor.id };
      }
      const siblings = PageIndexClient.children(pages, anchor.parent).filter(({ id }) => id !== page.id);
      const index = siblings.findIndex(({ id }) => id === anchor.id);
      const neighbour = siblings[where === "before" ? index - 1 : index + 1];
      const position = neighbour ? (anchor.position + neighbour.position) / 2 : anchor.position + (where === "before" ? -1 : 1);
      return { parent: anchor.parent ?? null, position };
    }
  }

  function TreeItem({ page, depth }: { page: Page.Summary; depth: number }) {
    const tree = useContext(TreeContext);
    const navigate = useNavigate();
    const pageClient = useRegistry(PageClient);
    const pageIndexClient = useRegistry(PageIndexClient);
    const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null);
    const [menu, setMenu] = useState(false);
    const children = PageIndexClient.children(tree.pages, page.id);
    const open = tree.expanded.has(page.id);
    const drop = tree.drop?.target === page.id ? tree.drop.where : undefined;

    async function trash() {
      setMenu(false);
      const ids = [page.id, ...Page.descendants(tree.pages, page.id)];
      await pageClient.trash(page.id);
      pageIndexClient.remove(ids);
      if (tree.activeId && ids.includes(tree.activeId)) navigate(Route.home());
    }

    function onDragOver(e: React.DragEvent) {
      const dragging = tree.dragging;
      if (!tree.canWrite) return;
      if (!dragging || dragging === page.id || Page.descendants(tree.pages, dragging).includes(page.id)) return;
      e.preventDefault();
      const { top, height } = e.currentTarget.getBoundingClientRect();
      const y = (e.clientY - top) / height;
      const where = y < 0.25 ? "before" : y > 0.75 ? "after" : "inside";
      if (tree.drop?.target !== page.id || tree.drop.where !== where) tree.setDrop({ target: page.id, where });
    }

    return (
      <>
        <div
          data-testid="sidebar-page"
          draggable={tree.canWrite}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", page.title);
            tree.setDragging(page.id);
          }}
          onDragEnd={() => {
            tree.setDragging(undefined);
            tree.setDrop(undefined);
          }}
          onDragOver={onDragOver}
          onDragLeave={() => tree.drop?.target === page.id && tree.setDrop(undefined)}
          onDrop={(e) => {
            e.preventDefault();
            if (tree.drop) tree.move(tree.drop);
            tree.setDrop(undefined);
          }}
          className={clsx(
            "group/item relative flex h-[30px] items-center gap-1 rounded pr-1 hover:bg-c-hover pointer-coarse:h-10",
            page.id === tree.activeId && "bg-c-hover font-medium text-c-dark-full",
            drop === "inside" && "bg-c-accent/15",
            tree.dragging === page.id && "opacity-40",
          )}
          style={{ paddingLeft: 4 + depth * 12 }}
        >
          {(drop === "before" || drop === "after") && (
            <div className={clsx("pointer-events-none absolute right-1 h-0.5 rounded bg-c-accent", drop === "before" ? "-top-px" : "-bottom-px")} style={{ left: 4 + depth * 12 }} />
          )}
          <button
            aria-label={open ? "collapse" : "expand"}
            onClick={() => tree.toggle(page.id)}
            className="flex size-5 shrink-0 items-center justify-center rounded text-c-dark-half hover:bg-c-hover pointer-coarse:size-7"
          >
            <Icon.Chevron className={clsx("size-3.5 transition-transform", open && "rotate-90")} />
          </button>
          <Link to={Route.page(page.id)} draggable={false} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="flex w-5 shrink-0 justify-center">{page.icon ?? <Icon.Page className="size-[18px] text-c-dark-half" />}</span>
            <span className="truncate">{page.title || "Untitled"}</span>
          </Link>
          <button
            ref={setMenuAnchor}
            aria-label="page actions"
            onClick={() => setMenu(true)}
            className={clsx("rounded p-0.5 text-c-dark-half hover:bg-c-hover group-hover/item:visible pointer-coarse:visible pointer-coarse:p-1.5", menu ? "visible" : "invisible")}
          >
            <Icon.More />
          </button>
          {tree.canWrite && (
            <button
              aria-label="add subpage"
              onClick={() => tree.create(page.id)}
              className="invisible rounded p-0.5 text-c-dark-half hover:bg-c-hover group-hover/item:visible pointer-coarse:visible pointer-coarse:p-1.5"
            >
              <Icon.Plus />
            </button>
          )}
          {menu && (
            <Popover anchor={menuAnchor} onClose={() => setMenu(false)} className="w-56 p-1 text-sm">
              <a href={pageClient.exportUrl(page.id)} onClick={() => setMenu(false)} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-c-hover">
                <Icon.Download className="size-4" /> Download as Markdown
              </a>
              {tree.canWrite && (
                <button onClick={trash} className="flex w-full items-center gap-2 rounded px-2 py-1 hover:bg-c-hover">
                  <Icon.Trash className="size-4" /> Move to trash
                </button>
              )}
            </Popover>
          )}
        </div>
        {open &&
          (children.length > 0 ? (
            children.map((child) => <TreeItem key={child.id} page={child} depth={depth + 1} />)
          ) : (
            <div className="py-1 text-c-dark-half/70" style={{ paddingLeft: 30 + (depth + 1) * 12 }}>
              No pages inside
            </div>
          ))}
      </>
    );
  }

  function WorkspaceSwitcher() {
    const navigate = useNavigate();
    const authClient = useRegistry(AuthClient);
    const dialogClient = useRegistry(DialogClient);
    const workspaceIndexClient = useRegistry(WorkspaceIndexClient);
    const { workspaces, current } = useWorkspaces();
    const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);
    const me = authClient.current;
    const own = workspaces.filter(({ role }) => role === "owner");
    const shared = workspaces.filter(({ role }) => role !== "owner");

    function go(workspace: Workspace) {
      setOpen(false);
      workspaceIndexClient.select(workspace.id);
      navigate(Route.workspace(workspace.id));
    }

    async function create() {
      setOpen(false);
      const workspace = await dialogClient.workspace();
      if (workspace !== "cancel") {
        workspaceIndexClient.upsert(workspace);
        go(workspace);
      }
    }

    async function settings() {
      setOpen(false);
      if (current && (await dialogClient.workspaceSettings(current)) !== "cancel") {
        await workspaceIndexClient.load();
        navigate(Route.home());
      }
    }

    async function account(user: User) {
      setOpen(false);
      const result = await dialogClient.account(user);
      if (result === "updated") location.reload();
      if (result === "deleted") location.assign(Route.home());
    }

    async function logout() {
      await authClient.logout();
      location.assign(Route.home());
    }

    const item = (workspace: Workspace) => (
      <button key={workspace.id} role="menuitem" onClick={() => go(workspace)} className="flex w-full items-start gap-2 rounded px-2 py-1 text-left hover:bg-c-hover">
        <WorkspaceIcon workspace={workspace} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">
            {workspace.name}
            {workspace.role === "read" && <span className="text-c-dark-half"> (read-only)</span>}
          </span>
          {workspace.role !== "owner" && <span className="truncate text-xs text-c-dark-half">{workspace.owner.username}</span>}
        </span>
        {workspace.id === current?.id && <span className="text-c-accent">✓</span>}
      </button>
    );

    return (
      <>
        <button
          ref={setAnchor}
          aria-label="workspaces"
          onClick={() => setOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1 font-semibold text-c-dark-full hover:bg-c-hover"
        >
          {current ? <WorkspaceIcon workspace={current} /> : <img src="/favicon.svg" alt="" className="size-5" />}
          <span className="flex-1 truncate text-left">{current?.name ?? "Notas"}</span>
          <Icon.Chevron className="size-3 shrink-0 rotate-90 text-c-dark-half" />
        </button>
        {open && (
          <Popover anchor={anchor} onClose={() => setOpen(false)} className="flex max-h-[70vh] w-72 flex-col overflow-y-auto p-1.5 text-sm" >
            {own.length > 0 && <div className="px-2 pt-1 pb-1 text-xs font-medium text-c-dark-half">Your workspaces</div>}
            {own.map(item)}
            {shared.length > 0 && <div className="px-2 pt-2.5 pb-1 text-xs font-medium text-c-dark-half">Shared with you</div>}
            {shared.map(item)}
            <div className="my-1.5 border-t border-c-border" />
            {current && (
              <button onClick={settings} className="flex w-full items-center gap-2 rounded px-2 py-1 hover:bg-c-hover">
                <Icon.More className="size-4" /> {current.role === "owner" ? "Workspace settings" : "Workspace info"}
              </button>
            )}
            <button onClick={create} className="flex w-full items-center gap-2 rounded px-2 py-1 hover:bg-c-hover">
              <Icon.Plus className="size-4" /> New workspace
            </button>
            <div className="my-1.5 border-t border-c-border" />
            {me?.kind === "user" && (
              <button onClick={() => account(me.user)} className="flex w-full items-center gap-2 rounded px-2 py-1 hover:bg-c-hover">
                <Icon.User className="size-4" /> My account <span className="text-c-dark-half">({me.user.username})</span>
              </button>
            )}
            <button onClick={logout} className="flex w-full items-center gap-2 rounded px-2 py-1 hover:bg-c-hover">
              <Icon.Logout className="size-4" /> Log out
            </button>
          </Popover>
        )}
      </>
    );
  }

  function WorkspaceIcon({ workspace }: { workspace: Workspace }) {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded bg-c-dark-full/10 text-xs font-semibold text-c-dark-full uppercase">
        {workspace.name.trim()[0] ?? "?"}
      </span>
    );
  }

  function Trash() {
    const navigate = useNavigate();
    const pageClient = useRegistry(PageClient);
    const pageIndexClient = useRegistry(PageIndexClient);
    const dialogClient = useRegistry(DialogClient);
    const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);
    const [pages, setPages] = useState<Page.Summary[]>();
    const [filter, setFilter] = useState("");
    const { current } = useWorkspaces();

    useEffect(() => {
      if (open && current) pageClient.listTrash(current.id).then(setPages);
    }, [open, current?.id]);

    async function restore(page: Page.Summary) {
      await pageClient.restore(page.id);
      setPages((list) => list?.filter(({ id }) => id !== page.id));
      // the socket brings the restored pages back into the tree; this just doesn't wait for it
      pageIndexClient.upsert({ ...page, deleted: undefined });
    }

    async function remove(page: Page.Summary) {
      setOpen(false);
      const result = await dialogClient.confirm({
        title: "Delete permanently",
        children: (
          <>
            Delete{" "}
            <span className="font-semibold">
              {page.icon} {page.title || "Untitled"}
            </span>{" "}
            and everything inside it for good? This can't be undone.
          </>
        ),
        confirm: "Delete",
        action: () => pageClient.delete(page.id),
      });
      if (result === "done") {
        setPages((list) => list?.filter(({ id }) => id !== page.id));
      }
    }

    const shown = pages?.filter(({ title }) => (title || "Untitled").toLowerCase().includes(filter.toLowerCase()));
    return (
      <>
        <button ref={setAnchor} onClick={() => setOpen(true)} className="mt-3 flex w-full items-center gap-2 rounded px-2 py-1 text-c-dark-half hover:bg-c-hover pointer-coarse:py-2">
          <Icon.Trash className="size-4" /> Trash
        </button>
        {open && (
          <Popover anchor={anchor} placement="right-end" onClose={() => setOpen(false)} className="flex max-h-[60vh] w-[400px] flex-col p-1.5 text-sm">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search pages in Trash"
              className="mb-1 rounded-md bg-c-hover px-2 py-1.5 outline-none focus:ring-2 focus:ring-c-accent/40"
            />
            <div aria-label="trash" className="overflow-y-auto">
              {shown?.length === 0 && <div className="px-2 py-6 text-center text-c-dark-half">{pages?.length ? "No matches" : "The trash is empty"}</div>}
              {shown?.map((page) => (
                <div key={page.id} data-testid="trash-page" className="group/trash flex items-center gap-1.5 rounded px-2 py-1 hover:bg-c-hover">
                  <button
                    onClick={() => {
                      setOpen(false);
                      navigate(Route.page(page.id));
                    }}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <span className="flex w-5 shrink-0 justify-center">{page.icon ?? <Icon.Page className="size-[18px] text-c-dark-half" />}</span>
                    <span className="truncate">{page.title || "Untitled"}</span>
                  </button>
                  {Workspace.canWrite(current?.role) && (
                    <button aria-label="restore" title="Restore" onClick={() => restore(page)} className="rounded p-1 text-c-dark-half hover:bg-c-hover">
                      <Icon.Restore />
                    </button>
                  )}
                  {current?.role === "owner" && (
                    <button aria-label="delete permanently" title="Delete permanently" onClick={() => remove(page)} className="rounded p-1 text-c-dark-half hover:bg-c-hover">
                      <Icon.Trash />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Popover>
        )}
      </>
    );
  }

  function Footer() {
    const { NOTAS_STAGE } = useRegistry("env");
    return (
      <footer className="flex flex-col gap-1.5 border-t border-c-hover px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-xs text-c-dark-half">
        <ThemeSwitch />
        {NOTAS_STAGE === "dev" && <RestrictedControls />}
      </footer>
    );
  }

  function ThemeSwitch() {
    const themeClient = useRegistry(ThemeClient);
    const preference = useSyncExternalStore(themeClient.subscribe, themeClient.snapshot);
    const icons = { system: Icon.Monitor, light: Icon.Sun, dark: Icon.Moon };
    return (
      <div role="radiogroup" aria-label="theme" className="flex rounded-md bg-c-hover p-0.5">
        {ThemeClient.PREFERENCES.map((option) => {
          const ThemeIcon = icons[option];
          return (
            <button
              key={option}
              role="radio"
              aria-checked={preference === option}
              aria-label={`${option} theme`}
              title={option[0]!.toUpperCase() + option.slice(1)}
              onClick={() => themeClient.set(option)}
              className={clsx(
                "flex h-6 flex-1 items-center justify-center rounded",
                preference === option ? "bg-c-surface text-c-dark-full shadow-sm" : "hover:text-c-dark-full",
              )}
            >
              <ThemeIcon className="size-3.5" />
            </button>
          );
        })}
      </div>
    );
  }
}
