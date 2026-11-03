import Link from 'next/link';
import { setupStatus } from '@/app/account-actions';
import { SetupForm } from '@/components/SetupForm';

export const dynamic = 'force-dynamic';

/** 최초 설치: 총괄관리자가 한 명도 없을 때만 설치 코드로 첫 계정을 만든다 */
export default async function SetupPage() {
  const st = await setupStatus();
  return (
    <div className="auth-wrap" style={{ maxWidth: 460 }}>
      <div className="card">
        <div className="card-head"><h2>최초 설치</h2></div>
        {!st.ready ? (
          <p className="note">설치할 수 없습니다: {st.reason}</p>
        ) : !st.needed ? (
          <p className="note">이미 총괄관리자가 있습니다. <Link href="/login">로그인</Link>하세요. 계정은 총괄관리자가 “사용자” 메뉴에서 발급합니다.</p>
        ) : (
          <SetupForm />
        )}
      </div>
    </div>
  );
}
