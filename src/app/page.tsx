import Link from 'next/link';
import { canEdit, requireProfile } from '@/lib/supabase/server';
import { aiReady, loadPrevious, loadUnit } from '@/lib/data';
import { BriefingView } from '@/components/BriefingView';
import type { BriefingRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { sb, profile } = await requireProfile();
  const unit = await loadUnit(sb, profile.unit_id);
  if (!unit) {
    return (
      <div className="card">
        <h2>소속 부대가 없습니다</h2>
        <p className="note" style={{ marginTop: 8 }}>
          {profile.role === 'admin' ? <>관리자입니다. <Link href="/settings">설정</Link>에서 부대를 만들고 사용자 역할을 지정하세요.</> : '관리자에게 소속 부대와 역할 지정을 요청하세요.'}
        </p>
      </div>
    );
  }
  const { data } = await sb.from('briefings').select('*').eq('unit_id', unit.id).order('target_time', { ascending: false }).order('updated_at', { ascending: false }).limit(1);
  const latest = (data?.[0] as BriefingRow) || null;
  if (!latest) {
    return (
      <div className="card">
        <h2>{unit.name}: 아직 브리핑이 없습니다</h2>
        {canEdit(profile) && <p style={{ marginTop: 10 }}><Link className="btn primary" href="/briefings/new">첫 브리핑 작성</Link></p>}
      </div>
    );
  }
  const prev = await loadPrevious(sb, latest);
  return (
    <>
      <p className="note" style={{ marginBottom: 8 }}>최신 브리핑 · 지난 회차는 <Link href="/history">이력</Link>에서 볼 수 있습니다.</p>
      <BriefingView b={latest} prev={prev} unitName={unit.name} settings={unit.settings} editable={canEdit(profile)} aiReady={aiReady(unit.settings)} />
    </>
  );
}
