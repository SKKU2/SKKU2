'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { canEdit, requireProfile } from '@/lib/supabase/server';
import { evaluateInput, kstStrToDate, normalizeSettings } from '@/lib/briefing';
import { aiOptions, mergeAdvice, payloadFor, requestAdvice, testConnection } from '@/lib/ai';
import type { BriefingInput, BriefingRow, Recommendation, Role, Session } from '@/lib/types';

type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

async function unitSettings(sb: any, unitId: string) {
  const { data } = await sb.from('units').select('id,name,settings').eq('id', unitId).single();
  return { unit: data, settings: normalizeSettings(data?.settings) };
}

const SESSIONS: Session[] = ['morning', 'evening', 'extreme'];

/** 판단 실행: 서버에서 다시 해석·판정한 뒤 저장 (클라이언트 결과를 그대로 믿지 않음) */
export async function runJudgment(input: BriefingInput, unitIdForAdmin?: string): Promise<Result<{ id: string }>> {
  const { sb, user, profile } = await requireProfile(['admin', 'operator']);
  const unitId = profile.role === 'admin' ? unitIdForAdmin || profile.unit_id : profile.unit_id;
  if (!unitId) return { ok: false, error: '소속 부대가 지정되지 않았습니다. 관리자에게 요청하세요.' };
  const target = kstStrToDate(input.targetTime);
  if (!target) return { ok: false, error: '대상 시각을 입력하세요' };
  if (!SESSIONS.includes(input.session)) return { ok: false, error: '회차 값이 잘못되었습니다' };
  const { settings } = await unitSettings(sb, unitId);

  let prevRecs: Recommendation[] = [];
  if (input.id) {
    const { data } = await sb.from('briefings').select('recommendations').eq('id', input.id).maybeSingle();
    prevRecs = data?.recommendations || [];
  }
  const ev = evaluateInput(input, settings, prevRecs);
  const row = {
    unit_id: unitId,
    session: input.session,
    target_time: target.toISOString(),
    author: String(input.author || '').slice(0, 60),
    raw_metar: String(input.rawMetar || '').slice(0, 20000),
    raw_taf: String(input.rawTaf || '').slice(0, 20000),
    civil: input.civil || {},
    hourly: input.hourly || [],
    active_warnings: input.activeWarnings || [],
    av_override: input.avOverride || {},
    capture_paths: (input.capturePaths || []).filter(p => typeof p === 'string' && p.startsWith(unitId + '/')).slice(0, 12),
    ...ev,
    ai: null
  };
  const q = input.id
    ? sb.from('briefings').update(row).eq('id', input.id).select('id').single()
    : sb.from('briefings').insert({ ...row, created_by: user.id }).select('id').single();
  const { data, error } = await q;
  if (error) return { ok: false, error: '저장 실패: ' + error.message };
  revalidatePath('/');
  revalidatePath('/history');
  return { ok: true, data: { id: data.id } };
}

/** 권고 문구 수정·비고·AI 포함 여부 저장 */
export async function saveEdits(id: string, edits: { texts: Record<string, string>; memo: string; includeAi: boolean }): Promise<Result> {
  const { sb, profile } = await requireProfile(['admin', 'operator']);
  if (!canEdit(profile)) return { ok: false, error: '수정 권한이 없습니다' };
  const { data: b, error } = await sb.from('briefings').select('recommendations').eq('id', id).single();
  if (error || !b) return { ok: false, error: '브리핑을 찾을 수 없습니다' };
  const recs = (b.recommendations as Recommendation[]).map(r => {
    const t = edits.texts[r.id];
    return typeof t === 'string' && t !== r.text ? { ...r, text: t.slice(0, 1000), edited: true } : r;
  });
  const { error: e2 } = await sb.from('briefings').update({ recommendations: recs, memo: String(edits.memo || '').slice(0, 4000), include_ai: !!edits.includeAi }).eq('id', id);
  if (e2) return { ok: false, error: e2.message };
  revalidatePath(`/briefings/${id}`);
  return { ok: true };
}

export async function deleteBriefing(id: string): Promise<Result> {
  const { sb } = await requireProfile(['admin', 'operator']);
  const { data: b } = await sb.from('briefings').select('capture_paths').eq('id', id).single();
  if (b?.capture_paths?.length) await sb.storage.from('captures').remove(b.capture_paths);
  const { error } = await sb.from('briefings').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/history');
  return { ok: true };
}

/* ---------- AI ---------- */
async function loadForAi(id: string) {
  const { sb, profile } = await requireProfile();
  const { data: b } = await sb.from('briefings').select('*').eq('id', id).single();
  if (!b) throw new Error('브리핑을 찾을 수 없습니다');
  const { settings } = await unitSettings(sb, b.unit_id);
  return { sb, profile, b: b as BriefingRow, settings };
}

