import { User } from "@/models/User";
import { useYesQuery } from "react-yesquery";
import { AuthClient } from "../clients/AuthClient";
import { DialogClient } from "../clients/DialogClient";
import { UserClient } from "../clients/UserClient";
import { Button } from "../comps/Button";
import { Lockup } from "../comps/Lockup";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useRegistry } from "../hooks/useRegistry";

export function adminPage() {
  useDocumentTitle("Users | Notas");
  const authClient = useRegistry(AuthClient);
  const userClient = useRegistry(UserClient);
  const dialogClient = useRegistry(DialogClient);
  const { data: users, reload } = useYesQuery({ queryFn: () => userClient.list() });

  async function create() {
    if ((await dialogClient.user()) !== "cancel") reload();
  }

  async function edit(user: User) {
    if ((await dialogClient.user(user)) !== "cancel") reload();
  }

  async function remove(user: User) {
    const result = await dialogClient.confirm({
      title: "Delete user",
      children: (
        <>
          This deletes <span className="font-semibold">{user.username}</span> with everything they own: their workspaces, every page in them and every file
          uploaded to them, also for whoever those were shared with. This can't be undone.
        </>
      ),
      confirm: "Delete user",
      typeToConfirm: user.username,
      action: () => userClient.delete(user.id),
    });
    if (result === "done") reload();
  }

  async function logout() {
    await authClient.logout();
    location.assign("/");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-8" />
          <div>
            <h1 className="text-2xl font-semibold">Users</h1>
            <p className="text-sm text-c-dark-half">Logged in as admin</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" theme="neutral" onClick={logout}>
            Log out
          </Button>
          <Button onClick={create}>New user</Button>
        </div>
      </header>
      <div className="overflow-hidden rounded-lg border border-c-border">
        {users?.length === 0 && <div className="px-4 py-10 text-center text-sm text-c-dark-half">No users yet: create the first one.</div>}
        {users?.map((user) => (
          <div key={user.id} data-testid="user-row" className="flex items-center gap-4 border-b border-c-border px-4 py-3 last:border-b-0">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-c-hover font-semibold uppercase">{user.username[0]}</div>
            <div className="flex flex-1 flex-col">
              <span className="font-medium">{user.username}</span>
              <span className="text-xs text-c-dark-half">Since {user.created.toLocaleString(undefined, { dateStyle: "medium" })}</span>
            </div>
            <Button variant="ghost" theme="neutral" onClick={() => edit(user)}>
              Edit
            </Button>
            <Button variant="ghost" theme="error" onClick={() => remove(user)}>
              Delete
            </Button>
          </div>
        ))}
      </div>
      <Lockup.Large className="mt-auto pt-16" />
    </main>
  );
}
