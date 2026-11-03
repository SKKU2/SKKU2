import { isLocalMode, requireProfile } from '@/lib/supabase/server';
import { AccountForm } from '@/components/AccountForm';
import { ROLE_LABEL } from '@/lib/account';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const { sb, profile } = await requireProfile(undefined, { allowMustChange: true });
  const { data: unit } = profile.unit_id ? await sb.from('units').select('name').eq('id', profile.unit_id).maybeSingle() : { data: null };
  return (
    <div className="auth-wrap" style={{ maxWidth: 480 }}>
      {profile.must_change_password && (
        <div className="banner adv"><b>임시 비밀번호로 로그인했습니다.</b> 계속하려면 새 비밀번호를 정하세요.</div>
      )}
      <div className="card">
        <div className="card-head"><h2>내 정보</h2></div>
        <table className="tbl compact">
          <tbody>
            <tr><th>아이디</th><td>{profile.login_id || profile.email}</td></tr>
            <tr><th>역할</th><td>{ROLE_LABEL[profile.role]}</td></tr>
            <tr><th>소속 부대</th><td>{unit?.name || '미지정'}</td></tr>
          </tbody>
        </table>
      </div>
      <AccountForm name={profile.display_name} mustChange={!!profile.must_change_password} local={isLocalMode()} />
    </div>
  );
}
