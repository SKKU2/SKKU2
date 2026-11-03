import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './env';

/** 서버 전용 비밀 키 (계정 발급·초기화·정지·삭제에만 사용, 브라우저로 내려가지 않음) */
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const adminConfigured = () => Boolean(SUPABASE_URL && SECRET);

/** RLS를 우회하므로 호출하는 쪽에서 반드시 권한을 먼저 확인할 것 */
export function adminClient() {
  if (!adminConfigured()) throw new Error('서버에 SUPABASE_SECRET_KEY가 설정되지 않았습니다');
  return createClient(SUPABASE_URL, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
}
