import { EDITOR_ROLES } from '@/lib/account';
import { notFound } from 'next/navigation';
import { requireProfile } from '@/lib/supabase/server';
import { loadBriefing } from '@/lib/data';
import { rowToInput } from '@/lib/briefing';
import { BriefingForm } from '@/components/BriefingForm';

export const dynamic = 'force-dynamic';

export default async function EditBriefing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sb, profile } = await requireProfile(EDITOR_ROLES);
  const b = await loadBriefing(sb, id);
  if (!b) notFound();
  return <BriefingForm initial={rowToInput(b)} unitId={b.unit_id} author={profile.display_name} />;
}
