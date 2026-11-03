import { isLocalMode, requireProfile } from '@/lib/supabase/server';
import { adminConfigured } from '@/lib/supabase/admin';
import { MANAGER_ROLES } from '@/lib/account';
import { UsersManager } from '@/components/UsersManager';
import type { Profile } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const { sb, profile } = await requireProfile(MANAGER_ROLES);
  if (isLocalMode()) return <div className="card note">로컬 체험 모드에서는 계정 관리를 쓸 수 없습니다. Supabase를 연결한 배포 환경에서 사용하세요.</div>;
  // RLS: 총괄관리자는 전체, 부대관리자는 자기 부대만 보인다
  const { data: users } = await sb.from('profiles').select('id,email,login_id,display_name,role,unit_id,must_change_password,disabled').order('login_id');
  const { data: units } = await sb.from('units').select('id,name').order('name');
  return <UsersManager me={profile} users={(users || []) as Profile[]} units={units || []} adminApi={adminConfigured()} />;
}
