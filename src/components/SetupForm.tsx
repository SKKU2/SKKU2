'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setupFirstAdmin } from '@/app/account-actions';
import { normalizeId } from '@/lib/account';

export function SetupForm() {
  const router = useRouter();
  const [f, setF] = useState({ code: '', unitName: '', loginId: '', name: '', password: '', password2: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(x => ({ ...x, [k]: k === 'loginId' ? normalizeId(e.target.value) : e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.password !== f.password2) { setMsg('두 비밀번호가 다릅니다'); return; }
    setBusy(true);
    const r = await setupFirstAdmin(f);
    setBusy(false);
    if (r.ok) router.replace('/login?e=setup'); else setMsg(r.error);
  }

  return (
    <form onSubmit={submit} className="grid" style={{ gap: 10 }}>
      <p className="note">배포 환경변수 <code>SETUP_CODE</code>에 넣은 설치 코드가 필요합니다. 총괄관리자가 생기면 이 화면은 닫힙니다.</p>
      <label className="field"><span>설치 코드</span><input type="password" autoComplete="off" value={f.code} onChange={set('code')} required /></label>
      <label className="field"><span>첫 부대 이름</span><input type="text" value={f.unitName} onChange={set('unitName')} placeholder="예: ○○보병대대" required /></label>
      <label className="field"><span>총괄관리자 아이디 (영문 소문자·숫자·. _ - 3~32자)</span><input type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} value={f.loginId} onChange={set('loginId')} required /></label>
      <label className="field"><span>이름·계급</span><input type="text" value={f.name} onChange={set('name')} placeholder="예: 상사 홍길동" required /></label>
      <label className="field"><span>비밀번호 (8자 이상)</span><input type="password" autoComplete="new-password" minLength={8} value={f.password} onChange={set('password')} required /></label>
      <label className="field"><span>비밀번호 확인</span><input type="password" autoComplete="new-password" minLength={8} value={f.password2} onChange={set('password2')} required /></label>
      {msg && <p className="err">{msg}</p>}
      <button className="btn primary" disabled={busy}>{busy ? '만드는 중…' : '총괄관리자 만들기'}</button>
    </form>
  );
}
