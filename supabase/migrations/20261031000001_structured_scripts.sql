-- Structured Drama scripts live in blocks.data (title page, cast, elements) plus the original
-- text they were converted from, so a block's data can now be much larger than a link preview.
alter table public.blocks drop constraint blocks_data_check;
alter table public.blocks add constraint blocks_data_check check (pg_column_size(data) <= 1000000);
