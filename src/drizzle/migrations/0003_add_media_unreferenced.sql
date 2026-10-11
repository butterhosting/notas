-- when a sweep first found no page linking to the file; null while one does (see `MediaService.sweep`)
alter table media add column unreferenced text;
