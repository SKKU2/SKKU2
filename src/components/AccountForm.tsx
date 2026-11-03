'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { changeMyPassword, updateMyName } from '@/app/account-actions';
import { toast } from './ui';

export function AccountForm({ name, mustChange, local }: { name: string; mustChange: boolean; local: boolean }) {
  const router = useRouter();
  const [dn, setDn] = useState(name);
  const [pw, setPw] = useState({ current: '', next: '', next2: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveName() {
    const r = await updateMyName(dn);
    if (r.ok) { toast('이름을 바꿨습니다', 'ok'); router.refresh(); } else toast(r.error, 'err');
  }
  async function savePw(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    if (pw.next !== pw.next2) { setMsg('새 비밀번호 두 칸이 다릅니다'); return; }
    setBusy(true);
    const r = await changeMyPassword(pw.current, pw.next);
    setBusy(false);
    if (!r.ok) { setMsg(r.error); return; }
    toast('비밀번호를 바꿨습니다', 'ok');
    setPw({ current: '', next: '', next2: '' });
    if (mustChange) router.replace('/');
    router.refresh();
  }

  return (
    <>
      {!mustChange && (
        <div className="card">
          <div className="card-head"><h2>이름·계급</h2></div>
          <div className="btn-row"><input type="text" value={dn} onChange={e => setDn(e.target.value)} style={{ flex: 1 }} /><button className="btn" onClick={saveName}>저장</button></div>
        </div>
      )}
      <div className="card">
        <div className="card-head"><h2>비밀번호 변경</h2></div>
        {local ? <p className="note">로컬 체험 모드에는 비밀번호가 없습니다.</p> : (
          <form onSubmit={savePw} className="grid" style={{ gap: 10 }}>
            <label className="field"><span>{mustChange ? '임시 비밀번호' : '현재 비밀번호'}</span><input type="password" autoComplete="current-password" value={pw.current} onChange={e => setPw(x => ({ ...x, current: e.target.value }))} required /></label>
            <label className="field"><span>새 비밀번호 (8자 이상)</span><input type="password" autoComplete="new-password" minLength={8} value={pw.next} onChange={e => setPw(x => ({ ...x, next: e.target.value }))} required /></label>
            <label className="field"><span>새 비밀번호 확인</span><input type="password" autoComplete="new-password" minLength={8} value={pw.next2} onChange={e => setPw(x => ({ ...x, next2: e.target.value }))} required /></label>
            {msg && <p className="err">{msg}</p>}
            <button className="btn primary" disabled={busy}>{busy ? '저장 중…' : '비밀번호 저장'}</button>
          </form>
        )}
      </div>
    </>
  );
}
