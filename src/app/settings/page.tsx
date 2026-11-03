import { requireProfile } from '@/lib/supabase/server';
import { loadUnit, unitOf } from '@/lib/data';
import { aiEnv } from '@/lib/ai';
import { SettingsEditor } from '@/components/SettingsEditor';
import { UsersAdmin } from '@/components/UsersAdmin';
import type { Profile } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ unit?: string }> }) {
  const { unit: unitParam } = await searchParams;
  const { sb, profile } = await requireProfile(['admin', 'operator']);
  const unit = await loadUnit(sb, unitOf(profile, unitParam));
  let units: { id: string; name: string }[] = [];
  let users: Profile[] = [];
  if (profile.role === 'admin') {
    units = ((await sb.from('units').select('id,name').order('name')).data || []) as any;
    users = ((await sb.from('profiles').select('id,email,display_name,role,unit_id').order('created_at')).data || []) as any;
  }
  return (
    <>
      {profile.role === 'admin' && <UsersAdmin units={units} users={users} me={profile.id} currentUnit={unit?.id || null} />}
      {unit ? <SettingsEditor key={unit.id} unit={unit} hasServerKey={!!aiEnv().apiKey} /> : <div className="card note">부대를 먼저 만들거나 선택하세요.</div>}
    </>
  );
}
