import { EDITOR_ROLES } from '@/lib/account';
import Link from 'next/link';
import { requireProfile } from '@/lib/supabase/server';
import { BriefingForm } from '@/components/BriefingForm';

export const dynamic = 'force-dynamic';

export default async function NewBriefing() {
  const { profile } = await requireProfile(EDITOR_ROLES);
  if (!profile.unit_id) return <div className="card">소속 부대가 없습니다. <Link href="/settings">설정</Link>에서 지정하세요.</div>;
  return <BriefingForm unitId={profile.unit_id} author={profile.display_name} />;
}
