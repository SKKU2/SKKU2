/* 산출물: pptx 내보내기, 한글용 표 복사, 파일 내려받기 (브라우저 전용) */
import * as P from './wx/parser.js';
import { MiniPptx } from './wx/pptx.js';
import { LEVELS, LVL_COLOR, SESSION_LABEL, fmtLong, fmtShort, hazardItems, kstParts, rowToInput, summaryRows, warningText } from './briefing';
import { chartSvg, svgToPng } from './chart';
import type { BriefingRow, UnitSettings } from './types';

const pad = (n: number) => String(n).padStart(2, '0');
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

export async function exportPptx(b: BriefingRow, unitName: string, settings: UnitSettings) {
  const when = `${fmtLong(b.target_time)} · ${SESSION_LABEL[b.session]}`;
  const deck = new MiniPptx({ title: `${unitName} 기상 브리핑 ${when}`.trim(), author: b.author || '' });
  const NAVY = '13294B';
  const foot = (s: any) => s.addText(`본 권고는 참모 건의 참고 정보이며 최종 결심은 지휘관이 한다.   |   ${when}`, { x: 0.4, y: 7.05, w: 12.5, h: 0.3, fontSize: 10, color: '5C6B7A' });
  const header = (s: any, title: string) => {
    s.addRect({ x: 0, y: 0, w: 13.333, h: 0.85, fill: NAVY });
    s.addText(title, { x: 0.4, y: 0.12, w: 8.5, h: 0.62, fontSize: 24, bold: true, color: 'FFFFFF', valign: 'middle' });
    s.addText(`${unitName} ${when}`.trim(), { x: 8.6, y: 0.12, w: 4.4, h: 0.62, fontSize: 12, color: 'C9D6E8', align: 'right', valign: 'middle' });
    foot(s);
  };
  const { cls } = hazardItems(b.hazards);
  const bannerFill = cls === 'warn' ? 'FDE8E8' : cls === 'adv' ? 'FDF3DC' : 'E7F4E8';
  const bannerLine = cls === 'warn' ? 'C62828' : cls === 'adv' ? 'B7791F' : '2E7D32';
  const wt = warningText(b);

  // 1. 표지
  const s1 = deck.addSlide();
  s1.addRect({ x: 0, y: 0, w: 13.333, h: 7.5, fill: NAVY });
  s1.addRect({ x: 0.8, y: 3.55, w: 3.0, h: 0.06, fill: '7FB2FF' });
  s1.addText('기상 브리핑 및 부대운용 건의', { x: 0.8, y: 2.1, w: 11.5, h: 1.2, fontSize: 40, bold: true, color: 'FFFFFF', valign: 'bottom' });
  s1.addText([{ text: `${unitName ? unitName + ' · ' : ''}${when}`, fontSize: 22, color: 'FFFFFF' }, { text: `작성: ${b.author || '-'}`, fontSize: 16, color: 'C9D6E8', space: 8 }], { x: 0.8, y: 3.8, w: 11.5, h: 1.3 });
  s1.addText(wt[0], { x: 0.8, y: 5.4, w: 11.7, h: 0.6, fontSize: 16, bold: true, color: cls === 'none' ? 'FFFFFF' : NAVY, fill: cls === 'none' ? '2C4A73' : cls === 'warn' ? 'FDE8E8' : 'FDF3DC', valign: 'middle', inset: 0.15 });

  // 2. 기상 현황
  const s2 = deck.addSlide();
  header(s2, '기상 현황');
  s2.addText(wt.slice(0, 5).map(t => ({ text: t, bullet: wt.length > 1 })), { x: 0.4, y: 1.05, w: 12.5, h: 1.2, fontSize: 13, bold: cls !== 'none', color: '1F2933', fill: bannerFill, line: bannerLine, inset: 0.12 });
  s2.addTable([[{ text: '항목', bold: true, fill: 'E8EDF3' }, { text: '값', bold: true, fill: 'E8EDF3' }] as any[]].concat(summaryRows(b)), { x: 0.4, y: 2.45, colW: [2.6, 4.2], rowH: 0.42, fontSize: 13 });
  const parsed = b.parsed || [];
  const avText: any[] = [{ text: '항공기상 (공군 기상전문)', bold: true, fontSize: 14, color: '1D4E89' }];
  parsed.filter(r => r.type !== 'TAF').slice(0, 2).forEach(r => {
    avText.push({ text: `${r.type} ${r.station || ''} ${r.issued ? P.fmtKst(new Date(r.issued)) + ' KST' : ''}`, bold: true, fontSize: 12, space: 6 });
    r.items.filter((it: any) => ['바람', '시정', '일기현상', '구름', '수직시정', '기온/이슬점', 'CAVOK'].includes(it.label)).slice(0, 6)
      .forEach((it: any) => avText.push({ text: `${it.label}: ${it.value}`, fontSize: 11, bullet: true }));
  });
  parsed.filter(r => r.type === 'TAF').slice(0, 1).forEach(r => {
    avText.push({ text: `TAF ${r.station || ''} 유효 ${r.validFrom ? P.fmtKst(new Date(r.validFrom)) : '-'} ~ ${r.validTo ? P.fmtKst(new Date(r.validTo)) : '-'} KST`, bold: true, fontSize: 12, space: 6 });
    r.changes.slice(0, 5).forEach((c: any) => avText.push({ text: `${c.kind} ${c.from ? P.fmtKst(new Date(c.from)) : ''}${c.to ? '~' + P.fmtKst(new Date(c.to)) : ''}: ${c.items.map((i: any) => i.value).join(', ').slice(0, 90)}`, fontSize: 11, bullet: true }));
  });
  if (avText.length === 1) avText.push({ text: '기상전문 없음', fontSize: 12, color: '5C6B7A' });
  s2.addText(avText, { x: 7.4, y: 2.45, w: 5.5, h: 4.4, fontSize: 12, line: 'D6DDE5', inset: 0.12 });

  // 3. 시간대별 예보
  const s3 = deck.addSlide();
  header(s3, '시간대별 예보');
  const svg = chartSvg(rowToInput(b), settings, 1000);
  if (svg) {
    try {
      const png = await svgToPng(svg);
      const sc = Math.min(12.5 / png.w, 5.8 / png.h);
      s3.addImage(png.data, { x: (13.333 - png.w * sc) / 2, y: 1.05, w: png.w * sc, h: png.h * sc });
    } catch (e: any) {
      s3.addText('그래프 변환 실패: ' + e.message, { x: 0.4, y: 1.2, w: 12, h: 0.5, fontSize: 14 });
    }
  } else s3.addText('시간대별 자료 없음 (시간대별 예보 또는 TAF 필요)', { x: 0.4, y: 1.2, w: 12, h: 0.6, fontSize: 16, color: '5C6B7A' });

  // 4. 부대운용 건의
  const s4 = deck.addSlide();
  header(s4, '부대운용 건의');
  const rows: any[][] = [[
    { text: '부대활동', bold: true, fill: 'E8EDF3' }, { text: '판정', bold: true, fill: 'E8EDF3', align: 'center' },
    { text: '근거', bold: true, fill: 'E8EDF3' }, { text: '건의', bold: true, fill: 'E8EDF3' }
  ]];
  b.recommendations.forEach(r => {
    const lc = LVL_COLOR[r.level];
    rows.push([
      { text: r.name, bold: true },
      { text: LEVELS[r.level] + (r.source === 'AI 상향' ? '\n(AI 상향)' : ''), bold: true, fill: lc.fill, color: lc.color, align: 'center' },
      { text: r.reasons.length ? r.reasons.slice(0, 3).map(x => '· ' + x.text).join('\n') : '-', fontSize: 9 },
      { text: r.text, fontSize: 11 }
    ]);
  });
  const n = b.recommendations.length;
  const rowH = Math.min(0.75, 5.6 / Math.max(1, n));
  s4.addTable(rows, { x: 0.4, y: 1.05, colW: [1.7, 1.1, 5.0, 4.7], rowH, rowHs: [0.38].concat(Array(n).fill(rowH)), fontSize: 11 });

  // 5. AI 요약 (선택)
  if (b.include_ai !== false && b.ai && b.ai.response) {
    const r = b.ai.response;
    const s5 = deck.addSlide();
    header(s5, 'AI 보조 조언 (참고)');
    const lines: any[] = [{ text: r.summary, fontSize: 15 }];
    r.risks.forEach(k => lines.push({ text: `[${k.severity}] ${k.title}${k.timeWindow ? ' (' + k.timeWindow + ')' : ''} – ${k.detail}`, fontSize: 13, bullet: true, space: 6 }));
    if (r.uncertainty) lines.push({ text: '불확실성: ' + r.uncertainty, fontSize: 12, color: '5C6B7A', space: 8 });
    lines.push({ text: `모델 ${b.ai.model} · 생성 ${fmtShort(b.ai.at)} · AI는 규칙 판정보다 단계를 올릴 수만 있음`, fontSize: 10, color: '5C6B7A', space: 8 });
    s5.addText(lines, { x: 0.5, y: 1.1, w: 12.3, h: 5.8, fontSize: 13 });
  }
  const p = kstParts(new Date(b.target_time));
  downloadBlob(deck.toBlob(), `기상브리핑_${p.y}${pad(p.mo)}${pad(p.d)}_${pad(p.h)}${pad(p.mi)}_${SESSION_LABEL[b.session]}.pptx`);
}

