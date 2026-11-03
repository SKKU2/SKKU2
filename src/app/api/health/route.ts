import { NextResponse } from 'next/server';
import { isLocalMode, isMisconfigured, serverClient } from '@/lib/supabase/server';
import { adminClient, adminConfigured } from '@/lib/supabase/admin';
import { aiEnv } from '@/lib/ai';

export const dynamic = 'force-dynamic';

/** 배포 점검용: 설정 여부만 알려 주고 키 값은 내보내지 않는다 */
export async function GET() {
  const out: Record<string, unknown> = {
    mode: isLocalMode() ? 'local' : isMisconfigured() ? 'misconfigured' : 'supabase',
    supabaseEnv: !isLocalMode() && !isMisconfigured(),
    secretKey: adminConfigured(),
    setupCode: !!process.env.SETUP_CODE,
    geminiKey: !!aiEnv().apiKey,
    db: 'skipped',
    accountSchema: 'skipped'
  };
  if (out.supabaseEnv) {
    try {
      const sb = await serverClient();
      // 비로그인 상태라 RLS로 0행이 정상. 테이블이 없으면 오류가 난다
      const { error } = await sb.from('units').select('id').limit(1);
      out.db = error ? `error: ${error.message}` : 'ok';
    } catch (e: any) {
      out.db = `error: ${e.message}`;
    }
  }
  if (out.db === 'ok' && out.secretKey) {
    // 0003_id_accounts.sql 적용 여부 (login_id 열) 와 총괄관리자 유무
    const ad = adminClient();
    const { error } = await ad.from('profiles').select('login_id').limit(1);
    out.accountSchema = error ? `missing: ${error.message}` : 'ok';
    if (!error) {
      const { count } = await ad.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin');
      out.adminExists = (count || 0) > 0;
    }
  }
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
