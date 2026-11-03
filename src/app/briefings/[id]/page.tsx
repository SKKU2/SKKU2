import { notFound } from 'next/navigation';
import { canEdit, requireProfile } from '@/lib/supabase/server';
import { aiReady, loadBriefing, loadPrevious, loadUnit } from '@/lib/data';
import { BriefingView } from '@/components/BriefingView';

export const dynamic = 'force-dynamic';

export default async function BriefingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sb, profile } = await requireProfile();
  const b = await loadBriefing(sb, id);
  if (!b) notFound();
  const unit = await loadUnit(sb, b.unit_id);
  if (!unit) notFound();
  const prev = await loadPrevious(sb, b);
  const editable = canEdit(profile) && (profile.role === 'admin' || profile.unit_id === b.unit_id);
  return <BriefingView b={b} prev={prev} unitName={unit.name} settings={unit.settings} editable={editable} aiReady={aiReady(unit.settings)} />;
}
