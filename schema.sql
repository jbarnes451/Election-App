-- Election Night Pick 'Em — run once in Supabase SQL Editor, then run seed.sql.
-- A publishable/anon key is safe for browser use only because the tables use RLS.
-- Never put your service_role or secret key in any website file.

begin;

create table if not exists public.races (
  id text primary key,
  state_code text not null,
  chamber text not null check (chamber in ('senate','house')),
  label text not null,
  points smallint not null check (points between 1 and 3)
);
create table if not exists public.race_candidates (
  race_id text not null references public.races(id) on delete cascade,
  candidate_key text not null check (candidate_key in ('a','b','c')),
  name text not null,
  party text,
  primary key(race_id,candidate_key)
);
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 32),
  created_at timestamptz not null default now()
);
create unique index if not exists unique_display_name_casefold on public.profiles (lower(display_name));
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists public.game_settings (
  id integer primary key default 1 check (id=1),
  picks_locked boolean not null default false,
  senate_dem_final integer check (senate_dem_final between 0 and 100),
  senate_rep_final integer check (senate_rep_final between 0 and 100),
  house_dem_final integer check (house_dem_final between 0 and 435),
  house_rep_final integer check (house_rep_final between 0 and 435),
  constraint senate_seats_both_or_none check ((senate_dem_final is null and senate_rep_final is null) or
    (senate_dem_final is not null and senate_rep_final is not null and senate_dem_final+senate_rep_final=100)),
  constraint house_seats_both_or_none check ((house_dem_final is null and house_rep_final is null) or
    (house_dem_final is not null and house_rep_final is not null and house_dem_final+house_rep_final=435))
);
insert into public.game_settings(id) values (1) on conflict (id) do nothing;
create table if not exists public.picks (
  user_id uuid not null references auth.users(id) on delete cascade,
  race_id text not null,
  candidate_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id,race_id),
  foreign key (race_id,candidate_key) references public.race_candidates(race_id,candidate_key)
);
create index if not exists picks_race_id_idx on public.picks (race_id);
create table if not exists public.forecasts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  senate_dem integer not null check (senate_dem between 0 and 100),
  senate_rep integer not null check (senate_rep between 0 and 100),
  house_dem integer not null check (house_dem between 0 and 435),
  house_rep integer not null check (house_rep between 0 and 435),
  constraint senate_prediction_sum check (senate_dem + senate_rep = 100),
  constraint house_prediction_sum check (house_dem + house_rep = 435),
  updated_at timestamptz not null default now()
);
create table if not exists public.results (
  race_id text primary key,
  candidate_key text not null,
  updated_at timestamptz not null default now(),
  foreign key (race_id,candidate_key) references public.race_candidates(race_id,candidate_key)
);

-- Only SQL Editor / project owner can appoint an admin.
create or replace function public.is_game_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_game_admin() from public, anon;
grant execute on function public.is_game_admin() to authenticated;

-- Keep grants explicit even when a project defaults to permissive grants.
alter table public.races enable row level security;
alter table public.race_candidates enable row level security;
alter table public.profiles enable row level security;
alter table public.admins enable row level security;
alter table public.game_settings enable row level security;
alter table public.picks enable row level security;
alter table public.forecasts enable row level security;
alter table public.results enable row level security;

revoke all on public.races,public.race_candidates,public.profiles,public.admins,
  public.game_settings,public.picks,public.forecasts,public.results from anon,authenticated;
grant usage on schema public to authenticated;
grant select on public.races, public.race_candidates,public.profiles, public.admins,
  public.game_settings,public.picks,public.forecasts,public.results to authenticated;
grant insert,update on public.profiles,public.picks,public.forecasts,public.results to authenticated;
grant delete on public.picks,public.results to authenticated;
grant update on public.game_settings to authenticated;

drop policy if exists races_select on public.races;
create policy races_select on public.races for select to authenticated using (true);
drop policy if exists candidates_select on public.race_candidates;
create policy candidates_select on public.race_candidates for select to authenticated using (true);

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (user_id=(select auth.uid()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

drop policy if exists admins_select_own on public.admins;
create policy admins_select_own on public.admins for select to authenticated using (user_id=(select auth.uid()));

drop policy if exists settings_select on public.game_settings;
create policy settings_select on public.game_settings for select to authenticated using (true);
drop policy if exists settings_update_admin on public.game_settings;
create policy settings_update_admin on public.game_settings for update to authenticated
  using ((select public.is_game_admin())) with check ((select public.is_game_admin()));

drop policy if exists picks_select on public.picks;
create policy picks_select on public.picks for select to authenticated using (
 user_id=(select auth.uid()) or (select public.is_game_admin()) or
 (select picks_locked from public.game_settings where id=1)
);
drop policy if exists picks_insert on public.picks;
create policy picks_insert on public.picks for insert to authenticated with check (
 user_id=(select auth.uid()) and not (select picks_locked from public.game_settings where id=1)
);
drop policy if exists picks_update on public.picks;
create policy picks_update on public.picks for update to authenticated
 using (user_id=(select auth.uid()) and not (select picks_locked from public.game_settings where id=1))
 with check (user_id=(select auth.uid()) and not (select picks_locked from public.game_settings where id=1));
drop policy if exists picks_delete on public.picks;
create policy picks_delete on public.picks for delete to authenticated using (
 user_id=(select auth.uid()) and not (select picks_locked from public.game_settings where id=1)
);

drop policy if exists forecasts_select on public.forecasts;
create policy forecasts_select on public.forecasts for select to authenticated using (
 user_id=(select auth.uid()) or (select public.is_game_admin()) or
 (select picks_locked from public.game_settings where id=1)
);
drop policy if exists forecasts_insert on public.forecasts;
create policy forecasts_insert on public.forecasts for insert to authenticated with check (
 user_id=(select auth.uid()) and not (select picks_locked from public.game_settings where id=1)
);
drop policy if exists forecasts_update on public.forecasts;
create policy forecasts_update on public.forecasts for update to authenticated
 using (user_id=(select auth.uid()) and not (select picks_locked from public.game_settings where id=1))
 with check (user_id=(select auth.uid()) and not (select picks_locked from public.game_settings where id=1));

drop policy if exists results_select on public.results;
create policy results_select on public.results for select to authenticated using (true);
drop policy if exists results_insert on public.results;
create policy results_insert on public.results for insert to authenticated with check (
 (select public.is_game_admin()) and (select picks_locked from public.game_settings where id=1)
);
drop policy if exists results_update on public.results;
create policy results_update on public.results for update to authenticated
 using ((select public.is_game_admin()) and (select picks_locked from public.game_settings where id=1))
 with check ((select public.is_game_admin()) and (select picks_locked from public.game_settings where id=1));
drop policy if exists results_delete on public.results;
create policy results_delete on public.results for delete to authenticated using ((select public.is_game_admin()));

-- Cannot reopen predictions after any race has been reported. Admin may clear results first.
create or replace function public.guard_unlock()
returns trigger language plpgsql set search_path = '' as $$
begin
 if old.picks_locked = true and new.picks_locked = false and (exists(select 1 from public.results) or old.senate_dem_final is not null or old.house_dem_final is not null) then
  raise exception 'Clear race results and final seat totals before reopening picks';
 end if;
 return new;
end;
$$;
drop trigger if exists guard_unlock_trigger on public.game_settings;
create trigger guard_unlock_trigger before update on public.game_settings
 for each row execute function public.guard_unlock();

commit;
