'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createUnit, updateUser } from '@/app/actions';
import { toast } from './ui';
import type { Profile, Role } from '@/lib/types';

export function UsersAdmin({ units, users, me, currentUnit }: { units: { id: string; name: string }[]; users: Profile[]; me: string; currentUnit: string | null }) {
  const router = useRouter();
  const [name, setName] = useState('');

  async function addUnit() {
    const r = await createUnit(name);
    if (r.ok) { setName(''); toast('부대를 만들었습니다', 'ok'); router.refresh(); } else toast(r.error, 'err');
  }
  async function change(id: string, patch: { role?: Role; unit_id?: string | null }) {
    if (id === me && patch.role && patch.role !== 'admin' && !confirm('본인의 관리자 권한을 내려놓을까요?')) return;
    const r = await updateUser(id, patch);
    if (r.ok) { toast('변경했습니다', 'ok'); router.refresh(); } else toast(r.error, 'err');
  }

  return (
    <div className="card">
      <div className="card-head"><h2>부대·사용자 관리 <span className="note">(관리자)</span></h2></div>
      <div className="btn-row" style={{ marginBottom: 10 }}>
        <span className="small">편집할 부대:</span>
        {units.map(u => <Link key={u.id} href={`/settings?unit=${u.id}`} className={'chip' + (u.id === currentUnit ? ' ok' : '')}>{u.name}</Link>)}
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="새 부대 이름" style={{ width: 180 }} />
        <button className="btn sm" onClick={addUnit} disabled={!name.trim()}>부대 추가</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl compact">
          <thead><tr><th>이름</th><th>이메일</th><th>역할</th><th>소속 부대</th></tr></thead>
          <tbody>{users.map(u => (
            <tr key={u.id}>
              <td>{u.display_name || '-'}{u.id === me && <span className="note"> (나)</span>}</td>
              <td>{u.email}</td>
              <td><select value={u.role} onChange={e => change(u.id, { role: e.target.value as Role })}><option value="admin">관리자</option><option value="operator">조작자</option><option value="viewer">열람자</option></select></td>
              <td><select value={u.unit_id || ''} onChange={e => change(u.id, { unit_id: e.target.value || null })}><option value="">미지정</option>{units.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="note" style={{ marginTop: 6 }}>조작자: 브리핑 작성·수정, 부대 기준 수정 · 열람자: 소속 부대 브리핑 열람·출력만</p>
    </div>
  );
}
