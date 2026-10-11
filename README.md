# Notas

A small, self-hosted Notion: a tree of pages with covers, emoji icons, and a block editor, where every page is
**markdown** underneath.

## The format

Whatever markdown can express is stored as plain markdown (headings, lists, to-dos, quotes, code, tables, images).
Blocks markdown has no syntax for are stored as
[generic directives](https://talk.commonmark.org/t/generic-directives-plugins-syntax/444):

```markdown
::video{src="/media/0199…/clip.mp4"}
::embed{src="https://www.youtube.com/watch?v=…"}
::audio{src="/media/0199…/memo.m4a"}
::file{src="/media/0199…/report.pdf" name="report.pdf" size="12345"}
::toc
::page{id="0199…"}

:::callout{icon="💡"}
Any **markdown** in here.
:::

::::toggle[A summary, with *inline* markdown]{level="2"}
:::callout{icon="📦"}
Containers nest; the outer fence is the longer one.
:::
::::

::::columns
:::column
Left
:::
:::column
Right
:::
::::

::::tabs
:::tab[Overview]
A tab label is plain text; `\[`, `\]` and `\\` escape.
:::
:::tab[Details]
…
:::
::::
```

A page's title, icon and cover are stored beside its body, and become frontmatter when a page is downloaded as a
markdown file.

## Accounts

`admin` logs in with the password from `NOTAS_ADMIN_PASSWORD`, a bcrypt hash, and can only manage users. Every user
starts with a "Personal Workspace", can create more, and can share each one by username, to read or to write. Only a
workspace's owner can rename, share or delete it, or empty its trash.

```sh
# a hash for the admin's password
bun -e 'console.log(await Bun.password.hash(prompt("password:"), "bcrypt"))'
```

As an environment variable (docker, compose's `environment:`), the hash goes in as is; compose itself expands `$`, so
there every `$` is doubled (`$$`). Written in one of the `.env.*` files instead, every `$` needs escaping as `\$`:
`bun --env-file` expands `$` even in quotes. A mangled hash stops the app at startup, with a message saying so.

Logged in, a session cookie lasts 30 days from last use. Every authenticated request also accepts an
`Authorization: Basic` header with a user's (or the admin's) username and password, for a proxy doing single sign-on
that adds it to each request; checked passwords are remembered for 10 minutes, keyed by a hash of the header, so bcrypt
doesn't run on every request.

## API

| Resource                | Routes                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Session                 | `POST /api/session` (log in), `GET` (who am I), `DELETE` (log out)                       |
| Users (admin only)      | `GET`, `POST /api/users`; `PATCH`, `DELETE /api/users/:id`                               |
| Workspaces              | `GET`, `POST /api/workspaces`; `GET`, `PATCH`, `DELETE /api/workspaces/:id`              |
| Members                 | `GET`, `POST /api/workspaces/:id/members`; `PATCH`, `DELETE …/members/:user`             |
| Pages                   | `GET` (`?deleted=true` for the trash), `POST /api/workspaces/:id/pages`                   |
| A page                  | `GET`, `PATCH` (`{ "deleted": true/false }` trashes or restores), `DELETE /api/pages/:id` |
| Search, upload, export  | `GET /api/workspaces/:id/search?q=`, `POST /api/workspaces/:id/media?filename=`, `GET /api/pages/:id/markdown` |

Uploaded files are served at `/media/:id/:filename`, to members of their workspace only.

## Data

Everything lives under `NOTAS_ROOT` (`/opt/notas` in production):

```
/opt/notas/
└── data/
    ├── db.sqlite                     users, sessions, workspaces, pages, media metadata
    └── media/<workspace>/<id>/<file> uploads, as uploaded
```

An upload stays as long as some page links to it, in its text or as its cover, trashed pages included. A day after the
last link goes (a removed block, a replaced cover, a page deleted for good), a sweep every 10 minutes deletes it, from
disk and database. The day leaves room for an undo, or for a block cut from one page and pasted into another. Deleting
a workspace or a user removes their files at once.

## Development

```sh
bun install
bun start:dev        # http://localhost:3000, then "Seed" in the sidebar footer
bun tc && bun lint && bun test:unit
bun e2e:headless     # against the production image
```

Seeded: `kim` / `possible`, `ron` / `stoppable` (who shares "Recipes" with kim, to read); the admin is `admin` /
`admin` in dev and e2e.
