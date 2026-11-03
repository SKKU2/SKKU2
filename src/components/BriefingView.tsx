'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as P from '@/lib/wx/parser.js';
import { LEVELS, SESSION_LABEL, astroText, compareBriefings, ensureAstro, fmtLong, fmtShort, fmtV, hazardItems, rowToInput } from '@/lib/briefing';
import { chartSvg } from '@/lib/chart';
import { copyForHwp, exportPptx } from '@/lib/exporters';
import { aiPreview, aiRun, deleteBriefing, saveEdits } from '@/app/actions';
import { CompareModal } from './CompareModal';
import { Lvl, Modal, toast } from './ui';
import type { BriefingRow, UnitSettings } from '@/lib/types';

export function BriefingView({ b, prev, unitName, settings, editable, aiReady }: {
  b: BriefingRow; prev: BriefingRow | null; unitName: string; settings: UnitSettings; editable: boolean; aiReady: { enabled: boolean; reason?: string };
}) {
  const router = useRouter();
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(b.recommendations.map(r => [r.id, r.text])));
  const [memo, setMemo] = useState(b.memo || '');
  const [includeAi, setIncludeAi] = useState(b.include_ai !== false);
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState<{ payload: unknown; model: string } | null>(null);
  const [cmpOpen, setCmpOpen] = useState(false);

  const svg = useMemo(() => chartSvg(rowToInput(b), settings, 1000), [b, settings]);
  const { items, cls } = hazardItems(b.hazards);
  const c: any = b.civil || {}, a: any = b.av_summary || {};
  const dirty = memo !== (b.memo || '') || includeAi !== (b.include_ai !== false) || b.recommendations.some(r => texts[r.id] !== r.text);
  const astro = ensureAstro(b, settings).astro;
  const at = astroText(astro);
  const current: BriefingRow = { ...b, astro, memo, include_ai: includeAi, recommendations: b.recommendations.map(r => ({ ...r, text: texts[r.id] ?? r.text })) };

  async function save() {
    setBusy('save');
    const r = await saveEdits(b.id, { texts, memo, includeAi });
    setBusy('');
    if (r.ok) { toast('저장했습니다', 'ok'); router.refresh(); } else toast(r.error, 'err');
  }
  async function openAi() {
    if (dirty) await saveEdits(b.id, { texts, memo, includeAi });
    const r = await aiPreview(b.id);
    if (!r.ok) { toast(r.error, 'err'); return; }
    setPreview(r.data!);
  }
  async function sendAi() {
    setPreview(null);
    setBusy('ai');
    const r = await aiRun(b.id);
    setBusy('');
    if (!r.ok) { toast(r.error, 'err'); return; }
    if (r.data?.error) toast('AI 조언 실패: ' + r.data.error + ' → 규칙 결과로 계속', 'err');
    else toast(`AI 조언 반영 완료${r.data?.upgraded ? ` · 상향 ${r.data.upgraded}건` : ''}`, 'ok');
    router.refresh();
  }
  async function pptx() {
    setBusy('pptx');
    try { await exportPptx(current, unitName, settings); toast('pptx 파일을 만들었습니다', 'ok'); } catch (e: any) { toast('pptx 생성 실패: ' + e.message, 'err'); }
    setBusy('');
  }
  async function copy() {
    if (await copyForHwp(current)) toast('표를 복사했습니다. 한글 문서에서 Ctrl+V로 붙여넣으세요.', 'ok');
    else toast('클립보드 복사에 실패했습니다', 'err');
  }
  async function remove() {
    if (!confirm('이 브리핑을 삭제할까요? 되돌릴 수 없습니다.')) return;
    const r = await deleteBriefing(b.id);
    if (r.ok) { router.push('/history'); router.refresh(); } else toast(r.error, 'err');
  }

  const cmp = prev ? compareBriefings(prev, b) : null;
  const chg = cmp ? cmp.acts.filter(x => x.prev !== null && x.prev !== x.cur) : [];
  const valChg = cmp ? cmp.rows.filter(r => r.changed && r.delta).slice(0, 6) : [];
  const stat = (k: string, v: React.ReactNode, s?: React.ReactNode) => <div className="stat" key={k}><div className="k">{k}</div><div className="v">{v}</div>{s && <div className="s">{s}</div>}</div>;

  return (
    <>
      <div className="brief-head">
        <div>
          <div className="brief-title">{unitName} 기상 브리핑 · {SESSION_LABEL[b.session]}</div>
          <div className="note">{fmtLong(b.target_time)} 기준 · 작성 {b.author || '-'} · 저장 {fmtShort(b.updated_at)}</div>
        </div>
        <div className="btn-row">
          {editable && <button className="btn primary" onClick={save} disabled={!dirty || busy === 'save'}>{dirty ? '저장' : '저장됨'}</button>}
          <button className="btn" onClick={pptx} disabled={busy === 'pptx'}>pptx 내보내기</button>
          <Link className="btn" href={`/briefings/${b.id}/print`} target="_blank">인쇄(PDF)</Link>
          <button className="btn" onClick={copy}>한글용 표 복사</button>
          {editable && <Link className="btn" href={`/briefings/${b.id}/edit`}>입력 수정</Link>}
          {editable && <Link className="btn" href="/briefings/new">새 회차</Link>}
          {editable && <button className="btn danger" onClick={remove}>삭제</button>}
        </div>
      </div>

      <div className={`banner ${cls}`}>
        <b>{cls === 'warn' ? '⚠ 경보 수준 기상' : cls === 'adv' ? '△ 주의보 수준 또는 기준 근접' : '발령 중인 특보 및 기준 도달 예상 없음'}</b>
        {items.length > 0 && <ul>{items.map((i, k) => <li key={k}>{i.text}</li>)}</ul>}
      </div>

      {prev && (
        <div className="card" style={{ padding: '10px 14px' }}>
          <b>직전 회차 대비</b> <span className="note">({fmtLong(prev.target_time)} {SESSION_LABEL[prev.session]})</span>{' '}
          {chg.length ? chg.map(x => <span key={x.name} className={`chip ${x.cur > (x.prev as number) ? 'bad' : 'ok'}`}>{x.name} {LEVELS[x.prev as number]}→{LEVELS[x.cur]} {x.cur > (x.prev as number) ? '↑' : '↓'}</span>) : <span className="chip">활동 판정 변화 없음</span>}
          {valChg.map(r => <span key={r.label} className="chip">{r.label} {(r.delta as number) > 0 ? '+' : ''}{r.delta}</span>)}
          {' '}<button className="btn sm" onClick={() => setCmpOpen(true)}>자세히</button>
        </div>
      )}

      <div className="cards">
        {stat('기온 (최저/최고)', `${fmtV(c.tMin)} / ${fmtV(c.tMax)}℃`)}
        {stat('체감온도', fmtV(c.feelsMax, '℃'), `최고 · 최저 ${fmtV(c.feelsMin ?? c.tMin, '℃')}`)}
        {stat('강수', fmtV(c.pop, '%'), `3h ${fmtV(c.rain3h, 'mm')} · 12h ${fmtV(c.rain12h, 'mm')}`)}
        {stat('적설 24h', fmtV(c.snow24h, 'cm'), c.sky ? `하늘 ${c.sky}` : '')}
        {stat('바람 (민간)', `${fmtV(c.windMax)} / ${fmtV(c.gustMax)}`, '최대 / 순간 m/s')}
        {stat('바람 (항공)', `${fmtV(a.windKt)} / ${fmtV(a.gustKt)}`, '최대 / 돌풍 kt')}
        {stat('시정·운고 (항공 최저)', a.visM !== null && a.visM !== undefined ? P.fmtVis({ m: a.visM }) : '-', `운고 ${a.ceilFt !== null && a.ceilFt !== undefined ? a.ceilFt.toLocaleString() + 'ft' : '없음'}`)}
        {stat('일기현상 (항공)', <span style={{ fontSize: 14 }}>{a.wxText || '-'}</span>, a.ts ? <b style={{ color: 'var(--stop)' }}>뇌우 포함</b> : '')}
        {stat('미세먼지 PM10', fmtV(c.pm10), '㎍/㎥')}
        {stat('BMNT / EENT', at.twilight, at.sun || '설정에서 부대 위치 필요')}
        {stat('월광 (당일 자정)', astro ? `${astro.illumination}%` : '-', astro ? `${astro.phaseName} · ${at.moonTimes}` : '')}
        {b.missing?.length > 0 && <div className="stat" style={{ gridColumn: '1/-1' }}><div className="k">미입력 (판단에서 제외됨)</div><div className="s">{b.missing.join(', ')}</div></div>}
      </div>

      <div className="card">
        <div className="card-head"><h2>시간대별 기온·강수·바람</h2>{svg && <span className="note">민간 시간대 입력 + TAF(변화군 포함 최악값)</span>}</div>
        {svg ? <div className="chart-box" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="note">시간대별 자료가 없습니다. 입력의 “시간대별 예보”를 채우거나 TAF를 붙여넣으면 그래프가 나옵니다.</p>}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>AI 보조 조언 <span className="note">(선택 기능)</span></h2>
          <div className="btn-row">
            {editable && <label className="small"><input type="checkbox" checked={includeAi} onChange={e => setIncludeAi(e.target.checked)} /> pptx·인쇄물에 AI 요약 포함</label>}
            {editable && <button className="btn" onClick={openAi} disabled={!aiReady.enabled || busy === 'ai'} title={aiReady.reason || ''}>{busy === 'ai' ? 'AI 응답 대기 중…' : 'AI 조언 받기'}</button>}
          </div>
        </div>
        {b.ai?.response ? (
          <>
            <div className="callout"><b>AI 요약</b> {b.ai.response.summary}</div>
            {b.ai.response.risks.length > 0 && (
              <div className="risk-cards">{b.ai.response.risks.map((k, i) => (
                <div key={i} className={`risk s-${k.severity}`}><b>{k.title}</b> <span className="chip">{k.severity}</span>{k.timeWindow && <> <span className="chip warn">{k.timeWindow}</span></>}<div>{k.detail}</div></div>
              ))}</div>
            )}
            {b.ai.response.uncertainty && <p className="small"><b>불확실성:</b> {b.ai.response.uncertainty}</p>}
            <p className="note">모델 {b.ai.model} · 생성 {fmtShort(b.ai.at)} · AI 조언은 참고용이며 최종 결심은 지휘관. AI는 단계를 올릴 수만 있음.</p>
          </>
        ) : b.ai?.error ? (
          <div className="callout warn">AI 조언 실패: {b.ai.error} — 규칙 판정 결과로 브리핑을 계속합니다.</div>
        ) : (
          <p className="note">{aiReady.enabled ? 'AI 조언 받기를 누르면 보낼 자료를 먼저 보여 드립니다.' : aiReady.reason || 'AI 기능이 꺼져 있습니다.'} AI는 규칙 판정보다 단계를 올릴 수만 있습니다.</p>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h2>부대운용 건의 (활동별)</h2>{editable && <span className="note">권고 문구는 직접 수정 가능 · 수정 후 저장</span>}</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl rec-tbl">
            <thead><tr><th style={{ width: 120 }}>부대활동</th><th style={{ width: 80 }}>판정</th><th>근거</th><th style={{ width: '34%' }}>건의 문구</th><th style={{ width: 70 }}>출처</th></tr></thead>
            <tbody>
              {b.recommendations.map(r => {
                const notes = [r.capped ? '중단 조건이지만 이 활동은 “형태 조정”까지만 적용' : '', r.aiNote || '', r.source === 'AI' && r.aiAdvice ? 'AI: ' + r.aiAdvice : ''].filter(Boolean);
                return (
                  <tr key={r.id} className={r.source === 'AI 상향' ? 'ai-up-row' : ''}>
                    <td><b>{r.name}</b></td>
                    <td><Lvl level={r.level} />{r.level !== r.ruleLevel && <div className="small muted">규칙: {LEVELS[r.ruleLevel]}</div>}</td>
                    <td>
                      {r.reasons.length ? <ul className="reasons">{r.reasons.map((x, i) => <li key={i} className={`l${x.lvl}`}>{x.text}</li>)}</ul> : <span className="note">해당 조건 없음</span>}
                      {notes.map((n, i) => <div key={i} className="small muted">※ {n}</div>)}
                    </td>
                    <td>
                      {editable ? <textarea value={texts[r.id] ?? ''} onChange={e => setTexts(t => ({ ...t, [r.id]: e.target.value }))} /> : r.text}
                      {r.edited && <div className="small muted">수정됨</div>}
                    </td>
                    <td><span className={`src ${r.source === 'AI 상향' ? 'ai-up' : r.source === 'AI' ? 'ai' : ''}`}>{r.source}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="disclaimer">본 권고는 공개 기준(기상청 특보 기준 등)과 부대 기준표에 따른 <b>참모 건의 참고 정보</b>이며, 최종 결심은 지휘관이 한다. AI 조언은 참고용이다.</div>
      </div>

      <div className="card">
        <div className="card-head"><h2>담당자 비고</h2></div>
        {editable ? <textarea rows={3} value={memo} onChange={e => setMemo(e.target.value)} placeholder="특이사항, 재확인 필요 사항 등" /> : <p>{memo || <span className="note">없음</span>}</p>}
      </div>

      {preview && (
        <Modal title="전송 미리보기 — 아래 JSON만 전송됩니다" onClose={() => setPreview(null)}
          footer={<><button className="btn" onClick={() => setPreview(null)}>취소</button><button className="btn primary" onClick={sendAi}>전송</button></>}>
          <p className="small">부대명·위치·작성자·전문 원문·캡처·메모는 보내지 않습니다. 모델 <b>{preview.model}</b>. API 키는 서버에만 있습니다.</p>
          <pre>{JSON.stringify(preview.payload, null, 2)}</pre>
        </Modal>
      )}
      {cmpOpen && prev && <CompareModal a={prev} b={b} onClose={() => setCmpOpen(false)} />}
    </>
  );
}