export async function copyForHwp(b: BriefingRow): Promise<boolean> {
  const cell = 'border:1px solid #000;padding:3px 6px;font-family:맑은 고딕;font-size:10pt;vertical-align:middle;';
  const th = cell + 'background:#e8edf3;font-weight:bold;text-align:center;';
  const sr = summaryRows(b);
  const t1 = `<p style="font-family:맑은 고딕;font-size:11pt;font-weight:bold">□ 기상 현황 (${esc(fmtLong(b.target_time))} ${SESSION_LABEL[b.session]})</p>` +
    `<p style="font-family:맑은 고딕;font-size:10pt">${warningText(b).map(esc).join('<br>')}</p>` +
    `<table style="border-collapse:collapse"><tr><td style="${th}">항목</td><td style="${th}">값</td></tr>${sr.map(r => `<tr><td style="${cell}">${esc(r[0])}</td><td style="${cell}">${esc(r[1])}</td></tr>`).join('')}</table>`;
  const t2 = `<p style="font-family:맑은 고딕;font-size:11pt;font-weight:bold">□ 부대운용 건의</p><table style="border-collapse:collapse"><tr><td style="${th}">부대활동</td><td style="${th}">판정</td><td style="${th}">근거</td><td style="${th}">건의</td></tr>${b.recommendations.map(r => `<tr><td style="${cell}">${esc(r.name)}</td><td style="${cell}text-align:center;font-weight:bold;color:#${LVL_COLOR[r.level].color}">${LEVELS[r.level]}</td><td style="${cell}">${r.reasons.slice(0, 3).map(x => esc(x.text)).join('<br>') || '-'}</td><td style="${cell}">${esc(r.text)}</td></tr>`).join('')}</table><p style="font-family:맑은 고딕;font-size:9pt">※ 참모 건의 참고 정보이며 최종 결심은 지휘관</p>`;
  const html = `<html><head><meta charset="utf-8"></head><body>${t1}<br>${t2}</body></html>`;
  const plain = sr.map(r => r.join('\t')).join('\n') + '\n\n부대활동\t판정\t근거\t건의\n' +
    b.recommendations.map(r => [r.name, LEVELS[r.level], r.reasons.slice(0, 3).map(x => x.text).join(' / '), r.text].join('\t')).join('\n');
  try {
    if (!navigator.clipboard || !(window as any).ClipboardItem) throw new Error('no clipboard api');
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })]);
    return true;
  } catch {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.style.cssText = 'position:fixed;left:-9999px;top:0';
    div.innerHTML = t1 + '<br>' + t2;
    document.body.appendChild(div);
    const range = document.createRange();
    range.selectNodeContents(div);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('copy');
    sel.removeAllRanges();
    div.remove();
    return ok;
  }
}
