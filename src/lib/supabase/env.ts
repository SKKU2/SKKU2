/** Supabase 공개 설정. Vercel의 Supabase 연동이 둘 중 하나의 키 이름으로 넣어 준다 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
export const supabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_KEY);
