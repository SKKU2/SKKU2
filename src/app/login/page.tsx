'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserClient } from '@/lib/supabase/client';
import { supabaseConfigured } from '@/lib/supabase/env';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

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
    const sb = browserClient();
    if (mode === 'in') {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message === 'Invalid login credentials' ? '이메일 또는 비밀번호가 틀렸습니다' : error.message);
      else { router.replace('/'); router.refresh(); }
    } else {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: `${location.origin}/auth/callback` } });
      if (error) setMsg(error.message);
      else if (data.session) { router.replace('/'); router.refresh(); }
      else setMsg('확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인하세요.');
    }
    setBusy(false);
  }

  return (
    <div className="auth-wrap">
      <div className="card">
        <div className="card-head">
          <h2>{mode === 'in' ? '로그인' : '가입'}</h2>
          <button className="btn sm" type="button" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(''); }}>{mode === 'in' ? '가입하기' : '로그인으로'}</button>
        </div>
        <form onSubmit={submit} className="grid" style={{ gap: 10 }}>
          {mode === 'up' && <label className="field"><span>이름·계급</span><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="예: 상사 홍길동" required /></label>}
          <label className="field"><span>이메일</span><input type="text" inputMode="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
          <label className="field"><span>비밀번호 (8자 이상)</span><input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={8} value={password} onChange={e => setPassword(e.target.value)} required /></label>
          {msg && <p className="err">{msg}</p>}
          <button className="btn primary" disabled={busy}>{busy ? '처리 중…' : mode === 'in' ? '로그인' : '가입'}</button>
        </form>
        {mode === 'up' && <p className="note" style={{ marginTop: 10 }}>가입하면 <b>열람자</b>로 시작합니다. 관리자가 소속 부대와 역할(조작자)을 지정합니다. 첫 가입자는 관리자가 됩니다.</p>}
      </div>
    </div>
  );
}