/** 전송 미리보기: 실제로 보낼 JSON */
export async function aiPreview(id: string): Promise<Result<{ payload: unknown; model: string; enabled: boolean; reason?: string }>> {
  try {
    const { b, settings } = await loadForAi(id);
    const opt = aiOptions(settings);
    const reason = !settings.ai.enabled ? '부대 설정에서 AI가 꺼져 있습니다' : !opt.apiKey ? '서버에 GEMINI_API_KEY가 설정되지 않았습니다' : undefined;
    return { ok: true, data: { payload: payloadFor(b, settings), model: opt.model, enabled: opt.enabled, reason } };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

/** AI 조언 실행 → 병합(상향만) → 저장. 실패해도 규칙 결과는 유지 */
export async function aiRun(id: string): Promise<Result<{ upgraded: number; error?: string }>> {
  try {
    const { sb, profile, b, settings } = await loadForAi(id);
    if (!canEdit(profile)) return { ok: false, error: '수정 권한이 없습니다' };
    const opt = aiOptions(settings);
    const caps: Record<string, number> = {};
    settings.activities.forEach((a: any) => { if (a.capAdjust) caps[a.id] = 1; });
    let recs: Recommendation[];
    let ai: BriefingRow['ai'];
    try {
      const res = await requestAdvice(payloadFor(b, settings), opt);
      recs = mergeAdvice(b.recommendations, res, caps);
      ai = { response: res, model: opt.model, at: new Date().toISOString() };
    } catch (e: any) {
      recs = mergeAdvice(b.recommendations, null);
      ai = { error: e.message || String(e), model: opt.model, at: new Date().toISOString() };
    }
    const { error } = await sb.from('briefings').update({ recommendations: recs, ai }).eq('id', id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/briefings/${id}`);
    return { ok: true, data: { upgraded: recs.filter(r => r.source === 'AI 상향').length, error: ai?.error } };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function aiTest(unitId: string): Promise<Result<{ model: string }>> {
  const { sb } = await requireProfile(['admin', 'operator']);
  const { settings } = await unitSettings(sb, unitId);
  try {
    const r = await testConnection(aiOptions(settings));
    return { ok: true, data: { model: r.model } };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

/* ---------- 설정·사용자 ---------- */
export async function saveUnitSettings(unitId: string, settings: unknown, name?: string): Promise<Result> {
  const { sb } = await requireProfile(['admin', 'operator']);
  const patch: any = { settings: normalizeSettings(settings) };
  if (typeof name === 'string' && name.trim()) patch.name = name.trim().slice(0, 60);
  const { error } = await sb.from('units').update(patch).eq('id', unitId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings');
  return { ok: true };
}

export async function createUnit(name: string): Promise<Result<{ id: string }>> {
  const { sb, profile } = await requireProfile(['admin']);
  const { data, error } = await sb.from('units').insert({ name: name.trim().slice(0, 60) || '새 부대', settings: normalizeSettings(null) }).select('id').single();
  if (error) return { ok: false, error: error.message };
  if (!profile.unit_id) await sb.from('profiles').update({ unit_id: data.id }).eq('id', profile.id);
  revalidatePath('/settings');
  return { ok: true, data: { id: data.id } };
}

export async function updateUser(userId: string, patch: { role?: Role; unit_id?: string | null }): Promise<Result> {
  const { sb } = await requireProfile(['admin']);
  const p: any = {};
  if (patch.role && ['admin', 'operator', 'viewer'].includes(patch.role)) p.role = patch.role;
  if (patch.unit_id !== undefined) p.unit_id = patch.unit_id || null;
  const { error } = await sb.from('profiles').update(p).eq('id', userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings');
  return { ok: true };
}

export async function updateMyName(name: string): Promise<Result> {
  const { sb, profile } = await requireProfile();
  const { error } = await sb.from('profiles').update({ display_name: name.trim().slice(0, 40) }).eq('id', profile.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** 백업 불러오기: 같은 부대 기록만 받아들임 */
export async function importBackup(json: string): Promise<Result<{ count: number }>> {
  const { sb, profile } = await requireProfile(['admin', 'operator']);
  let data: any;
  try { data = JSON.parse(json); } catch { return { ok: false, error: 'JSON 파일을 읽지 못했습니다' }; }
  if (!data || data.format !== 'wxbrief-web-backup' || !Array.isArray(data.briefings)) return { ok: false, error: '이 앱의 백업 파일이 아닙니다' };
  const rows = data.briefings.filter((b: any) => b && b.id && b.unit_id && (profile.role === 'admin' || b.unit_id === profile.unit_id));
  if (!rows.length) return { ok: true, data: { count: 0 } };
  const { error } = await sb.from('briefings').upsert(rows.map(({ created_by, ...r }: any) => r));
  if (error) return { ok: false, error: error.message };
  revalidatePath('/history');
  return { ok: true, data: { count: rows.length } };
}

export async function signOut() {
  const { sb } = await requireProfile();
  await sb.auth.signOut();
  redirect('/login');
}

/** 이력: 직전 회차 비교용 두 건 */
export async function loadCompare(id: string): Promise<Result<{ a: BriefingRow; b: BriefingRow }>> {
  const { sb } = await requireProfile();
  const { data: b } = await sb.from('briefings').select('*').eq('id', id).maybeSingle();
  if (!b) return { ok: false, error: '브리핑을 찾을 수 없습니다' };
  const { data: prev } = await sb.from('briefings').select('*').eq('unit_id', b.unit_id).neq('id', b.id).lte('target_time', b.target_time)
    .order('target_time', { ascending: false }).order('updated_at', { ascending: false }).limit(1);
  if (!prev?.length) return { ok: false, error: '직전 회차가 없습니다' };
  return { ok: true, data: { a: prev[0], b } };
}

/** 백업 내보내기 (권한 범위 안의 전체 브리핑) */
export async function exportBackup(): Promise<Result<{ json: string; count: number }>> {
  const { sb } = await requireProfile();
  const { data, error } = await sb.from('briefings').select('*').order('target_time');
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { json: JSON.stringify({ format: 'wxbrief-web-backup', version: 1, exportedAt: new Date().toISOString(), briefings: data }), count: data.length } };
}
