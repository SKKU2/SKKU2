'use client';
import { LEVELS, SESSION_LABEL, compareBriefings, fmtLong } from '@/lib/briefing';
import { Lvl, Modal } from './ui';
import type { BriefingRow } from '@/lib/types';

export function CompareModal({ a, b, onClose }: { a: BriefingRow; b: BriefingRow; onClose: () => void }) {
  const cmp = compareBriefings(a, b);
  return (
    <Modal title="회차 비교" onClose={onClose}>
      <p className="small">이전: <b>{fmtLong(a.target_time)} {SESSION_LABEL[a.session]}</b> → 현재: <b>{fmtLong(b.target_time)} {SESSION_LABEL[b.session]}</b></p>
      <table className="tbl compact">
        <thead><tr><th>구분</th><th>항목</th><th>이전</th><th>현재</th><th>변화</th></tr></thead>
        <tbody>{cmp.rows.map((r, i) => (
          <tr key={i}><td>{r.group}</td><td>{r.label}</td><td>{r.prev}</td><td>{r.cur}</td>
            <td>{r.delta ? <span className={r.delta > 0 ? 'diff-up' : 'diff-down'}>{r.delta > 0 ? '+' : ''}{r.delta}</span> : r.changed ? '변경' : ''}</td></tr>
        ))}</tbody>
      </table>
      <h3 style={{ margin: '12px 0 6px' }}>활동별 판정</h3>
      <table className="tbl compact">
        <thead><tr><th>활동</th><th>이전</th><th>현재</th><th>변화</th></tr></thead>
        <tbody>{cmp.acts.map(x => (
          <tr key={x.name}><td>{x.name}</td><td>{x.prev === null ? '-' : <Lvl level={x.prev} />}</td><td><Lvl level={x.cur} /></td>
            <td>{x.prev === null || x.prev === x.cur ? '' : x.cur > x.prev ? <span className="diff-up">↑ 강화</span> : <span className="diff-down">↓ 완화</span>}</td></tr>
        ))}</tbody>
      </table>
      <p className="note" style={{ marginTop: 8 }}>판정 단계: {LEVELS.join(' < ')}</p>
    </Modal>
  );
}
