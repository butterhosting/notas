import { Page } from "@/models/Page";
import { Workspace } from "@/models/Workspace";
import { useEffect } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { DialogClient } from "../clients/DialogClient";
import { PageClient } from "../clients/PageClient";
import { PageIndexClient } from "../clients/PageIndexClient";
import { WorkspaceIndexClient } from "../clients/WorkspaceIndexClient";
import { Button } from "../comps/Button";
import { Frame } from "../comps/Frame";
import { Spinner } from "../comps/Spinner";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { usePageIndex } from "../hooks/usePageIndex";
import { useRegistry } from "../hooks/useRegistry";
import { useWorkspaces } from "../hooks/useWorkspaces";
import { Route } from "../Route";
import { documentPage } from "./document.page";

// where you left off, or the first page; only an empty workspace (or none) shows anything here
export function homePage() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const pageClient = useRegistry(PageClient);
  const pageIndexClient = useRegistry(PageIndexClient);
  const workspaceIndexClient = useRegistry(WorkspaceIndexClient);
  const dialogClient = useRegistry(DialogClient);
  const { workspaces, current } = useWorkspaces();
  const pages = usePageIndex();
  useDocumentTitle(current ? `${current.name} | Notas` : "Notas");

  useEffect(() => {
    if (workspaceId) workspaceIndexClient.select(workspaceId);
  }, [workspaceId]);

  if (workspaceId && !workspaces.some(({ id }) => id === workspaceId)) {
    return <Navigate to={Route.home()} replace />;
  }
  if (workspaceId && current?.id !== workspaceId) {
    return null;
  }

  async function createWorkspace() {
    const workspace = await dialogClient.workspace();
    if (workspace !== "cancel") {
      workspaceIndexClient.upsert(workspace);
      workspaceIndexClient.select(workspace.id);
      navigate(Route.workspace(workspace.id));
    }
  }

  async function createPage() {
    const page = await pageClient.create(current!.id, { title: "", icon: "📝" });
    pageIndexClient.upsert(Page.summarize(page));
    navigate(Route.page(page.id));
  }

  if (!current) {
    return (
      <Frame>
        <Empty icon="🗂️" title="No workspaces">
          <Button onClick={createWorkspace}>New workspace</Button>
        </Empty>
      </Frame>
    );
  }
  if (!pages) {
    return (
      <Frame>
        <div className="mt-32 flex justify-center">
          <Spinner />
        </div>
      </Frame>
    );
  }
  const last = localStorage.getItem(documentPage.LAST_VISITED);
  const target = pages.find(({ id }) => id === last) ?? PageIndexClient.children(pages, undefined)[0];
  if (target) {
    return <Navigate to={Route.page(target.id)} replace />;
  }
  return (
    <Frame>
      {Workspace.canWrite(current.role) ? (
        <Empty icon="📝" title="Nothing here yet">
          <Button onClick={createPage}>New page</Button>
        </Empty>
      ) : (
        <Empty icon="👀" title="Nothing here yet" text={`${current.owner.username} hasn't added any pages to ${current.name} yet.`} />
      )}
    </Frame>
  );
}

function Empty({ icon, title, text, children }: { icon: string; title: string; text?: string; children?: React.ReactNode }) {
  return (
    <div className="mt-40 flex flex-col items-center gap-4 text-center">
      <div className="text-5xl">{icon}</div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {text && <p className="max-w-md text-c-dark-half">{text}</p>}
      {children}
    </div>
  );
}
