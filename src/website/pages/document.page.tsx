import { PageError } from "@/errors/PageError";
import { Page } from "@/models/Page";
import { Workspace } from "@/models/Workspace";
import { ProblemDetails } from "@/models/internal/ProblemDetails";
import { ServerMessage } from "@/socket/ServerMessage";
import { Editor as TiptapEditor } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";
import { useYesQuery } from "react-yesquery";
import { Link, useNavigate, useParams } from "react-router";
import { DialogClient } from "../clients/DialogClient";
import { PageClient } from "../clients/PageClient";
import { PageIndexClient } from "../clients/PageIndexClient";
import { WorkspaceIndexClient } from "../clients/WorkspaceIndexClient";
import { SocketClient } from "../clients/SocketClient";
import { Frame } from "../comps/Frame";
import { PageHeader } from "../comps/PageHeader";
import { Spinner } from "../comps/Spinner";
import { Editor } from "../editor/Editor";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { usePageIndex } from "../hooks/usePageIndex";
import { useRegistry } from "../hooks/useRegistry";
import { useWorkspaces } from "../hooks/useWorkspaces";
import { Route } from "../Route";

export function documentPage() {
  const { id } = useParams() as { id: string };
  const pageClient = useRegistry(PageClient);
  const socketClient = useRegistry(SocketClient);
  const { data: page, error, reload, getData } = useYesQuery<Page, ProblemDetails>({ queryFn: () => pageClient.find(id) }, [id]);

  useEffect(() => {
    localStorage.setItem(documentPage.LAST_VISITED, id);
  }, [id]);

  // until the workspace's pages are in, there's no telling where the page sits
  const workspaceIndexClient = useRegistry(WorkspaceIndexClient);
  const { current } = useWorkspaces();
  const pages = usePageIndex();
  useEffect(() => {
    if (page) workspaceIndexClient.select(page.workspace);
  }, [page?.workspace]);
  const ready = current?.id === page?.workspace && pages !== undefined;

  // trashed, restored or deleted elsewhere: follow suit
  useEffect(() => {
    const removed = socketClient.subscribe({ type: ServerMessage.Type.pages_removed, callback: ({ ids }) => ids.includes(id) && reload() });
    const changed = socketClient.subscribe({
      type: ServerMessage.Type.page_changed,
      // only a restore matters here; the body's own changes are the editor's business
      callback: ({ page }) => page.id === id && !page.deleted && getData()?.deleted && reload(),
    });
    return () => {
      socketClient.unsubscribe(removed);
      socketClient.unsubscribe(changed);
    };
  }, [id]);

  return (
    <Frame>
      {error ? (
        <div className="mt-32 flex flex-col items-center gap-3 text-c-dark-half">
          <span className="text-lg">This page doesn't exist, or was deleted.</span>
          <Link to={Route.home()} className="text-c-accent hover:underline">
            Go home
          </Link>
        </div>
      ) : page?.id === id && ready ? (
        <Document key={page.id} page={page} onRestore={reload} />
      ) : (
        <div className="mt-32 flex justify-center">
          <Spinner />
        </div>
      )}
    </Frame>
  );
}

export namespace documentPage {
  export const LAST_VISITED = "notas.last-visited";
}

type SaveState = "saved" | "saving" | "conflict" | "error";

