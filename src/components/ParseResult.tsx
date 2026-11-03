'use client';
import * as P from '@/lib/wx/parser.js';

function Items({ list }: { list: any[] }) {
  if (!list.length) return null;
  return (
    <table className="tbl compact">
      <thead><tr><th>항목</th><th>해석</th><th>원문</th></tr></thead>
      <tbody>{list.map((it, i) => <tr key={i}><td className="nowrap">{it.label}</td><td>{it.value}</td><td className="raw">{it.raw}</td></tr>)}</tbody>
    </table>
  );
}

export function ParseResult({ reports }: { reports: any[] }) {
  if (!reports.length) return null;
  return (
    <>
      {reports.map((r, idx) => (
        <div className="report" key={idx}>
          <div className="report-head">
            <b>{r.type}{r.mods.length ? ' ' + r.mods.join(' ') : ''}</b> <span>{r.station || '지점 미상'}</span>
            {r.issued ? <span>{P.fmtKst(r.issued)} KST <span className="muted">({P.fmtUtc(r.issued)})</span></span> : <span className="chip bad">발표시각 해석 실패</span>}
            {r.validFrom && <span>유효 {P.fmtKst(r.validFrom)} ~ {P.fmtKst(r.validTo)} KST</span>}
            {r.unparsed.length ? <span className="chip bad">해석 실패 {r.unparsed.length}건</span> : <span className="chip ok">해석 완료</span>}
          </div>
          <div className="report-body">
            <div className="raw">{r.raw}</div>
            {r.nil && <div className="note">NIL (자료 없음)</div>}
            <Items list={r.items} />
            {(r.changes || []).map((c: any, i: number) => (
              <div key={i} style={{ marginTop: 6 }}>
                <span className="chip warn">{c.kind}</span>{' '}
                <span className="small">{c.from ? `${P.fmtKst(c.from)}${c.to ? ' ~ ' + P.fmtKst(c.to) : ''} KST` : '기간 미상'}</span>
                <Items list={c.fields.items} />
              </div>
            ))}
            {r.tx && (r.tx.length > 0 || r.tn.length > 0) && (
              <div className="small" style={{ marginTop: 4 }}>
                {r.tx.map((x: any) => `최고 ${x.v}℃ (${P.fmtKst(x.t)})`).concat(r.tn.map((x: any) => `최저 ${x.v}℃ (${P.fmtKst(x.t)})`)).join(' · ')}
              </div>
            )}
            {r.trend && <div className="small">추세: {r.trend}</div>}
            {r.remarks && <div className="small muted">비고(RMK 등, 해석 안 함): <span className="raw">{r.remarks}</span></div>}
            {r.unparsed.length > 0 && (
              <div className="small">해석 못 한 원문: {r.unparsed.map((u: string, i: number) => <span key={i} className="chip bad">{u}</span>)} <span className="muted">→ 판단에 쓰이지 않음. 필요하면 아래 수동 보정에 입력</span></div>
            )}
            {r.hours && r.hours.length > 0 && (
              <details className="taf-hours">
                <summary className="small">시간대별 펼침 ({r.hours.length}시간, 변화군 포함 최악값)</summary>
                <table className="tbl compact">
                  <thead><tr><th>KST</th><th>바람(kt)</th><th>시정</th><th>운고</th><th>일기현상</th><th>변화군</th></tr></thead>
                  <tbody>
                    {r.hours.map((h: any, i: number) => {
                      const w = h.worst;
                      return (
                        <tr key={i}>
                          <td className="nowrap">{P.fmtKst(h.t)}</td>
                          <td>{w.windKt ?? '-'}{w.gustKt ? ' G' + w.gustKt : ''}</td>
                          <td>{w.visM !== null ? P.fmtVis({ m: w.visM }) : '-'}</td>
                          <td>{w.ceilFt !== null ? w.ceilFt.toLocaleString() + 'ft' : '없음'}</td>
                          <td>{w.wxText || '-'}</td>
                          <td>{h.tags.join(', ')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </details>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
