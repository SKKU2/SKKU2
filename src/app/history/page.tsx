import { canEdit, requireProfile } from '@/lib/supabase/server';
import { HistoryTable } from '@/components/HistoryTable';
import type { BriefingRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function History() {
  const { sb, profile } = await requireProfile();
  // RLS가 소속 부대(관리자는 전체)로 제한한다
  const { data } = await sb.from('briefings')
    .select('id,unit_id,session,target_time,author,updated_at,hazards,recommendations,active_warnings,civil,av_summary,ai,units(name)')
    .order('target_time', { ascending: false }).limit(500);
  return <HistoryTable rows={(data || []) as unknown as (BriefingRow & { units?: { name: string } })[]} editable={canEdit(profile)} showUnit={profile.role === 'admin'} />;
}
