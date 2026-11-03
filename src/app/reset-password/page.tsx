'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserClient } from '@/lib/supabase/client';

/** 재설정 메일 링크로 로그인된 상태에서 새 비밀번호를 정한다 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) { setMsg('두 비밀번호가 다릅니다'); return; }
    setBusy(true);
    const { error } = await browserClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setMsg(error.code === 'same_password' ? '이전과 다른 비밀번호를 입력하세요' : error.message); return; }
    router.replace('/');
    router.refresh();
  }

  return (
    <div className="auth-wrap">
      <div className="card">
        <div className="card-head"><h2>새 비밀번호 정하기</h2></div>
        <form onSubmit={submit} className="grid" style={{ gap: 10 }}>
          <label className="field"><span>새 비밀번호 (8자 이상)</span><input type="password" autoComplete="new-password" minLength={8} value={pw} onChange={e => setPw(e.target.value)} required /></label>
          <label className="field"><span>새 비밀번호 확인</span><input type="password" autoComplete="new-password" minLength={8} value={pw2} onChange={e => setPw2(e.target.value)} required /></label>
          {msg && <p className="err">{msg}</p>}
          <button className="btn primary" disabled={busy}>{busy ? '저장 중…' : '비밀번호 저장'}</button>
        </form>
      </div>
    </div>
  );
}
