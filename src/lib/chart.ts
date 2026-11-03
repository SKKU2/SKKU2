/* 시간대별 기온·강수·바람 그래프 (SVG 문자열: 화면·인쇄·pptx 공용) */
import * as P from './wx/parser.js';
import { HOUR, deriveFromInput, kstParts, num } from './briefing';
import type { BriefingInput, UnitSettings } from './types';

export const PAL = { bg: '#ffffff', text: '#1f2933', muted: '#5c6b7a', grid: '#e3e8ee', temp: '#d9480f', rain: '#6b9bd2', wind: '#1d4e89', avWind: '#0f766e', gust: '#8e44ad', thr: '#c62828', ok: '#2e7d32', warn: '#d39e00', stop: '#c62828' };

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const pad = (n: number) => String(n).padStart(2, '0');

export function chartSvg(input: Pick<BriefingInput, 'targetTime' | 'rawMetar' | 'rawTaf' | 'hourly' | 'avOverride'>, settings: UnitSettings, W = 1000): string | null {
  const pal = PAL;
  const d = deriveFromInput(input);
  const civ = d.hourly.filter((h: any) => ['temp', 'wind', 'rain', 'pop'].some(k => num(h[k]) !== null))
    .map((h: any) => ({ t: new Date(h.t), temp: num(h.temp), wind: num(h.wind), rain: num(h.rain) }));
  const av = d.av.filter(e => !e.point).map(e => ({
    t: new Date(e.t), wind: e.windKt !== null ? e.windKt / P.KT_PER_MS : null, gust: e.gustKt !== null ? e.gustKt / P.KT_PER_MS : null,
    visM: e.visM, ceilFt: e.ceilFt, ts: e.flags && e.flags.ts
  }));
  if (!civ.length && !av.length) return null;
  const times = civ.map(x => x.t.getTime()).concat(av.map(x => x.t.getTime()));
  const t0 = Math.min(...times);
  const t1 = Math.max(civ.length ? Math.max(...civ.map(x => x.t.getTime() + 3 * HOUR)) : 0, av.length ? Math.max(...av.map(x => x.t.getTime() + HOUR)) : 0);
  const L = 52, Rm = 52, top = 34;
  const p1h = 150, gap = 40, p2h = 130, stripH = av.length ? 20 : 0;
  const p1y = top, p2y = p1y + p1h + gap, sy = p2y + p2h + 22;
  const H = sy + stripH + 44;
  const x = (t: number) => L + (t - t0) / (t1 - t0) * (W - L - Rm);
  const out: string[] = [];
  type TO = { size?: number; fill?: string; anchor?: string; bold?: boolean; halo?: boolean };
  const txt = (xx: number, yy: number, s: unknown, o: TO = {}) =>
    `<text x="${xx.toFixed(1)}" y="${yy.toFixed(1)}" font-size="${o.size || 11}" fill="${o.fill || pal.muted}" text-anchor="${o.anchor || 'start'}"${o.bold ? ' font-weight="700"' : ''}${o.halo ? ` stroke="${pal.bg}" stroke-width="4" paint-order="stroke"` : ''}>${esc(s)}</text>`;
  out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${pal.bg}"/>`);

  // x 눈금 (3시간)
  const firstTick = Math.ceil((t0 + 9 * HOUR) / (3 * HOUR)) * 3 * HOUR - 9 * HOUR;
  for (let t = firstTick; t <= t1; t += 3 * HOUR) {
    const xx = x(t);
    const p = kstParts(new Date(t));
    out.push(`<line x1="${xx}" y1="${p1y}" x2="${xx}" y2="${sy + stripH}" stroke="${pal.grid}"/>`);
    out.push(txt(xx, sy + stripH + 16, `${pad(p.h)}시`, { anchor: 'middle' }));
    if (p.h === 0 || t === firstTick) out.push(txt(xx, sy + stripH + 30, `${p.mo}/${p.d}`, { anchor: 'middle', bold: true, fill: pal.text }));
  }

  // 패널 1: 기온 + 강수
  out.push(txt(L, p1y - 12, '기온(℃, 선) · 강수량(mm/3h, 막대)', { fill: pal.text, bold: true, size: 12 }));
  const temps = civ.filter(c => c.temp !== null) as { t: Date; temp: number }[];
  const rains = civ.filter(c => c.rain !== null) as { t: Date; rain: number }[];
  if (temps.length || rains.length) {
    const rMax = Math.max(10, ...rains.map(r => r.rain));
    const ry = (v: number) => p1y + p1h - v / rMax * p1h;
    rains.forEach(r => {
      const x0 = x(r.t.getTime()) + 4, x1 = x(r.t.getTime() + 3 * HOUR) - 4;
      out.push(`<rect x="${x0}" y="${ry(r.rain)}" width="${Math.max(2, x1 - x0)}" height="${p1y + p1h - ry(r.rain)}" fill="${pal.rain}" opacity="0.75"/>`);
      if (r.rain > 0) out.push(txt((x0 + x1) / 2, ry(r.rain) - 3, `${r.rain}`, { anchor: 'middle', fill: pal.rain, size: 10 }));
    });
    out.push(txt(W - Rm + 6, p1y + 8, `${rMax}mm`, { size: 10 }));
    if (temps.length) {
      const tv = temps.map(c => c.temp);
      const lo = Math.floor(Math.min(...tv) - 2), hi = Math.ceil(Math.max(...tv) + 2);
      const ty = (v: number) => p1y + p1h - (v - lo) / (hi - lo) * p1h;
      [lo, Math.round((lo + hi) / 2), hi].forEach(v => out.push(txt(L - 6, ty(v) + 4, `${v}°`, { anchor: 'end', size: 10 })));
      const pts = temps.map(c => [x(c.t.getTime() + 1.5 * HOUR), ty(c.temp)]);
      out.push(`<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${pal.temp}" stroke-width="2.5"/>`);
      pts.forEach((p, i) => {
        out.push(`<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${pal.temp}"/>`);
        out.push(txt(p[0], p[1] - 7, `${temps[i].temp}`, { anchor: 'middle', fill: pal.temp, size: 10, bold: true }));
      });
    }
  } else out.push(txt(W / 2, p1y + p1h / 2, '시간대별 기온·강수 미입력', { anchor: 'middle' }));
  out.push(`<line x1="${L}" y1="${p1y + p1h}" x2="${W - Rm}" y2="${p1y + p1h}" stroke="${pal.muted}"/>`);

  // 패널 2: 바람
  out.push(txt(L, p2y - 12, '풍속(m/s)', { fill: pal.text, bold: true, size: 12 }));
  const mountain = settings.region === 'mountain';
  const crit = (id: string) => (settings.criteria || []).find((c: any) => c.id === id) || {};
  const thW = mountain && num(crit('wind').mAdv) !== null ? num(crit('wind').mAdv) : num(crit('wind').adv);
  const thG = mountain && num(crit('gust').mAdv) !== null ? num(crit('gust').mAdv) : num(crit('gust').adv);
  const wVals = civ.map(c => c.wind).concat(av.map(a => a.wind), av.map(a => a.gust)).filter((v): v is number => v !== null);
  const wMax = Math.max(25, (thG || 0) + 3, ...wVals.map(v => v + 2));
  const wy = (v: number) => p2y + p2h - v / wMax * p2h;
  [0, 10, 20].filter(v => v < wMax).forEach(v => out.push(txt(L - 6, wy(v) + 4, `${v}`, { anchor: 'end', size: 10 })));
  const thrLabels: string[] = []; // 기준선 이름은 자료 점 위에 그림
  ([[thW, `강풍주의보 풍속 ${thW}`], [thG, `순간 ${thG}`]] as [number | null, string][]).forEach(([v, l]) => {
    if (v === null) return;
    out.push(`<line x1="${L}" y1="${wy(v)}" x2="${W - Rm}" y2="${wy(v)}" stroke="${pal.thr}" stroke-dasharray="5 4"/>`);
    thrLabels.push(txt(W - Rm - 4, wy(v) - 4, l, { fill: pal.thr, size: 10, anchor: 'end', halo: true, bold: true }));
  });
  const line = (pts: number[][], color: string, w = 2) => pts.length > 1
    ? `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${w}"/>`
    : pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${color}"/>`).join('');
  const civW = civ.filter(c => c.wind !== null) as { t: Date; wind: number }[];
  const cw = civW.map(c => [x(c.t.getTime() + 1.5 * HOUR), wy(c.wind)]);
  const aw = av.filter(a => a.wind !== null).map(a => [x(a.t.getTime() + 0.5 * HOUR), wy(a.wind as number)]);
  const ag = av.filter(a => a.gust !== null).map(a => [x(a.t.getTime() + 0.5 * HOUR), wy(a.gust as number)]);
  out.push(line(aw, pal.avWind, 2));
  out.push(ag.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="${pal.gust}"/>`).join(''));
  out.push(line(cw, pal.wind, 2.5));
  cw.forEach((p, i) => out.push(txt(p[0], p[1] - 6, `${civW[i].wind}`, { anchor: 'middle', fill: pal.wind, size: 10, bold: true })));
  out.push(thrLabels.join(''));
  if (!wVals.length) out.push(txt(W / 2, p2y + p2h / 2, '바람 자료 없음', { anchor: 'middle' }));
  out.push(`<line x1="${L}" y1="${p2y + p2h}" x2="${W - Rm}" y2="${p2y + p2h}" stroke="${pal.muted}"/>`);
  [[pal.wind, '민간 풍속'], [pal.avWind, 'TAF 풍속'], [pal.gust, 'TAF 돌풍(점)']].forEach(([c, l], i) => {
    const lx = W - Rm - 300 + i * 100;
    out.push(`<rect x="${lx}" y="${p2y - 21}" width="14" height="4" fill="${c}"/>`);
    out.push(txt(lx + 18, p2y - 16, l, { size: 10 }));
  });

  // 항공 시정·운고 띠
  if (av.length) {
    out.push(txt(L, sy - 6, '항공 시정·운고 (녹: 양호 / 황: 시정<5km·운고<1,500ft / 적: 시정<1.6km·운고<500ft·뇌우)', { fill: pal.text, size: 10, bold: true }));
    av.forEach(a => {
      const bad = a.ts || (a.visM !== null && a.visM < 1600) || (a.ceilFt !== null && a.ceilFt < 500);
      const mid = (a.visM !== null && a.visM < 5000) || (a.ceilFt !== null && a.ceilFt < 1500);
      const c = bad ? pal.stop : mid ? pal.warn : pal.ok;
      const x0 = x(a.t.getTime()), x1 = x(a.t.getTime() + HOUR);
      out.push(`<rect x="${x0}" y="${sy}" width="${Math.max(1, x1 - x0 - 1)}" height="${stripH}" fill="${c}"/>`);
      if (a.ts) out.push(txt((x0 + x1) / 2, sy + 14, 'TS', { anchor: 'middle', fill: '#fff', size: 9, bold: true }));
    });
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Malgun Gothic, 맑은 고딕, sans-serif" role="img" aria-label="시간대별 기온, 강수, 풍속 그래프">${out.join('')}</svg>`;
}

/** 브라우저 전용: SVG → PNG 바이트 (pptx 삽입용) */
export function svgToPng(svg: string): Promise<{ data: Uint8Array; w: number; h: number }> {
  const m = /width="(\d+)" height="(\d+)"/.exec(svg);
  const w = m ? +m[1] : 1000, h = m ? +m[2] : 500;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * 2; c.height = h * 2;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(bl => (bl ? bl.arrayBuffer().then(a => resolve({ data: new Uint8Array(a), w, h })) : reject(new Error('PNG 변환 실패'))), 'image/png');
    };
    img.onerror = () => reject(new Error('그래프 이미지 변환 실패'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
