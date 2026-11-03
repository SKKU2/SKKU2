'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createUnit, createUsers, deleteUser, resetPassword, setDisabled, updateUser, type Issued, type NewUser } from '@/app/account-actions';
import { ROLE_LABEL, ROLES, normalizeId } from '@/lib/account';
import { Modal, toast } from './ui';
import type { Profile, Role } from '@/lib/types';

type Unit = { id: string; name: string };
const ROLE_BY_LABEL: Record<string, Role> = Object.fromEntries(ROLES.flatMap(r => [[r, r], [ROLE_LABEL[r], r]])) as Record<string, Role>;

export function UsersManager({ me, users, units, adminApi }: { me: Profile; users: Profile[]; units: Unit[]; adminApi: boolean }) {
  const router = useRouter();
  const isAdmin = me.role === 'admin';
  const roleChoices: Role[] = isAdmin ? ROLES : ['operator', 'viewer'];
  const unitName = (id: string | null) => units.find(u => u.id === id)?.name || '미지정';
  const [unitFilter, setUnitFilter] = useState(isAdmin ? '' : me.unit_id || '');
  const [q, setQ] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [rows, setRows] = useState<NewUser[]>([{ loginId: '', name: '', role: 'viewer', unitId: me.unit_id }]);
  const [bulk, setBulk] = useState('');
  const [issued, setIssued] = useState<{ title: string; list: Issued[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => users.filter(u =>
    (!unitFilter || u.unit_id === unitFilter) &&
    (!q || `${u.login_id} ${u.display_name}`.toLowerCase().includes(q.toLowerCase()))
  ), [users, unitFilter, q]);

  const done = (r: { ok: boolean; error?: string }, okMsg: string) => {
    if (r.ok) { toast(okMsg, 'ok'); router.refresh(); } else toast((r as any).error, 'err');
  };

  function parseBulk(): NewUser[] {
    return bulk.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const [id, name, role, unit] = l.split(/[,\t]/).map(s => (s || '').trim());
      const u = units.find(x => x.name === unit || x.id === unit);
      return { loginId: normalizeId(id), name: name || '', role: ROLE_BY_LABEL[role] || 'viewer', unitId: isAdmin ? (u?.id || unitFilter || me.unit_id) : me.unit_id };
    });
  }

  async function issue(fromBulk: boolean) {
    const list = fromBulk ? parseBulk() : rows.filter(r => r.loginId);
    if (!list.length) { toast('등록할 사용자를 입력하세요', 'err'); return; }
    setBusy(true);
    const r = await createUsers(list);
    setBusy(false);
    if (!r.ok) { toast(r.error, 'err'); return; }
    setIssued({ title: '발급 결과 — 임시 비밀번호는 지금만 볼 수 있습니다', list: r.data! });
    if (fromBulk) setBulk(''); else setRows([{ loginId: '', name: '', role: 'viewer', unitId: me.unit_id }]);
    router.refresh();
  }
  async function reset(u: Profile) {
    if (!confirm(`${u.login_id}의 비밀번호를 초기화할까요? 임시 비밀번호가 새로 발급됩니다.`)) return;
    const r = await resetPassword(u.id);
    if (r.ok) setIssued({ title: '비밀번호 초기화 — 임시 비밀번호는 지금만 볼 수 있습니다', list: [{ loginId: u.login_id || '', name: u.display_name, password: r.data!.password }] });
    else toast(r.error, 'err');
  }
  const copyIssued = async () => {
    if (!issued) return;
    const text = '아이디\t이름\t임시 비밀번호\n' + issued.list.filter(i => i.password).map(i => `${i.loginId}\t${i.name}\t${i.password}`).join('\n');
    try { await navigator.clipboard.writeText(text); toast('복사했습니다', 'ok'); } catch { toast('복사 실패: 직접 선택해 복사하세요', 'err'); }
  };

  return (
    <>
      {!adminApi && <div className="banner warn"><b>서버에 SUPABASE_SECRET_KEY가 없습니다.</b> 계정 발급·초기화·정지·삭제를 하려면 배포 환경변수에 넣고 다시 배포하세요.</div>}

      {isAdmin && (
        <div className="card">
          <div className="card-head"><h2>부대</h2></div>
          <div className="btn-row">
            {units.map(u => <span key={u.id} className="chip">{u.name}</span>)}
            <input type="text" value={newUnit} onChange={e => setNewUnit(e.target.value)} placeholder="새 부대 이름" style={{ width: 200 }} />
            <button className="btn sm" disabled={!newUnit.trim()} onClick={async () => { const r = await createUnit(newUnit); if (r.ok) setNewUnit(''); done(r, '부대를 만들었습니다'); }}>부대 추가</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head"><h2>사용자 발급</h2><span className="note">임시 비밀번호가 자동 생성되고, 첫 로그인 때 본인이 바꿉니다</span></div>
        <table className="tbl compact">
          <thead><tr><th>아이디</th><th>이름·계급</th><th>역할</th>{isAdmin && <th>소속 부대</th>}<th /></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i}>
              <td><input type="text" value={r.loginId} placeholder="예: 21-12345" onChange={e => setRows(x => x.map((y, j) => j === i ? { ...y, loginId: normalizeId(e.target.value) } : y))} /></td>
              <td><input type="text" value={r.name} placeholder="예: 상사 홍길동" onChange={e => setRows(x => x.map((y, j) => j === i ? { ...y, name: e.target.value } : y))} /></td>
              <td><select value={r.role} onChange={e => setRows(x => x.map((y, j) => j === i ? { ...y, role: e.target.value as Role } : y))}>{roleChoices.map(k => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}</select></td>
              {isAdmin && <td><select value={r.unitId || ''} onChange={e => setRows(x => x.map((y, j) => j === i ? { ...y, unitId: e.target.value || null } : y))}><option value="">미지정</option>{units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></td>}
              <td>{rows.length > 1 && <button className="btn sm" onClick={() => setRows(x => x.filter((_, j) => j !== i))}>✕</button>}</td>
            </tr>
          ))}</tbody>
        </table>
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={() => setRows(x => [...x, { loginId: '', name: '', role: 'viewer', unitId: me.unit_id }])}>줄 추가</button>
          <button className="btn primary" disabled={busy || !adminApi} onClick={() => issue(false)}>{busy ? '발급 중…' : '발급'}</button>
        </div>
        <details style={{ marginTop: 12 }}>
          <summary>여러 명 붙여넣기 (엑셀에서 복사 가능)</summary>
          <p className="note" style={{ margin: '6px 0' }}>한 줄에 한 명: <code>아이디, 이름·계급, 역할{isAdmin ? ', 부대 이름' : ''}</code> · 역할은 {roleChoices.map(r => ROLE_LABEL[r]).join('/')} (비우면 열람자)</p>
          <textarea rows={5} className="mono" value={bulk} onChange={e => setBulk(e.target.value)} placeholder={'21-12345, 상사 홍길동, 조작자\n22-23456, 중사 김철수, 열람자'} />
          <button className="btn" style={{ marginTop: 6 }} disabled={busy || !adminApi || !bulk.trim()} onClick={() => issue(true)}>붙여넣은 {bulk.split(/\r?\n/).filter(l => l.trim()).length}명 발급</button>
        </details>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>사용자 ({list.length}명)</h2>
          <div className="btn-row">
            {isAdmin && <select value={unitFilter} onChange={e => setUnitFilter(e.target.value)}><option value="">전체 부대</option>{units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
            <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="아이디·이름 검색" />
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl compact" style={{ minWidth: 760 }}>
            <thead><tr><th>아이디</th><th>이름·계급</th><th>역할</th><th>소속 부대</th><th>상태</th><th /></tr></thead>
            <tbody>{list.map(u => {
              const self = u.id === me.id;
              const touchable = isAdmin || (u.unit_id === me.unit_id && (u.role === 'operator' || u.role === 'viewer'));
              return (
                <tr key={u.id} style={u.disabled ? { opacity: .55 } : undefined}>
                  <td className="nowrap"><b>{u.login_id || u.email}</b>{self && <span className="note"> (나)</span>}</td>
                  <td>{u.display_name || '-'}</td>
                  <td>{touchable && !self ? <select value={u.role} onChange={e => updateUser(u.id, { role: e.target.value as Role }).then(r => done(r, '역할을 바꿨습니다'))}>{(roleChoices.includes(u.role) ? roleChoices : [u.role, ...roleChoices]).map(k => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}</select> : ROLE_LABEL[u.role]}</td>
                  <td>{isAdmin ? <select value={u.unit_id || ''} onChange={e => updateUser(u.id, { unit_id: e.target.value || null }).then(r => done(r, '소속을 바꿨습니다'))}><option value="">미지정</option>{units.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select> : unitName(u.unit_id)}</td>
                  <td className="nowrap">{u.disabled ? <span className="chip bad">정지</span> : u.must_change_password ? <span className="chip warn">임시 비밀번호</span> : <span className="chip ok">사용 중</span>}</td>
                  <td className="nowrap">{touchable && !self && adminApi && <>
                    <button className="btn sm" onClick={() => reset(u)}>비밀번호 초기화</button>{' '}
                    <button className="btn sm" onClick={() => setDisabled(u.id, !u.disabled).then(r => done(r, u.disabled ? '사용을 다시 허용했습니다' : '사용을 정지했습니다'))}>{u.disabled ? '정지 해제' : '정지'}</button>{' '}
                    <button className="btn sm danger" onClick={() => { if (confirm(`${u.login_id} 계정을 삭제할까요? 되돌릴 수 없습니다. (작성한 브리핑은 남습니다)`)) deleteUser(u.id).then(r => done(r, '삭제했습니다')); }}>삭제</button>
                  </>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 6 }}>총괄관리자: 모든 부대·사용자 · 부대관리자: 자기 부대의 조작자·열람자 발급·관리, 부대 기준 설정 · 조작자: 브리핑 작성·수정 · 열람자: 열람·출력</p>
      </div>

      {issued && (
        <Modal title={issued.title} onClose={() => setIssued(null)} footer={<><button className="btn" onClick={copyIssued}>표 복사</button><button className="btn primary" onClick={() => setIssued(null)}>확인</button></>}>
          <p className="small">본인에게 따로 전달하세요. 이 창을 닫으면 다시 볼 수 없고, 잊으면 “비밀번호 초기화”로 새로 발급합니다.</p>
          <table className="tbl compact">
            <thead><tr><th>아이디</th><th>이름</th><th>임시 비밀번호</th></tr></thead>
            <tbody>{issued.list.map((i, k) => (
              <tr key={k}><td>{i.loginId}</td><td>{i.name}</td><td>{i.password ? <code style={{ fontSize: 15 }}>{i.password}</code> : <span className="err">{i.error}</span>}</td></tr>
            ))}</tbody>
          </table>
        </Modal>
      )}
    </>
  );
}
