-- a page in the trash; its descendants go with it without being marked themselves
alter table page add column deleted text;
--> statement-breakpoint
-- full-text search over titles and bodies, kept in step with `page` by the triggers below (an fts5 "external content"
-- table: it stores only the index, and reads the text back from `page`)
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
insert into page_search (page_search) values ('rebuild');
