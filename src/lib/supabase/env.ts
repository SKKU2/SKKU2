/** Supabase 공개 설정. Vercel의 Supabase 연동이 둘 중 하나의 키 이름으로 넣어 준다 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
export const supabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

/** Supabase 없이 로컬 파일에 저장하는 체험 모드. 배포(production)에서는 LOCAL_MODE=1일 때만 허용 */
export const localModeAllowed = () => process.env.NODE_ENV !== 'production' || process.env.LOCAL_MODE === '1';
