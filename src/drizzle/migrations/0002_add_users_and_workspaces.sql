-- usernames are stored lower-cased, so unique means unique regardless of case
create table user (
    id text primary key,
    username text not null unique,
    password_hash text not null,
    created text not null,
    updated text
);
--> statement-breakpoint
-- the id is a sha-256 of the token in the cookie, so a copy of the database holds no usable session
create table session (
    id text primary key,
    -- null for the admin, who has no row in `user`
    user text references user (id) on delete cascade,
    expires text not null,
    created text not null
);
--> statement-breakpoint
create index session_user on session (user);
--> statement-breakpoint
-- a name only has to be unique among its owner's workspaces
create table workspace (
    id text primary key,
    owner text not null references user (id) on delete cascade,
    name text not null,
    created text not null,
    updated text,
    unique (owner, name)
);
--> statement-breakpoint
-- the owner has no membership; theirs is implied
create table membership (
    workspace text not null references workspace (id) on delete cascade,
    user text not null references user (id) on delete cascade,
    role text not null check (role in ('read', 'write')),
    created text not null,
    primary key (workspace, user)
);
--> statement-breakpoint
create index membership_user on membership (user);
--> statement-breakpoint
-- pages and media now belong to a workspace; what existed before belonged to no one, and starts over
drop trigger page_search_insert;
--> statement-breakpoint
drop trigger page_search_delete;
--> statement-breakpoint
drop trigger page_search_update;
--> statement-breakpoint
drop table page_search;
--> statement-breakpoint
drop table page;
--> statement-breakpoint
drop table media;
--> statement-breakpoint
create table page (
    id text primary key,
    workspace text not null references workspace (id) on delete cascade,
    -- deleting a page takes its whole subtree with it (needs `PRAGMA foreign_keys = ON`, see sqlite.ts)
    parent text references page (id) on delete cascade,
    position real not null,
    title text not null,
    icon text,
    cover_src text,
    cover_y real,
    markdown text not null,
    revision integer not null,
    created text not null,
    updated text,
    deleted text
);
--> statement-breakpoint
create index page_workspace_parent_position on page (workspace, parent, position);
--> statement-breakpoint
create virtual table page_search using fts5 (
    id unindexed,
    title,
    markdown,
    content = 'page',
    content_rowid = 'rowid',
    tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
create trigger page_search_insert after insert on page begin
    insert into page_search (rowid, id, title, markdown) values (new.rowid, new.id, new.title, new.markdown);
end;
--> statement-breakpoint
create trigger page_search_delete after delete on page begin
    insert into page_search (page_search, rowid, id, title, markdown) values ('delete', old.rowid, old.id, old.title, old.markdown);
end;
--> statement-breakpoint
create trigger page_search_update after update of title, markdown on page begin
    insert into page_search (page_search, rowid, id, title, markdown) values ('delete', old.rowid, old.id, old.title, old.markdown);
    insert into page_search (rowid, id, title, markdown) values (new.rowid, new.id, new.title, new.markdown);
end;
--> statement-breakpoint
create table media (
    id text primary key,
    workspace text not null references workspace (id) on delete cascade,
    filename text not null,
    mime text not null,
    size integer not null,
    created text not null
);
--> statement-breakpoint
create index media_workspace on media (workspace);
