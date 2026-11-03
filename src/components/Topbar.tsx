import Link from 'next/link';
import { isLocalMode, isMisconfigured, serverClient } from '@/lib/supabase/server';
import { signOutAction } from '@/app/account-actions';
import { ROLE_LABEL } from '@/lib/account';
import { NavLinks } from './NavLinks';
import type { Role } from '@/lib/types';

export async function Topbar() {
  let who: { name: string; role: Role; unit: string; pending: boolean } | null = null;
  const local = isLocalMode();
  const sb = isMisconfigured() ? null : await serverClient();
  const user = sb ? (await sb.auth.getUser()).data.user : null;
  if (sb && user) {
    const { data: p } = await sb.from('profiles').select('display_name,login_id,email,role,unit_id,must_change_password,units(name)').eq('id', user.id).maybeSingle();
    if (p) who = { name: p.display_name || p.login_id || p.email, role: p.role, unit: (p as any).units?.name || '부대 미지정', pending: !!p.must_change_password };
  }
  return (
    <header className="topbar">
      <Link href="/" className="brand" style={{ color: '#fff', textDecoration: 'none' }}>기상 브리핑·부대운용 건의 <small>v0.4</small></Link>
      {who && !who.pending && <NavLinks role={who.role} />}
      <div className="spacer" />
      {who && (
        <div className="user-box">
          <span>{who.unit}</span>
          <Link href="/account" style={{ color: '#fff' }} title="내 정보·비밀번호 변경">{who.name}</Link>
          <span className="role">{ROLE_LABEL[who.role]}</span>
          {local ? <span className="role" title="데이터는 이 PC의 web/.localdata 폴더에 저장됩니다">로컬 체험 모드</span>
            : <form action={signOutAction}><button type="submit">로그아웃</button></form>}
        </div>
      )}
    </header>
  );
}
