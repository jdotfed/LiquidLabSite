create table if not exists public.site_announcement (
  id integer primary key check (id = 1),
  enabled boolean not null default false,
  title text not null default 'Service Update' check (char_length(title) <= 80),
  message text not null default '' check (char_length(message) <= 280),
  style text not null default 'info' check (style in ('info','important','sale','maintenance')),
  button_text text not null default '' check (char_length(button_text) <= 30),
  button_url text not null default '' check (char_length(button_url) <= 500),
  updated_at timestamptz not null default now(),
  updated_by text not null default 'system'
);

insert into public.site_announcement (id, enabled, title, message, style)
values (1, false, 'Service Update', 'All services are operating normally.', 'info')
on conflict (id) do nothing;

alter table public.site_announcement enable row level security;

drop policy if exists "Public can read site announcement" on public.site_announcement;
create policy "Public can read site announcement"
on public.site_announcement for select
to anon, authenticated
using (true);

drop policy if exists "Owners can update site announcement" on public.site_announcement;
create policy "Owners can update site announcement"
on public.site_announcement for update
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) in ('fedsjdot@gmail.com','misfitmail@proton.me'))
with check (lower(coalesce(auth.jwt() ->> 'email', '')) in ('fedsjdot@gmail.com','misfitmail@proton.me'));

create or replace function public.stamp_site_announcement_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := lower(coalesce(auth.jwt() ->> 'email', 'unknown'));
  return new;
end;
$$;

drop trigger if exists site_announcement_updated on public.site_announcement;
create trigger site_announcement_updated
before update on public.site_announcement
for each row execute function public.stamp_site_announcement_update();

grant select on public.site_announcement to anon, authenticated;
grant update on public.site_announcement to authenticated;
