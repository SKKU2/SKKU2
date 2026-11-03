import { NextResponse, type NextRequest } from 'next/server';
import { serverClient } from '@/lib/supabase/server';

/** 가입 확인 메일 링크 → 세션 교환. 다른 브라우저에서 열어 교환에 실패해도 메일 인증은 이미 끝났으므로 로그인 화면으로 보낸다 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (code) {
    const sb = await serverClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL('/', req.url));
  }
  return NextResponse.redirect(new URL('/login', req.url));
}
