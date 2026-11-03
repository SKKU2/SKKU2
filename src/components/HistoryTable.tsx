'use client';
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SESSION_LABEL, dateToKstStr, fmtLong, fmtShort, hzSummary, stamp } from '@/lib/briefing';
import { downloadBlob } from '@/lib/exporters';
import { exportBackup, importBackup, loadCompare } from '@/app/actions';
import { CompareModal } from './CompareModal';
import { toast } from './ui';
import type { BriefingRow } from '@/lib/types';

type Row = BriefingRow & { units?: { name: string } };

export function HistoryTable({ rows, editable, showUnit }: { rows: Row[]; editable: boolean; showUnit: boolean }) {
  const router = useRouter();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [ses, setSes] = useState('');
  const [onlyWarn, setOnlyWarn] = useState(false);
  const [cmp, setCmp] = useState<{ a: BriefingRow; b: BriefingRow } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => rows.filter(b => {
    const day = dateToKstStr(new Date(b.target_time)).slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (ses && b.session !== ses) return false;
    if (onlyWarn && !hzSummary(b).length) return false;
    return true;
  }), [rows, from, to, ses, onlyWarn]);

  async function compare(b: Row) {
    const r = await loadCompare(b.id);
    if (r.ok) setCmp(r.data!); else toast(r.error);
  }

  async function exportAll() {
    const r = await exportBackup();
    if (!r.ok) { toast(r.error, 'err'); return; }
    downloadBlob(new Blob([r.data!.json], { type: 'application/json' }), `기상브리핑_백업_${stamp()}.json`);
    toast(`백업 파일을 만들었습니다 (${r.data!.count}건)`, 'ok');
  }
  async function importFile(file: File) {
    const r = await importBackup(await file.text());
    if (r.ok) { toast(`이력 ${r.data!.count}건을 불러왔습니다`, 'ok'); router.refresh(); } else toast(r.error, 'err');
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>브리핑 이력</h2>
        <div className="btn-row">
          <button className="btn" onClick={exportAll}>백업 내보내기 (JSON)</button>
          {editable && <><button className="btn" onClick={() => fileRef.current?.click()}>불러오기</button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={e => { if (e.target.files?.[0]) importFile(e.target.files[0]); e.target.value = ''; }} /></>}
        </div>
      </div>
      <div className="filters">
        <label className="field"><span>시작일</span><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label className="field"><span>종료일</span><input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
        <label className="field"><span>회차</span><select value={ses} onChange={e => setSes(e.target.value)}><option value="">전체</option><option value="morning">아침</option><option value="evening">저녁</option><option value="extreme">기상이변</option></select></label>
        <label className="small" style={{ paddingBottom: 6 }}><input type="checkbox" checked={onlyWarn} onChange={e => setOnlyWarn(e.target.checked)} /> 특보·기준 도달 회차만</label>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl" id="histTbl">
          <thead><tr><th>대상 시각</th>{showUnit && <th>부대</th>}<th>회차</th><th>작성자</th><th>특보·기준 도달</th><th>판정</th><th>AI</th><th>마지막 저장</th><th /></tr></thead>
          <tbody>
            {list.length ? list.map(b => {
              const recs = b.recommendations || [];
              const ns = recs.filter(r => r.level === 2).length, na = recs.filter(r => r.level === 1).length;
              const hz = hzSummary(b);
              return (
                <tr key={b.id}>
                  <td className="nowrap"><Link href={`/briefings/${b.id}`}>{fmtLong(b.target_time)}</Link></td>
                  {showUnit && <td>{b.units?.name || '-'}</td>}
                  <td>{SESSION_LABEL[b.session]}</td>
                  <td>{b.author || '-'}</td>
                  <td>{hz.length ? hz.map(x => <span key={x.t} className={`chip ${x.bad ? 'bad' : 'warn'}`}>{x.t}</span>) : <span className="note">없음</span>}</td>
                  <td className="nowrap"><span className="lvl l2">{ns}</span> <span className="lvl l1">{na}</span> <span className="lvl l0">{recs.length - ns - na}</span></td>
                  <td>{b.ai?.response ? <span className="src ai">AI</span> : ''}</td>
                  <td className="nowrap small">{fmtShort(b.updated_at)}</td>
                  <td className="nowrap"><Link className="btn sm" href={`/briefings/${b.id}`}>열기</Link> <button className="btn sm" onClick={() => compare(b)}>직전 비교</button></td>
                </tr>
              );
            }) : <tr><td colSpan={9} className="note">{rows.length ? '조건에 맞는 이력이 없습니다.' : '저장된 브리핑이 없습니다.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {cmp && <CompareModal a={cmp.a} b={cmp.b} onClose={() => setCmp(null)} />}
    </div>
  );
}
