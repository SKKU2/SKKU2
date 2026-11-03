import 'server-only';
import { normalizeSettings } from './briefing';
import { aiOptions } from './ai';
import type { BriefingRow, Profile, UnitSettings } from './types';

export const LIST_COLS = 'id,unit_id,session,target_time,author,updated_at,hazards,recommendations,active_warnings,civil,av_summary,ai';

export async function loadUnit(sb: any, unitId: string | null) {
  if (!unitId) return null;
  const { data } = await sb.from('units').select('id,name,settings').eq('id', unitId).maybeSingle();
  if (!data) return null;
  return { id: data.id as string, name: data.name as string, settings: normalizeSettings(data.settings) as UnitSettings };
}

export async function loadBriefing(sb: any, id: string) {
  const { data } = await sb.from('briefings').select('*').eq('id', id).maybeSingle();
  return (data as BriefingRow) || null;
}

export async function loadPrevious(sb: any, b: BriefingRow) {
  const { data } = await sb.from('briefings').select('*')
    .eq('unit_id', b.unit_id).neq('id', b.id).lte('target_time', b.target_time)
    .order('target_time', { ascending: false }).order('updated_at', { ascending: false }).limit(1);
  return (data?.[0] as BriefingRow) || null;
}

export function aiReady(settings: UnitSettings) {
  const o = aiOptions(settings);
  return { enabled: o.enabled, reason: !settings.ai.enabled ? '설정에서 AI가 꺼져 있습니다 (외부 통신 없음)' : !o.apiKey ? '서버에 GEMINI_API_KEY가 설정되지 않았습니다' : undefined };
}

export const unitOf = (p: Profile, override?: string | null) => (p.role === 'admin' && override ? override : p.unit_id);
