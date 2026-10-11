create table page (
    id text primary key,
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
    updated text
);
--> statement-breakpoint
create index page_parent_position on page (parent, position);
--> statement-breakpoint
create table media (
    id text primary key,
    filename text not null,
    mime text not null,
    size integer not null,
    created text not null
);
