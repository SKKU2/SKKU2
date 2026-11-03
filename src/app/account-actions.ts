'use server';
/* 계정 관리: 최초 설치, 사용자 발급·초기화·정지·삭제, 내 정보.
 * 발급·초기화·정지·삭제는 비밀 키(RLS 우회)로 하므로 호출자 권한을 여기서 반드시 확인한다. */
import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { ID_RE, MANAGER_ROLES, PASSWORD_MIN, normalizeId, toEmail } from '@/lib/account';
import { adminClient, adminConfigured } from '@/lib/supabase/admin';
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/supabase/env';
import { isLocalMode, requireProfile } from '@/lib/supabase/server';
import { normalizeSettings } from '@/lib/briefing';
import type { Profile, Role } from '@/lib/types';

type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (error: string): Result<any> => ({ ok: false, error });

/** 헷갈리는 글자(0/O, 1/l/I)를 뺀 임시 비밀번호 */
function tempPassword(len = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

function needAdminApi(): string | null {
  if (isLocalMode()) return '로컬 체험 모드에서는 계정 관리를 쓸 수 없습니다';
  if (!adminConfigured()) return '서버에 SUPABASE_SECRET_KEY가 설정되지 않았습니다 (배포 환경변수)';
  return null;
}

/** 호출자가 대상 사용자를 다룰 수 있는지 (부대관리자는 자기 부대의 조작자·열람자만) */
function canTouch(me: Profile, target: { role: Role; unit_id: string | null }) {
  if (me.role === 'admin') return true;
  return me.role === 'unit_admin' && !!me.unit_id && target.unit_id === me.unit_id && (target.role === 'operator' || target.role === 'viewer');
}
function allowedRolesFor(me: Profile): Role[] {
  return me.role === 'admin' ? ['admin', 'unit_admin', 'operator', 'viewer'] : ['operator', 'viewer'];
}

async function loadTarget(id: string) {
  const { data } = await adminClient().from('profiles').select('id,login_id,display_name,role,unit_id,disabled').eq('id', id).maybeSingle();
  return data as (Profile & { disabled: boolean }) | null;
}

/**
 * 프로필 확정. auth.admin.createUser는 사용자 행을 넣은 뒤 app_metadata를 따로 기록하므로,
 * handle_new_user 트리거가 만든 프로필에는 역할·아이디·부대가 비어 있다(열람자/NULL). 비밀 키로 직접 덮어쓴다.
 */
async function fixProfile(
  ad: ReturnType<typeof adminClient>,
  userId: string,
  p: { email: string; login_id: string; display_name: string; role: Role; unit_id: string | null; must_change_password: boolean }
) {
  const { error } = await ad.from('profiles').upsert({ id: userId, ...p, disabled: false }, { onConflict: 'id' });
  return error;
}

/* ---------- 최초 설치 ---------- */
export async function setupStatus(): Promise<{ ready: boolean; needed: boolean; reason?: string }> {
  if (isLocalMode()) return { ready: false, needed: false, reason: '로컬 체험 모드입니다' };
  if (!adminConfigured()) return { ready: false, needed: false, reason: '서버에 SUPABASE_SECRET_KEY가 없습니다' };
  if (!process.env.SETUP_CODE) return { ready: false, needed: false, reason: '서버에 SETUP_CODE가 없습니다' };
  const { count, error } = await adminClient().from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin');
  if (error) return { ready: false, needed: false, reason: 'DB 확인 실패: ' + error.message };
  return { ready: true, needed: (count || 0) === 0 };
}

/** 총괄관리자가 한 명도 없을 때만, 설치 코드로 첫 부대와 총괄관리자를 만든다 */
export async function setupFirstAdmin(input: { code: string; unitName: string; loginId: string; name: string; password: string }): Promise<Result> {
  const st = await setupStatus();
  if (!st.ready) return fail(st.reason || '설치할 수 없습니다');
  if (!st.needed) return fail('이미 총괄관리자가 있습니다. 로그인하세요.');
  const code = String(process.env.SETUP_CODE);
  const given = String(input.code || '');
  if (given.length !== code.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(code))) return fail('설치 코드가 맞지 않습니다');
  const id = normalizeId(input.loginId);
  if (!ID_RE.test(id)) return fail('아이디는 영문 소문자·숫자·. _ - 로 3~32자입니다');
  if (String(input.password || '').length < PASSWORD_MIN) return fail(`비밀번호는 ${PASSWORD_MIN}자 이상입니다`);
  const ad = adminClient();
  const { data: unit, error: ue } = await ad.from('units').insert({ name: (input.unitName || '').trim().slice(0, 60) || '본부', settings: normalizeSettings(null) }).select('id').single();
  if (ue) return fail('부대 생성 실패: ' + ue.message);
  const name = (input.name || '').trim().slice(0, 40);
  const { data: created, error } = await ad.auth.admin.createUser({
    email: toEmail(id), password: input.password, email_confirm: true,
    user_metadata: { display_name: name },
    app_metadata: { login_id: id, role: 'admin', unit_id: unit.id, must_change_password: false }
  });
  if (error || !created.user) {
    await ad.from('units').delete().eq('id', unit.id);
    return fail('계정 생성 실패: ' + (error?.message || '사용자 정보 없음'));
  }
  const pe = await fixProfile(ad, created.user.id, { email: toEmail(id), login_id: id, display_name: name, role: 'admin', unit_id: unit.id, must_change_password: false });
  if (pe) {
    await ad.auth.admin.deleteUser(created.user.id);
    await ad.from('units').delete().eq('id', unit.id);
    return fail('프로필 설정 실패: ' + pe.message);
  }
  return { ok: true };
}

