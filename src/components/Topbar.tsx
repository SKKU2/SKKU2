import Link from 'next/link';
import { isLocalMode, isMisconfigured, serverClient } from '@/lib/supabase/server';
import { signOut } from '@/app/actions';
import { NavLinks } from './NavLinks';

const ROLE_LABEL: Record<string, string> = { admin: '관리자', operator: '조작자', viewer: '열람자' };

export async function Topbar() {
  let who: { name: string; role: string; unit: string } | null = null;
  const local = isLocalMode();
  const sb = isMisconfigured() ? null : await serverClient();
  const user = sb ? (await sb.auth.getUser()).data.user : null;
  if (sb && user) {
    const { data: p } = await sb.from('profiles').select('display_name,email,role,unit_id,units(name)').eq('id', user.id).maybeSingle();
    if (p) who = { name: p.display_name || p.email, role: p.role, unit: (p as any).units?.name || '부대 미지정' };
  }
  return (
    <header className="topbar">
      <Link href="/" className="brand" style={{ color: '#fff', textDecoration: 'none' }}>기상 브리핑·부대운용 건의 <small>v0.3</small></Link>
      {who && <NavLinks role={who.role} />}
      <div className="spacer" />
      {who && (
        <div className="user-box">
          <span>{who.unit}</span>
          <span>{who.name}</span>
          <span className="role">{ROLE_LABEL[who.role]}</span>
          {local ? <span className="role" title="데이터는 이 PC의 web/.localdata 폴더에 저장됩니다">로컬 체험 모드</span>
            : <form action={signOut}><button type="submit">로그아웃</button></form>}
        </div>
      )}
    </header>
  );
}
