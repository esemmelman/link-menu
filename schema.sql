-- Applied to the existing Link Deck Supabase project.
create table public.link_menu_layouts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nodes jsonb not null default '[]'::jsonb check (jsonb_typeof(nodes) = 'array'),
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.link_menu_layouts enable row level security;
revoke all on public.link_menu_layouts from anon;
grant select, insert, update on public.link_menu_layouts to authenticated;
create policy menu_select_own on public.link_menu_layouts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy menu_insert_own on public.link_menu_layouts for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy menu_update_own on public.link_menu_layouts for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

insert into public.link_menu_layouts (user_id, nodes)
select user_id, jsonb_agg(jsonb_build_object(
  'id',gen_random_uuid()::text,'title',category,'url','','children',children
) order by category)
from (
  select user_id, coalesce(nullif(trim(category),''),'Uncategorized') as category,
  jsonb_agg(jsonb_build_object('id',id::text,'sourceId',id::text,'title',title,'url',url,'children','[]'::jsonb) order by title) as children
  from public.link_deck_links
  group by user_id,coalesce(nullif(trim(category),''),'Uncategorized')
) grouped group by user_id;
