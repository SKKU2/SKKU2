import { NextResponse, type NextRequest } from 'next/server';
import { serverClient } from '@/lib/supabase/server';

/** 비밀번호 재설정 메일 링크 → 세션 교환 → 새 비밀번호 화면 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (code) {
    const sb = await serverClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL('/reset-password', req.url));
  }
  return NextResponse.redirect(new URL('/login?e=link', req.url));
}
