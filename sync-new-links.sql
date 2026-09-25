create or replace function public.sync_link_menu_new_links()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  item record;
  link_id uuid;
begin
  for item in
    with recursive items(node, path, category) as (
      select value, array[(ordinality - 1)::text], coalesce(nullif(btrim(value->>'title'),''),'Uncategorized')
      from jsonb_array_elements(new.nodes) with ordinality
      union all
      select child.value, parent.path || array['children',(child.ordinality - 1)::text], parent.category
      from items parent
      cross join lateral jsonb_array_elements(coalesce(parent.node->'children','[]'::jsonb)) with ordinality child
    )
    select node, path, case when cardinality(path) = 1 then 'Uncategorized' else category end as category
    from items where coalesce(node->>'url','') <> '' and coalesce(node->>'sourceId','') = ''
  loop
    if char_length(item.node->>'title') not between 1 and 80 then
      raise exception 'Link names must be 1–80 characters to sync to Link.';
    end if;
    if char_length(item.category) > 40 then
      raise exception 'Top-level menu names must be at most 40 characters to sync to Link.';
    end if;
    link_id := (item.node->>'id')::uuid;
    insert into public.link_deck_links (id,user_id,title,url,category)
      values (link_id,new.user_id,item.node->>'title',item.node->>'url',item.category)
      on conflict (id) do nothing;
    if not exists (select 1 from public.link_deck_links where id = link_id and user_id = new.user_id) then
      raise exception 'Could not sync link to your account.';
    end if;
    new.nodes := jsonb_set(new.nodes,item.path || array['sourceId'],to_jsonb(link_id::text));
  end loop;
  return new;
end;
$$;
revoke all on function public.sync_link_menu_new_links() from public, anon;
grant execute on function public.sync_link_menu_new_links() to authenticated;
create trigger sync_new_links_before_menu_save
before insert or update of nodes on public.link_menu_layouts
for each row execute function public.sync_link_menu_new_links();
