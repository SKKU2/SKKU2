'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { browserClient } from '@/lib/supabase/client';
import { supabaseConfigured } from '@/lib/supabase/env';
import { normalizeId, toEmail } from '@/lib/account';

const QUERY_MSG: Record<string, string> = {
  disabled: '사용 정지된 계정입니다. 관리자에게 문의하세요.',
  profile: '계정 정보를 불러오지 못했습니다. 관리자에게 문의하세요.',
  setup: '설치가 끝났습니다. 방금 만든 아이디로 로그인하세요.'
};

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const e = new URLSearchParams(location.search).get('e');
    if (e === 'setup') setInfo(QUERY_MSG.setup);
    else if (e && QUERY_MSG[e]) setMsg(QUERY_MSG[e]);
  }, []);

  if (!supabaseConfigured() && process.env.NODE_ENV === 'production') {
    return (
      <div className="auth-wrap card">
        <h2>배포 설정 필요</h2>
        <p className="note" style={{ marginTop: 8 }}>Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)가 이 배포에 없습니다. Vercel 프로젝트 설정에 넣은 뒤 다시 배포하세요.</p>
      </div>
    );
  }
  if (!supabaseConfigured()) {
    return (
      <div className="auth-wrap card">
        <h2>로컬 체험 모드</h2>
        <p className="note" style={{ margin: '8px 0 12px' }}>Supabase가 연결되지 않아 로그인 없이 관리자로 사용합니다. 데이터는 이 PC의 web/.localdata 폴더에 저장됩니다.</p>
        <a className="btn primary" href="/">시작하기</a>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setInfo('');
    const { error } = await browserClient().auth.signInWithPassword({ email: toEmail(loginId), password });
    setBusy(false);
    if (!error) { router.replace('/'); router.refresh(); return; }
    if (error.code === 'user_banned') setMsg(QUERY_MSG.disabled);
    else if (error.code === 'invalid_credentials' || error.message === 'Invalid login credentials') setMsg('아이디 또는 비밀번호가 틀렸습니다. 비밀번호를 잊었으면 관리자에게 초기화를 요청하세요.');
    else if (error.code === 'over_request_rate_limit') setMsg('로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.');
    else setMsg(error.message);
  }

  return (
    <div className="auth-wrap">
      <div className="card">
        <div className="card-head"><h2>로그인</h2></div>
        <form onSubmit={submit} className="grid" style={{ gap: 10 }}>
          <label className="field"><span>아이디</span><input type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} value={loginId} onChange={e => setLoginId(normalizeId(e.target.value))} required /></label>
          <label className="field"><span>비밀번호</span><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
          {msg && <p className="err">{msg}</p>}
          {info && <p className="note" style={{ color: 'var(--ok)' }}>{info}</p>}
          <button className="btn primary" disabled={busy}>{busy ? '확인 중…' : '로그인'}</button>
        </form>
        <p className="note" style={{ marginTop: 12 }}>계정은 관리자가 발급합니다. 처음 받은 임시 비밀번호로 로그인하면 새 비밀번호를 정하는 화면이 나옵니다.</p>
        <p className="note" style={{ marginTop: 4 }}><Link href="/setup">최초 설치 (총괄관리자 만들기)</Link></p>
      </div>
    </div>
  );
}
