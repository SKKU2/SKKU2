'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as R from '@/lib/wx/rules.js';
import { LEVELS } from '@/lib/briefing';
import { aiTest, saveUnitSettings } from '@/app/actions';
import { toast } from './ui';
import type { UnitSettings } from '@/lib/types';

const HAZARDS: string[] = R.HAZARDS;
const METRICS: Record<string, { label: string; unit?: string; bool?: boolean }> = R.METRICS;
const OPS: Record<string, string> = R.OPS;

export function SettingsEditor({ unit, hasServerKey }: { unit: { id: string; name: string; settings: UnitSettings }; hasServerKey: boolean }) {
  const router = useRouter();
  const [s, setS] = useState<UnitSettings>(() => JSON.parse(JSON.stringify(unit.settings)));
  const [name, setName] = useState(unit.name);
  const [dirty, setDirty] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  const upd = (fn: (x: UnitSettings) => void) => setS(prev => { const x = JSON.parse(JSON.stringify(prev)); fn(x); setDirty(true); return x; });
  const numOrNull = (v: string) => (v === '' ? null : Number(v));

  async function save() {
    const r = await saveUnitSettings(unit.id, s, name);
    if (r.ok) { setDirty(false); toast('설정을 저장했습니다. 다음 “판단 실행”부터 적용됩니다.', 'ok'); router.refresh(); } else toast(r.error, 'err');
  }
  async function test() {
    if (dirty) await saveUnitSettings(unit.id, s, name);
    setTestMsg('연결 확인 중…');
    const r = await aiTest(unit.id);
    setTestMsg(r.ok ? `✔ 연결 성공 (${r.data!.model})` : `✖ 연결 실패: ${r.error}`);
  }
  function reset() {
    if (!confirm('특보 기준표와 활동 기준을 기본값으로 되돌릴까요? (저장 버튼을 눌러야 반영)')) return;
    upd(x => { x.criteria = R.defaultCriteria(); x.activities = R.defaultActivities(); x.approachRatio = 0.8; x.popThreshold = 60; });
  }

  return (
    <>
      <div className="sticky-actions" style={{ top: 52, bottom: 'auto', position: 'sticky', background: 'var(--bg)', zIndex: 10 }}>
        <button className="btn primary" onClick={save} disabled={!dirty}>{dirty ? '설정 저장' : '저장됨'}</button>
        <span className="note">{dirty ? '저장하지 않은 변경이 있습니다' : '변경 후 저장을 누르세요'}</span>
      </div>

      <div className="card">
        <div className="card-head"><h2>부대 정보·판단 옵션</h2></div>
        <div className="grid g4">
          <label className="field"><span>부대명 (화면·산출물 표시용, AI로 보내지 않음)</span><input type="text" value={name} onChange={e => { setName(e.target.value); setDirty(true); }} /></label>
          <label className="field"><span>지역 구분 (특보 기준)</span><select value={s.region} onChange={e => upd(x => { x.region = e.target.value as any; })}><option value="land">육상</option><option value="mountain">산지</option></select></label>
          <label className="field"><span>기준 근접 비율 (%) → 조정</span><input type="number" step={5} min={0} max={100} value={Math.round(s.approachRatio * 100)} onChange={e => upd(x => { x.approachRatio = Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100; })} /></label>
          <label className="field"><span>강수 중으로 볼 강수확률 (%)</span><input type="number" step={10} min={0} max={100} value={s.popThreshold} onChange={e => upd(x => { x.popThreshold = Number(e.target.value); })} /></label>
        </div>
        <p className="note" style={{ marginTop: 8 }}>⚠ 기준표는 공개 자료 기반 초안입니다. 실제 적용 전 부대 지휘관 승인과 최신 기상청 기준 재확인이 필요합니다.</p>
      </div>

      <div className="card">
        <div className="card-head"><h2>기상특보 발표기준 (기준 도달 판단)</h2></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl compact crit-tbl">
            <thead><tr><th>현상</th><th>지표</th><th>비교</th><th>주의보</th><th>경보</th><th>산지 주의보</th><th>산지 경보</th><th>비고</th></tr></thead>
            <tbody>{s.criteria.map((c: any, i: number) => (
              <tr key={c.id}><td><b>{c.hazard}</b></td><td>{c.label} <span className="note">({METRICS[c.metric]?.unit || ''})</span></td><td>{OPS[c.dir]}</td>
                {(['adv', 'warn', 'mAdv', 'mWarn'] as const).map(f => <td key={f}><input type="number" step="any" value={c[f] ?? ''} placeholder="-" onChange={e => upd(x => { x.criteria[i][f] = numOrNull(e.target.value); })} /></td>)}
                <td className="small muted">{c.note || ''}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <p className="note">태풍은 특보 발령(입력 화면 체크)으로만 반영합니다. 지속 시간(2일 이상 등)은 판단하지 않고 근거에 “확인 필요”로 표시합니다.</p>
      </div>

      <div className="card">
        <div className="card-head"><h2>부대활동별 기준</h2>
          <button className="btn" onClick={() => upd(x => { x.activities.push({ id: 'a' + Date.now().toString(36), name: '새 활동', hazards: HAZARDS.slice(), stopOnAdvisory: [], tsStop: true, capAdjust: false, conds: [], tpl: ['{활동} 정상 시행', '{활동} 조정 건의 – {근거}', '{활동} 중단 건의 – {근거}'] }); })}>활동 추가</button>
        </div>
        <p className="note">공통 규칙: 관련 특보의 <b>경보</b> 발령·기준 도달 → 중단, <b>주의보</b> 발령·기준 도달 → 조정(“주의보에도 중단” 체크 시 중단), 주의보 기준의 근접 비율 이상 → 조정. 아래 조건은 활동별로 추가 적용됩니다.</p>
        {s.activities.map((a: any, i: number) => (
          <div className="act-card" key={a.id}>
            <div className="row">
              <input type="text" value={a.name} style={{ fontWeight: 700, width: 200 }} onChange={e => upd(x => { x.activities[i].name = e.target.value; })} />
              <label className="small"><input type="checkbox" checked={!!a.tsStop} onChange={e => upd(x => { x.activities[i].tsStop = e.target.checked; })} /> 뇌우 시 중단</label>
              <label className="small"><input type="checkbox" checked={!!a.capAdjust} onChange={e => upd(x => { x.activities[i].capAdjust = e.target.checked; })} /> 중단 없이 “형태 조정”까지만</label>
              <span style={{ flex: 1 }} />
              <button className="btn sm danger" onClick={() => { if (confirm(`“${a.name}” 활동을 삭제할까요?`)) upd(x => { x.activities.splice(i, 1); }); }}>활동 삭제</button>
            </div>
            {(['hazards', 'stopOnAdvisory'] as const).map(field => (
              <div className="row" key={field}>
                <span className="small" style={{ width: 110 }}>{field === 'hazards' ? '관련 특보' : '주의보에도 중단'}</span>
                <div className="hz-checks">{HAZARDS.map(h => (
                  <label key={h}><input type="checkbox" checked={(a[field] || []).includes(h)} onChange={e => upd(x => {
                    const arr = (x.activities[i][field] || []).filter((v: string) => v !== h);
                    if (e.target.checked) arr.push(h);
                    x.activities[i][field] = arr;
                  })} /> {h}</label>
                ))}</div>
              </div>
            ))}
            <div className="small" style={{ margin: '6px 0 4px' }}>활동별 조건</div>
            {(a.conds || []).map((c: any, j: number) => {
              const bool = METRICS[c.metric]?.bool;
              return (
                <div className="cond-row" key={j}>
                  <select value={c.metric} onChange={e => upd(x => {
                    const cc = x.activities[i].conds[j];
                    cc.metric = e.target.value;
                    if (METRICS[cc.metric].bool) { cc.op = 'is'; cc.value = true; } else if (cc.op === 'is') { cc.op = 'ge'; cc.value = 0; }
                  })}>{Object.entries(METRICS).map(([k, m]) => <option key={k} value={k}>{m.label}{m.unit ? ` (${m.unit})` : ''}</option>)}</select>
                  {bool ? <><span className="small muted" style={{ alignSelf: 'center' }}>해당 시</span><span /></> : <>
                    <select value={c.op} onChange={e => upd(x => { x.activities[i].conds[j].op = e.target.value; })}>{Object.entries(OPS).filter(([k]) => k !== 'is').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    <input type="number" step="any" value={c.value ?? ''} onChange={e => upd(x => { x.activities[i].conds[j].value = numOrNull(e.target.value); })} />
                  </>}
                  <select value={Number(c.level)} onChange={e => upd(x => { x.activities[i].conds[j].level = Number(e.target.value); })}><option value={1}>→ 조정</option><option value={2}>→ 중단</option></select>
                  <button className="btn sm" onClick={() => upd(x => { x.activities[i].conds.splice(j, 1); })}>✕</button>
                </div>
              );
            })}
            <button className="btn sm" onClick={() => upd(x => { x.activities[i].conds.push({ metric: 'windMs', op: 'ge', value: 10, level: 1 }); })}>조건 추가</button>
            <details style={{ marginTop: 8 }}>
              <summary className="small">건의 문구 템플릿 ({'{활동}'}, {'{근거}'} 사용 가능)</summary>
              {[0, 1, 2].map(l => (
                <label key={l} className="field" style={{ marginTop: 4 }}><span>{LEVELS[l]}</span>
                  <input type="text" value={(a.tpl || [])[l] || ''} onChange={e => upd(x => { x.activities[i].tpl = x.activities[i].tpl || ['', '', '']; x.activities[i].tpl[l] = e.target.value; })} /></label>
              ))}
            </details>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head"><h2>AI 보조 조언 (Gemini API)</h2><span className="note">기본 꺼짐</span></div>
        <div className="callout warn" style={{ marginBottom: 10 }}>외부 상용 AI로 자료를 보내려면 <b>보안 담당 부서 승인</b>이 먼저 필요합니다. 무료 등급은 입력이 모델 개선에 쓰일 수 있으니 유료 등급 약관을 확인하세요.</div>
        <div className="grid g3">
          <label className="small" style={{ alignSelf: 'end' }}><input type="checkbox" checked={s.ai.enabled} onChange={e => upd(x => { x.ai.enabled = e.target.checked; })} /> 이 부대에서 AI 사용</label>
          <label className="field"><span>모델명 (기본 gemini-3.8-flash)</span><input type="text" value={s.ai.model} onChange={e => upd(x => { x.ai.model = e.target.value.trim(); })} /></label>
          <div className="btn-row" style={{ alignSelf: 'end' }}><button className="btn primary" onClick={test} disabled={!s.ai.enabled}>연결 테스트</button></div>
        </div>
        <p className="small" style={{ marginTop: 6 }}>API 키: {hasServerKey ? <b style={{ color: 'var(--ok)' }}>서버에 설정됨</b> : <b style={{ color: 'var(--stop)' }}>서버에 없음 (배포 환경변수 GEMINI_API_KEY)</b>} · 키는 서버에만 있고 브라우저로 내려가지 않습니다.</p>
        {testMsg && <p className="small">{testMsg}</p>}
      </div>

      <div className="card"><div className="btn-row"><button className="btn danger" onClick={reset}>기준·활동 기본값 복원</button><span className="note">부대명·AI 설정은 유지됩니다.</span></div></div>
    </>
  );
}
