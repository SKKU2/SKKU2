'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserClient } from '@/lib/supabase/client';
import { supabaseConfigured } from '@/lib/supabase/env';

type Mode = 'in' | 'up' | 'forgot';
const TITLE: Record<Mode, string> = { in: '로그인', up: '가입', forgot: '비밀번호 재설정' };
/** 메일 링크 처리 결과(/auth/* 에서 ?e= 로 넘어옴) */
const LINK_MSG: Record<string, string> = {
  link: '메일 링크가 만료됐거나 다른 브라우저에서 열렸습니다. 재설정 메일을 요청한 같은 브라우저에서 다시 시도하세요.',
  profile: '계정 정보를 불러오지 못했습니다. 관리자에게 문의하세요.'
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [info, setInfo] = useState('');
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const e = new URLSearchParams(location.search).get('e');
    if (e && LINK_MSG[e]) setMsg(LINK_MSG[e]);
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

  const switchMode = (m: Mode) => { setMode(m); setMsg(''); setInfo(''); setUnconfirmed(false); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setInfo('');
    setUnconfirmed(false);
    const sb = browserClient();
    if (mode === 'in') {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (!error) { router.replace('/'); router.refresh(); }
      else if (error.code === 'email_not_confirmed') { setMsg('메일 인증이 아직 끝나지 않았습니다. 가입 확인 메일의 링크를 눌러 주세요.'); setUnconfirmed(true); }
      else if (error.code === 'invalid_credentials' || error.message === 'Invalid login credentials') setMsg('이메일 또는 비밀번호가 틀렸습니다. 비밀번호가 기억나지 않으면 아래 “비밀번호를 잊으셨나요?”를 누르세요.');
      else setMsg(error.message);
    } else if (mode === 'up') {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: `${location.origin}/auth/callback` } });
      if (error) setMsg(error.message);
      else if (data.session) { router.replace('/'); router.refresh(); }
      // 이미 가입된 이메일이면 Supabase는 오류 대신 identities가 빈 사용자를 돌려준다 (비밀번호는 바뀌지 않음)
      else if (data.user && data.user.identities && data.user.identities.length === 0) setMsg('이미 가입된 이메일입니다. 기존 비밀번호로 로그인하거나 비밀번호 재설정을 사용하세요.');
      else setInfo('확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인하세요.');
    } else {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/reset` });
      if (error) setMsg(error.message);
      else setInfo('가입된 이메일이면 재설정 메일이 발송됩니다. 메일의 링크를 이 브라우저에서 열어 새 비밀번호를 정하세요.');
    }
    setBusy(false);
  }

  async function resend() {
    setBusy(true);
    const { error } = await browserClient().auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
    setBusy(false);
    if (error) setMsg(error.message); else { setMsg(''); setUnconfirmed(false); setInfo('확인 메일을 다시 보냈습니다.'); }
  }

  return (
    <div className="auth-wrap">
      <div className="card">
        <div className="card-head">
          <h2>{TITLE[mode]}</h2>
          <button className="btn sm" type="button" onClick={() => switchMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? '가입하기' : '로그인으로'}</button>
        </div>
        <form onSubmit={submit} className="grid" style={{ gap: 10 }}>
          {mode === 'up' && <label className="field"><span>이름·계급</span><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="예: 상사 홍길동" required /></label>}
          <label className="field"><span>이메일</span><input type="text" inputMode="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
          {mode !== 'forgot' && (
            <label className="field"><span>비밀번호 (8자 이상)</span><input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={8} value={password} onChange={e => setPassword(e.target.value)} required /></label>
          )}
          {msg && <p className="err">{msg}</p>}
          {info && <p className="note" style={{ color: 'var(--ok)' }}>{info}</p>}
          {unconfirmed && <button type="button" className="btn" onClick={resend} disabled={busy}>확인 메일 다시 보내기</button>}
          <button className="btn primary" disabled={busy}>{busy ? '처리 중…' : mode === 'in' ? '로그인' : mode === 'up' ? '가입' : '재설정 메일 보내기'}</button>
        </form>
        {mode === 'in' && <p style={{ marginTop: 10 }}><button type="button" className="btn sm" onClick={() => switchMode('forgot')}>비밀번호를 잊으셨나요?</button></p>}
        {mode === 'up' && <p className="note" style={{ marginTop: 10 }}>가입하면 <b>열람자</b>로 시작합니다. 관리자가 소속 부대와 역할(조작자)을 지정합니다. 첫 가입자는 관리자가 됩니다.</p>}
      </div>
    </div>
  );
}
