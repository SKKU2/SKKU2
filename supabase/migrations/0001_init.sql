-- 기상 브리핑·부대운용 건의 웹앱 초기 스키마
-- 부대(units) 단위로 기준표·브리핑을 나누고, 역할(admin/operator/viewer)로 권한을 구분한다.

create table public.units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  settings jsonb not null default '{}'::jsonb,   -- 지역 구분, 근접 비율, 특보 기준표, 활동 기준, AI 옵션
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null default 'viewer' check (role in ('admin', 'operator', 'viewer')),
  unit_id uuid references public.units (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.briefings (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  session text not null check (session in ('morning', 'evening', 'extreme')),
  target_time timestamptz not null,
  author text not null default '',
  raw_metar text not null default '',
  raw_taf text not null default '',
  civil jsonb not null default '{}'::jsonb,
  hourly jsonb not null default '[]'::jsonb,
  active_warnings jsonb not null default '[]'::jsonb,
  av_override jsonb not null default '{}'::jsonb,
  parsed jsonb,
  av_summary jsonb,
  hazards jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  missing jsonb not null default '[]'::jsonb,
  memo text not null default '',
  ai jsonb,
  include_ai boolean not null default true,
  capture_paths text[] not null default '{}'
);

create index briefings_unit_target_idx on public.briefings (unit_id, target_time desc);

-- 첫 가입자는 관리자, 이후 가입자는 열람자. 관리자가 역할·부대를 지정한다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    case when exists (select 1 from public.profiles) then 'viewer' else 'admin' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.my_unit()
returns uuid language sql stable security definer set search_path = public as $$
  select unit_id from public.profiles where id = auth.uid()
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger briefings_touch before update on public.briefings
  for each row execute function public.touch_updated_at();
create trigger units_touch before update on public.units
  for each row execute function public.touch_updated_at();

-- ---------- RLS ----------
alter table public.units enable row level security;
alter table public.profiles enable row level security;
alter table public.briefings enable row level security;

create policy units_read on public.units for select
  using (public.my_role() = 'admin' or id = public.my_unit());
create policy units_admin_write on public.units for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy units_operator_settings on public.units for update
  using (public.my_role() = 'operator' and id = public.my_unit())
  with check (public.my_role() = 'operator' and id = public.my_unit());

create policy profiles_read on public.profiles for select
  using (id = auth.uid() or public.my_role() = 'admin');
create policy profiles_admin_update on public.profiles for update
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
-- 본인은 표시 이름만 바꿀 수 있다 (역할·부대 변경은 아래 트리거가 막음)
create policy profiles_self_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin'
     and (new.role is distinct from old.role or new.unit_id is distinct from old.unit_id or new.email is distinct from old.email) then
    raise exception '역할·부대는 관리자만 바꿀 수 있습니다';
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

create policy briefings_read on public.briefings for select
  using (public.my_role() = 'admin' or unit_id = public.my_unit());
create policy briefings_write on public.briefings for all
  using (public.my_role() = 'admin' or (public.my_role() = 'operator' and unit_id = public.my_unit()))
  with check (public.my_role() = 'admin' or (public.my_role() = 'operator' and unit_id = public.my_unit()));

-- ---------- 캡처 이미지 저장소 (비공개, 경로 첫 폴더 = 부대 id) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('captures', 'captures', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy captures_read on storage.objects for select
  using (bucket_id = 'captures' and (public.my_role() = 'admin' or (storage.foldername(name))[1] = public.my_unit()::text));
create policy captures_write on storage.objects for insert
  with check (bucket_id = 'captures' and (public.my_role() = 'admin' or (public.my_role() = 'operator' and (storage.foldername(name))[1] = public.my_unit()::text)));
create policy captures_delete on storage.objects for delete
  using (bucket_id = 'captures' and (public.my_role() = 'admin' or (public.my_role() = 'operator' and (storage.foldername(name))[1] = public.my_unit()::text)));