/* ---------- 사용자 발급 (여러 명 한꺼번에) ---------- */
export type NewUser = { loginId: string; name: string; role: Role; unitId: string | null };
export type Issued = { loginId: string; name: string; password?: string; error?: string };

export async function createUsers(list: NewUser[]): Promise<Result<Issued[]>> {
  const { profile: me } = await requireProfile(MANAGER_ROLES);
  const block = needAdminApi();
  if (block) return fail(block);
  if (!Array.isArray(list) || !list.length) return fail('등록할 사용자가 없습니다');
  if (list.length > 200) return fail('한 번에 200명까지 등록할 수 있습니다');
  const ad = adminClient();
  const out: Issued[] = [];
  for (const u of list) {
    const id = normalizeId(u.loginId);
    const name = String(u.name || '').trim().slice(0, 40);
    const unitId = me.role === 'admin' ? u.unitId || null : me.unit_id;
    if (!ID_RE.test(id)) { out.push({ loginId: id, name, error: '아이디 형식 오류 (영문 소문자·숫자·. _ - 3~32자)' }); continue; }
    if (!allowedRolesFor(me).includes(u.role)) { out.push({ loginId: id, name, error: '이 역할을 줄 권한이 없습니다' }); continue; }
    if (u.role !== 'admin' && !unitId) { out.push({ loginId: id, name, error: '소속 부대를 지정하세요' }); continue; }
    const password = tempPassword();
    const { data: created, error } = await ad.auth.admin.createUser({
      email: toEmail(id), password, email_confirm: true,
      user_metadata: { display_name: name },
      app_metadata: { login_id: id, role: u.role, unit_id: unitId, must_change_password: true }
    });
    if (error || !created.user) {
      const m = error?.message || '사용자 정보 없음';
      out.push({ loginId: id, name, error: /already|exists|registered/i.test(m) ? '이미 있는 아이디' : m });
      continue;
    }
    const pe = await fixProfile(ad, created.user.id, { email: toEmail(id), login_id: id, display_name: name, role: u.role, unit_id: unitId, must_change_password: true });
    if (pe) {
      await ad.auth.admin.deleteUser(created.user.id);
      out.push({ loginId: id, name, error: '프로필 설정 실패: ' + pe.message });
      continue;
    }
    out.push({ loginId: id, name, password });
  }
  revalidatePath('/admin/users');
  return { ok: true, data: out };
}

/* ---------- 비밀번호 초기화 / 정지 / 삭제 / 역할·부대 변경 ---------- */
export async function resetPassword(userId: string): Promise<Result<{ password: string }>> {
  const { profile: me } = await requireProfile(MANAGER_ROLES);
  const block = needAdminApi();
  if (block) return fail(block);
  const t = await loadTarget(userId);
  if (!t || !canTouch(me, t)) return fail('권한이 없습니다');
  const password = tempPassword();
  const ad = adminClient();
  const { error } = await ad.auth.admin.updateUserById(userId, { password });
  if (error) return fail(error.message);
  await ad.from('profiles').update({ must_change_password: true }).eq('id', userId);
  return { ok: true, data: { password } };
}

