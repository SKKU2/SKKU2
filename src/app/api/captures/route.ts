import crypto from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { canEdit, requireProfile } from '@/lib/supabase/server';

/** 민간기상 캡처: 업로드·조회·삭제 (Supabase Storage 또는 로컬 폴더, 권한은 서버에서 확인) */
const allowed = (profile: any, path: string) => profile.role === 'admin' || (!!profile.unit_id && path.startsWith(profile.unit_id + '/'));
const validPath = (p: string | null) => !!p && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(p);

export async function POST(req: NextRequest) {
  const { sb, profile } = await requireProfile(['admin', 'operator']);
  const form = await req.formData();
  const file = form.get('file');
  const unitId = String(form.get('unitId') || '');
  if (!(file instanceof Blob) || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: '5MB 이하 이미지만 올릴 수 있습니다' }, { status: 400 });
  if (!canEdit(profile) || !allowed(profile, unitId + '/')) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
  const path = `${unitId}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from('captures').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: 'image/jpeg' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ path });
}

export async function GET(req: NextRequest) {
  const { sb, profile } = await requireProfile();
  const path = req.nextUrl.searchParams.get('path');
  if (!validPath(path) || !allowed(profile, path!)) return new NextResponse('not found', { status: 404 });
  const { data, error } = await sb.storage.from('captures').download(path!);
  if (error || !data) return new NextResponse('not found', { status: 404 });
  return new NextResponse(data, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' } });
}

export async function DELETE(req: NextRequest) {
  const { sb, profile } = await requireProfile(['admin', 'operator']);
  const path = req.nextUrl.searchParams.get('path');
  if (!validPath(path) || !allowed(profile, path!)) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
  await sb.storage.from('captures').remove([path!]);
  return NextResponse.json({ ok: true });
}
