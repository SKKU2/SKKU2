import { notFound } from 'next/navigation';
import { requireProfile } from '@/lib/supabase/server';
import { loadBriefing, loadUnit } from '@/lib/data';
import { LEVELS, SESSION_LABEL, ensureAstro, fmtLong, hazardItems, rowToInput, summaryRows, warningText } from '@/lib/briefing';
import { chartSvg } from '@/lib/chart';
import { PrintButton } from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sb } = await requireProfile();
  const row = await loadBriefing(sb, id);
  if (!row) notFound();
  const unit = await loadUnit(sb, row.unit_id);
  if (!unit) notFound();
  const b = ensureAstro(row, unit.settings);
  const { cls } = hazardItems(b.hazards);
  const svg = chartSvg(rowToInput(b), unit.settings, 1000);
  const showAi = b.include_ai !== false && b.ai?.response;
  const sr = summaryRows(b);
  const half = Math.ceil(sr.length / 2);
  return (
    <>
      <div className="no-print btn-row" style={{ justifyContent: 'center', margin: '8px 0' }}>
        <PrintButton /><span className="note">브라우저 인쇄 창에서 “PDF로 저장”을 고르면 한글 문서 첨부용 PDF가 됩니다 (A4 1~2장)</span>
      </div>
      <div className="print-page">
        <div className="p-head"><h1>{unit.name} 기상 브리핑 및 부대운용 건의</h1><div>{fmtLong(b.target_time)} · {SESSION_LABEL[b.session]} · 작성 {b.author || '-'}</div></div>
        <div className="p-sec"><div className={`p-banner ${cls}`}>{warningText(b).map((t, i) => <div key={i}>{t}</div>)}</div></div>
        <div className="p-sec"><h2>기상 현황</h2>
          <table className="p-tbl"><tbody>{sr.slice(0, half).map((r, i) => (
            <tr key={i}><th>{r[0]}</th><td>{r[1]}</td>{sr[half + i] ? <><th>{sr[half + i][0]}</th><td>{sr[half + i][1]}</td></> : <><th /><td /></>}</tr>
          ))}</tbody></table>
        </div>
        {svg && <div className="p-sec p-chart"><h2>시간대별 예보</h2><div dangerouslySetInnerHTML={{ __html: svg }} /></div>}
        <div className="p-sec"><h2>부대운용 건의</h2>
          <table className="p-tbl">
            <thead><tr><th style={{ width: '16%' }}>부대활동</th><th style={{ width: '8%' }}>판정</th><th>근거</th><th style={{ width: '36%' }}>건의</th></tr></thead>
            <tbody>{b.recommendations.map(r => (
              <tr key={r.id}><td><b>{r.name}</b></td><td className={`p-lvl l${r.level}`}>{LEVELS[r.level]}{r.source === 'AI 상향' && <><br /><small>(AI 상향)</small></>}</td>
                <td>{r.reasons.length ? r.reasons.slice(0, 4).map((x, i) => <div key={i}>· {x.text}</div>) : '-'}</td><td>{r.text}</td></tr>
            ))}</tbody>
          </table>
        </div>
        {showAi && b.ai?.response && (
          <div className="p-sec"><h2>AI 보조 조언 (참고)</h2><p>{b.ai.response.summary}</p>
            {b.ai.response.risks.map((k, i) => <div key={i}>· [{k.severity}] {k.title}{k.timeWindow ? ` (${k.timeWindow})` : ''} – {k.detail}</div>)}
          </div>
        )}
        {b.memo && <div className="p-sec"><h2>비고</h2><p style={{ whiteSpace: 'pre-wrap' }}>{b.memo}</p></div>}
        <div className="p-foot">본 권고는 공개 기준과 부대 기준표에 따른 참모 건의 참고 정보이며, 최종 결심은 지휘관이 한다.{showAi ? ' AI 조언은 참고용이다.' : ''}</div>
      </div>
    </>
  );
}
