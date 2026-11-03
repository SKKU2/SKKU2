import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_KEY, SUPABASE_URL, localModeAllowed, supabaseConfigured } from './env';
import { localClient } from '../local/db';
import '../local/seed';
import type { Profile, Role } from '../types';

/** Supabase 환경변수가 없으면 로컬 체험 모드(파일 저장)로 동작. 배포 환경에서는 쓰지 않음 */
export const isLocalMode = () => !supabaseConfigured() && localModeAllowed();
/** 배포 환경인데 Supabase 설정이 빠진 상태 */
export const isMisconfigured = () => !supabaseConfigured() && !localModeAllowed();

export async function serverClient(): Promise<any> {
  if (isLocalMode()) return localClient();
  if (isMisconfigured()) throw new Error('Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)가 설정되지 않았습니다');
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: list => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* 서버 컴포넌트에서는 쿠키를 쓸 수 없음: 프록시가 갱신 */ }
      }
    }
  });
}

/** 로그인 사용자와 프로필. 없으면 로그인 화면으로 */
export async function requireProfile(roles?: Role[]) {
  if (isMisconfigured()) redirect('/login');
  const sb = await serverClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await sb.from('profiles').select('id,email,display_name,role,unit_id').eq('id', user.id).single();
  if (!profile) redirect('/login?e=profile');
  if (roles && !roles.includes(profile.role as Role)) redirect('/?e=forbidden');
  return { sb, user, profile: profile as Profile };
}

export const canEdit = (p: Profile) => p.role === 'admin' || (p.role === 'operator' && !!p.unit_id);
