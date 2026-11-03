import Link from 'next/link';
import { requireProfile } from '@/lib/supabase/server';
import { loadUnit, unitOf } from '@/lib/data';
import { aiEnv } from '@/lib/ai';
import { MANAGER_ROLES } from '@/lib/account';
import { SettingsEditor } from '@/components/SettingsEditor';

export const dynamic = 'force-dynamic';

/** 부대 기준 설정: 총괄관리자는 모든 부대, 부대관리자는 자기 부대 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ unit?: string }> }) {
  const { unit: unitParam } = await searchParams;
  const { sb, profile } = await requireProfile(MANAGER_ROLES);
  const unit = await loadUnit(sb, unitOf(profile, unitParam));
  const units = profile.role === 'admin' ? ((await sb.from('units').select('id,name').order('name')).data || []) as { id: string; name: string }[] : [];
  return (
    <>
      {profile.role === 'admin' && (
        <div className="card" style={{ padding: '10px 14px' }}>
          <div className="btn-row">
            <span className="small">편집할 부대:</span>
            {units.map(u => <Link key={u.id} href={`/settings?unit=${u.id}`} className={'chip' + (u.id === unit?.id ? ' ok' : '')}>{u.name}</Link>)}
            <Link href="/admin/users" className="small">부대 추가는 “사용자” 메뉴에서</Link>
          </div>
        </div>
      )}
      {unit ? <SettingsEditor key={unit.id} unit={unit} hasServerKey={!!aiEnv().apiKey} /> : <div className="card note">소속 부대가 없습니다. “사용자” 메뉴에서 부대를 만들거나 지정하세요.</div>}
    </>
  );
}
