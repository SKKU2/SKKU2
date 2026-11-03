-- 0003: 관리자 발급형 아이디 계정
-- 공개 가입·이메일 인증을 쓰지 않는다. 계정은 총괄관리자/부대관리자가 서버(비밀 키)로 만들고,
-- 아이디·역할·부대는 사용자가 바꿀 수 없는 app_metadata로 전달한다.
-- 실행 전: 기존 계정을 정리하려면 supabase/reset_accounts.sql을 먼저 실행한다.

-- ---------- 프로필 열 ----------
alter table public.profiles add column if not exists login_id text;
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles add column if not exists disabled boolean not null default false;
create unique index if not exists profiles_login_id_key on public.profiles (lower(login_id));

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'unit_admin', 'operator', 'viewer'));

-- ---------- 새 계정 → 프로필 (첫 가입자 관리자 규칙 폐지) ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, login_id, display_name, role, unit_id, must_change_password)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(meta ->> 'login_id', ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    case when meta ->> 'role' in ('admin', 'unit_admin', 'operator', 'viewer') then meta ->> 'role' else 'viewer' end,
    nullif(meta ->> 'unit_id', '')::uuid,
    coalesce((meta ->> 'must_change_password')::boolean, true)
  );
  return new;
end;
$$;

-- 정지된 계정은 역할이 없는 것으로 본다 (모든 RLS가 거부)
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select case when disabled then null else role end from public.profiles where id = auth.uid()
$$;

-- ---------- 프로필 변경 규칙 ----------
-- 서버(비밀 키)와 SQL 편집기는 통과, 총괄관리자는 통과.
-- 본인은 이름 변경과 "비밀번호 변경 완료" 표시만 가능.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if public.my_role() = 'admin' then
    return new;
  end if;
  if new.id = auth.uid()
     and new.role = old.role
     and new.unit_id is not distinct from old.unit_id
     and new.email = old.email
     and new.login_id is not distinct from old.login_id
     and new.disabled = old.disabled
     and (new.must_change_password = old.must_change_password or new.must_change_password = false) then
    return new;
  end if;
  raise exception '권한이 없습니다';
end;
$$;

-- 마지막 총괄관리자는 강등·정지·삭제할 수 없다
create or replace function public.guard_last_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and not old.disabled
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.disabled) then
    if not exists (select 1 from public.profiles where role = 'admin' and not disabled and id <> old.id) then
      raise exception '마지막 총괄관리자는 변경하거나 삭제할 수 없습니다';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists profiles_last_admin on public.profiles;
create trigger profiles_last_admin before update or delete on public.profiles
  for each row execute function public.guard_last_admin();

-- ---------- RLS 다시 정의 ----------
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or public.my_role() = 'admin' or (public.my_role() = 'unit_admin' and unit_id = public.my_unit()));

drop policy if exists units_operator_settings on public.units;
drop policy if exists units_manager_settings on public.units;
create policy units_manager_settings on public.units for update
  using (public.my_role() = 'unit_admin' and id = public.my_unit())
  with check (public.my_role() = 'unit_admin' and id = public.my_unit());

drop policy if exists briefings_write on public.briefings;
create policy briefings_write on public.briefings for all
  using (public.my_role() = 'admin' or (public.my_role() in ('operator', 'unit_admin') and unit_id = public.my_unit()))
  with check (public.my_role() = 'admin' or (public.my_role() in ('operator', 'unit_admin') and unit_id = public.my_unit()));

drop policy if exists captures_write on storage.objects;
create policy captures_write on storage.objects for insert
  with check (bucket_id = 'captures' and (public.my_role() = 'admin' or (public.my_role() in ('operator', 'unit_admin') and (storage.foldername(name))[1] = public.my_unit()::text)));
drop policy if exists captures_delete on storage.objects;
create policy captures_delete on storage.objects for delete
  using (bucket_id = 'captures' and (public.my_role() = 'admin' or (public.my_role() in ('operator', 'unit_admin') and (storage.foldername(name))[1] = public.my_unit()::text)));
