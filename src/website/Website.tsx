import { Me } from "@/models/Me";
import { useEffect, useState } from "react";
import { createBrowserRouter, replace, RouterProvider } from "react-router";
import { ClientRegistry } from "./ClientRegistry";
import { AuthClient } from "./clients/AuthClient";
import { DialogClient } from "./clients/DialogClient";
import { PageIndexClient } from "./clients/PageIndexClient";
import { SocketClient } from "./clients/SocketClient";
import { ThemeClient } from "./clients/ThemeClient";
import { WorkspaceIndexClient } from "./clients/WorkspaceIndexClient";
import { DialogManager } from "./comps/DialogManager";
import { adminPage } from "./pages/admin.page";
import { documentPage } from "./pages/document.page";
import { homePage } from "./pages/home.page";
import { loginPage } from "./pages/login.page";
import { Route } from "./Route";

const router = createBrowserRouter([
  {
    path: Route.home(),
    Component: homePage,
  },
  {
    path: Route.workspace(":workspaceId"),
    Component: homePage,
  },
  {
    path: Route.page(":id"),
    Component: documentPage,
  },
  {
    path: "*",
    loader: () => replace(Route.home()),
  },
]);

const LoginPage = loginPage;
const AdminPage = adminPage;

export function Website() {
  const [clientRegistry, setClientRegistry] = useState<ClientRegistry>();
  const [me, setMe] = useState<Me | null>();

  async function enter(registry: ClientRegistry, me: Me | undefined) {
    if (me?.kind === "user") {
      registry.get(SocketClient).connect();
      await registry.get(WorkspaceIndexClient).connect();
      await registry.get(PageIndexClient).connect();
    }
    setMe(me ?? null);
  }

  useEffect(() => {
    ClientRegistry.bootstrap().then(async (registry) => {
      registry.get(ThemeClient).connect();
      setClientRegistry(registry);
      await enter(registry, await registry.get(AuthClient).me());
    });
  }, []);

  // a 401 once in: the session ended (expired, or the password changed)
  useEffect(() => {
    if (!me) return;
    const onUnauthorized = () => location.reload();
    window.addEventListener(ClientRegistry.UNAUTHORIZED, onUnauthorized);
    return () => window.removeEventListener(ClientRegistry.UNAUTHORIZED, onUnauthorized);
  }, [me]);

  if (!clientRegistry || me === undefined) {
    return null;
  }
  return (
    <ClientRegistry.Context.Provider value={clientRegistry}>
      {me === null && <LoginPage onLogin={(next) => enter(clientRegistry, next)} />}
      {me?.kind === "admin" && <AdminPage />}
      {me?.kind === "user" && <RouterProvider router={router} />}
      <DialogManager ref={(m) => clientRegistry.get(DialogClient).initialize(m)} />
    </ClientRegistry.Context.Provider>
  );
}