function Document({ page, onRestore }: { page: Page; onRestore: () => void }) {
  const navigate = useNavigate();
  const pageClient = useRegistry(PageClient);
  const pageIndexClient = useRegistry(PageIndexClient);
  const socketClient = useRegistry(SocketClient);
  const dialogClient = useRegistry(DialogClient);
  const summary = usePageIndex()?.find(({ id }) => id === page.id);
  const role = useWorkspaces().current?.role;
  // the index leaves out the trash, and whatever is under a page in it
  const trash = page.deleted ? "trashed" : summary ? undefined : "under-trashed";
  const readOnly = Boolean(trash) || !Workspace.canWrite(role);
  const [title, setTitle] = useState(page.title);
  const [state, setState] = useState<SaveState>("saved");
  const editor = useRef<TiptapEditor>(null);
  useDocumentTitle(`${summary?.icon ? `${summary.icon} ` : ""}${title || "Untitled"} | Notas`);

  // debounced, one save at a time, each on the revision the last returned; a change from elsewhere replaces the
  // content only while nothing here is unsaved
  const body = useRef({
    revision: page.revision,
    remoteRevision: page.revision,
    // the latest body known here, saved or not: an update that changes nothing (as opening a page can) isn't saved
    latest: page.markdown,
    pending: undefined as string | undefined,
    saving: false,
  });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function flush() {
    clearTimeout(timer.current);
    const current = body.current;
    if (current.saving || current.pending === undefined) {
      return;
    }
    const markdown = current.pending;
    current.pending = undefined;
    current.saving = true;
    setState("saving");
    try {
      const updated = await pageClient.update(page.id, { markdown, revision: current.revision });
      current.revision = updated.revision;
      current.remoteRevision = Math.max(current.remoteRevision, updated.revision);
      pageIndexClient.upsert(Page.summarize(updated));
    } catch (e) {
      current.pending ??= markdown;
      setState(PageError.revision_conflict.matches(e) ? "conflict" : "error");
      return;
    } finally {
      current.saving = false;
    }
    if (current.pending !== undefined) {
      flush();
    } else if (current.remoteRevision > current.revision) {
      await loadRemote();
    } else {
      setState("saved");
    }
  }

  async function loadRemote() {
    const latest = await pageClient.find(page.id);
    body.current = { ...body.current, revision: latest.revision, remoteRevision: latest.revision, latest: latest.markdown, pending: undefined };
    if (editor.current && editor.current.getMarkdown() !== latest.markdown) {
      editor.current.commands.setContent(latest.markdown, { contentType: "markdown", emitUpdate: false });
    }
    setState("saved");
  }

  function keepMine() {
    body.current.revision = body.current.remoteRevision;
    setState("saving");
    flush();
  }

  useEffect(() => {
    const subscription = socketClient.subscribe({
      type: ServerMessage.Type.page_changed,
      callback: ({ page: changed }) => {
        const current = body.current;
        if (changed.id !== page.id || changed.revision <= current.remoteRevision) {
          return;
        }
        current.remoteRevision = changed.revision;
        if (current.saving) {
          // flush() looks again once the save in flight has landed
          return;
        }
        if (current.pending === undefined) {
          loadRemote();
        } else {
          setState("conflict");
        }
      },
    });
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (body.current.pending !== undefined || body.current.saving) e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      socketClient.unsubscribe(subscription);
      window.removeEventListener("beforeunload", beforeUnload);
      // leaving the page saves what's left, rather than waiting out the debounce
      flush();
    };
  }, [page.id]);

  // the title from elsewhere wins, unless it is being typed here
  useEffect(() => {
    if (summary && document.activeElement?.getAttribute("aria-label") !== "page title") {
      setTitle(summary.title);
    }
  }, [summary?.title]);

  // title on a short debounce, icon and cover at once; none need a revision
  const pendingTitle = useRef<{ title: string; timer: ReturnType<typeof setTimeout> }>(undefined);
  function changeTitle(next: string) {
    setTitle(next);
    clearTimeout(pendingTitle.current?.timer);
    pendingTitle.current = { title: next, timer: setTimeout(saveTitle, 300) };
  }
  function saveTitle() {
    if (pendingTitle.current) {
      clearTimeout(pendingTitle.current.timer);
      saveMeta({ title: pendingTitle.current.title });
      pendingTitle.current = undefined;
    }
  }
  async function saveMeta(patch: { title?: string; icon?: string | null; cover?: Page.Cover | null }) {
    const updated = await pageClient.update(page.id, patch);
    pageIndexClient.upsert(Page.summarize(updated));
  }
  useEffect(() => saveTitle, [page.id]);

  return (
    <article className="pb-24">
      {trash && (
        <div role="alert" className="sticky top-0 z-30 flex items-center justify-center gap-3 bg-[#eb5757] px-4 py-2 text-sm text-white">
          {trash === "trashed" ? (
            <>
              This page is in Trash.
              {Workspace.canWrite(role) && (
                <button
                  onClick={async () => {
                    await pageClient.restore(page.id);
                    onRestore();
                  }}
                  className="rounded border border-white/60 px-2 py-0.5 hover:bg-white/15"
                >
                  Restore page
                </button>
              )}
              {role === "owner" && (
                <button
                  onClick={async () => {
                    const result = await dialogClient.confirm(Document.confirmDelete(page, () => pageClient.delete(page.id)));
                    if (result === "done") navigate(Route.home());
                  }}
                  className="rounded border border-white/60 px-2 py-0.5 hover:bg-white/15"
                >
                  Delete permanently
                </button>
              )}
            </>
          ) : (
            "This page is inside a page that's in Trash."
          )}
        </div>
      )}
      <PageHeader
        title={title}
        icon={(summary ?? page).icon}
        cover={(summary ?? page).cover}
        readOnly={readOnly}
        autoFocus={!page.title && !page.markdown}
        onChange={(patch) => (patch.title !== undefined ? changeTitle(patch.title) : saveMeta(patch))}
        // focused right away: the command alone waits a frame, and what's typed in the meantime ends up in the title
        onEnter={() => {
          editor.current?.view.focus();
          editor.current?.commands.focus("start");
        }}
      />
      <div className="mx-auto w-full max-w-[900px] px-24 md:px-6">
        <Editor
          workspace={page.workspace}
          markdown={page.markdown}
          editable={!readOnly}
          onReady={(e) => (editor.current = e)}
          onChange={(markdown) => {
            if (markdown === body.current.latest) return;
            body.current.latest = markdown;
            body.current.pending = markdown;
            if (state === "saved") setState("saving");
            clearTimeout(timer.current);
            timer.current = setTimeout(flush, 500);
          }}
          createSubpage={async () => (await pageClient.create(page.workspace, { parent: page.id })).id}
          openPage={(id) => navigate(Route.page(id))}
        />
      </div>
      <SaveIndicator state={state} onReload={loadRemote} onKeepMine={keepMine} />
    </article>
  );
}

namespace Document {
  export function confirmDelete(page: Pick<Page, "title" | "icon">, action: () => Promise<unknown>) {
    return {
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
      action,
    };
  }
}

function SaveIndicator({ state, onReload, onKeepMine }: { state: SaveState; onReload: () => void; onKeepMine: () => void }) {
  if (state === "conflict") {
    return (
      <div role="alert" className="fixed top-3 right-4 z-40 flex items-center gap-3 rounded-lg bg-c-surface px-4 py-2 text-sm shadow-popover">
        This page was changed somewhere else.
        <button onClick={onReload} className="font-semibold text-c-accent">
          Load theirs
        </button>
        <button onClick={onKeepMine} className="font-semibold text-c-dark-half">
          Keep mine
        </button>
      </div>
    );
  }
  return (
    <div data-testid="save-state" data-state={state} className="fixed top-3 right-4 z-30 text-xs text-c-dark-half">
      {state === "saving" ? "Saving…" : state === "error" ? <span className="text-c-error">Not saved, will retry on the next change</span> : ""}
    </div>
  );
}