export async function setDisabled(userId: string, disabled: boolean): Promise<Result> {
  const { profile: me } = await requireProfile(MANAGER_ROLES);
  const block = needAdminApi();
  if (block) return fail(block);
  if (userId === me.id) return fail('본인 계정은 정지할 수 없습니다');
  const t = await loadTarget(userId);
  if (!t || !canTouch(me, t)) return fail('권한이 없습니다');
  const ad = adminClient();
  const { error: pe } = await ad.from('profiles').update({ disabled }).eq('id', userId);
  if (pe) return fail(pe.message);
  const { error } = await ad.auth.admin.updateUserById(userId, { ban_duration: disabled ? '876000h' : 'none' });
  if (error) return fail(error.message);
  revalidatePath('/admin/users');
  return { ok: true };
}

export async function deleteUser(userId: string): Promise<Result> {
  const { profile: me } = await requireProfile(MANAGER_ROLES);
  const block = needAdminApi();
  if (block) return fail(block);
  if (userId === me.id) return fail('본인 계정은 삭제할 수 없습니다');
  const t = await loadTarget(userId);
  if (!t || !canTouch(me, t)) return fail('권한이 없습니다');
  const { error } = await adminClient().auth.admin.deleteUser(userId);
  if (error) return fail(error.message);
  revalidatePath('/admin/users');
  return { ok: true };
}

export async function updateUser(userId: string, patch: { role?: Role; unit_id?: string | null; name?: string }): Promise<Result> {
  const { profile: me } = await requireProfile(MANAGER_ROLES);
  const block = needAdminApi();
  if (block) return fail(block);
  const t = await loadTarget(userId);
  if (!t || !canTouch(me, t)) return fail('권한이 없습니다');
  const p: Record<string, unknown> = {};
  if (patch.role) {
    if (!allowedRolesFor(me).includes(patch.role)) return fail('이 역할을 줄 권한이 없습니다');
    if (userId === me.id && patch.role !== me.role) return fail('본인 역할은 바꿀 수 없습니다');
    p.role = patch.role;
  }
  if (patch.unit_id !== undefined) {
    if (me.role !== 'admin') return fail('소속 부대 변경은 총괄관리자만 할 수 있습니다');
    p.unit_id = patch.unit_id || null;
  }
  if (typeof patch.name === 'string') p.display_name = patch.name.trim().slice(0, 40);
  if (!Object.keys(p).length) return { ok: true };
  const { error } = await adminClient().from('profiles').update(p).eq('id', userId);
  if (error) return fail(error.message);
  revalidatePath('/admin/users');
  return { ok: true };
}

/* ---------- 부대 (총괄관리자) ---------- */
export async function createUnit(name: string): Promise<Result<{ id: string }>> {
  const { sb } = await requireProfile(['admin']);
  const { data, error } = await sb.from('units').insert({ name: name.trim().slice(0, 60) || '새 부대', settings: normalizeSettings(null) }).select('id').single();
  if (error) return fail(error.message);
  revalidatePath('/admin/users');
  return { ok: true, data: { id: data.id } };
}

/* ---------- 내 정보 ---------- */
export async function updateMyName(name: string): Promise<Result> {
  const { sb, profile } = await requireProfile(undefined, { allowMustChange: true });
  const { error } = await sb.from('profiles').update({ display_name: name.trim().slice(0, 40) }).eq('id', profile.id);
  if (error) return fail(error.message);
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** 비밀번호 변경. 임시 비밀번호 상태가 아니면 현재 비밀번호를 확인한다 */
export async function changeMyPassword(current: string, next: string): Promise<Result> {
  const { sb, profile, user } = await requireProfile(undefined, { allowMustChange: true });
  if (isLocalMode()) return fail('로컬 체험 모드에서는 비밀번호가 없습니다');
  if (String(next || '').length < PASSWORD_MIN) return fail(`새 비밀번호는 ${PASSWORD_MIN}자 이상입니다`);
  if (next === current) return fail('지금과 다른 비밀번호를 입력하세요');
  // 현재 비밀번호 확인 (세션을 남기지 않는 별도 클라이언트로)
  const check = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: ce } = await check.auth.signInWithPassword({ email: user.email!, password: current });
  if (ce) return fail('현재(임시) 비밀번호가 맞지 않습니다');
  await check.auth.signOut({ scope: 'local' }); // 확인용 세션만 버림 (사용자의 로그인 유지)
  const { error } = await sb.auth.updateUser({ password: next });
  if (error) return fail(error.message);
  if (profile.must_change_password) await sb.from('profiles').update({ must_change_password: false }).eq('id', profile.id);
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function signOutAction() {
  const { sb } = await requireProfile(undefined, { allowMustChange: true });
  await sb.auth.signOut();
  redirect('/login');
}
