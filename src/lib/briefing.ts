/* 브리핑 도메인 공통 로직 (서버·브라우저 공용) */
import * as P from './wx/parser.js';
import * as R from './wx/rules.js';
import { astroForDay } from './wx/astro.js';
import type { Astro, AvSummary, BriefingInput, BriefingRow, HazardState, Recommendation, Session, UnitSettings } from './types';

export const HOUR = 3600e3;
export const LEVELS: string[] = R.LEVELS;
export const HAZARDS: string[] = R.HAZARDS;
export const SESSION_LABEL: Record<Session, string> = { morning: '아침', evening: '저녁', extreme: '기상이변' };
export const LVL_COLOR: Record<number, { fill: string; color: string }> = {
  0: { fill: 'E7F4E8', color: '1F5F24' },
  1: { fill: 'FDF3DC', color: '8A5A00' },
  2: { fill: 'FDE8E8', color: 'A31515' }
};
export const CIVIL_FIELDS: [string, string, string][] = [
  ['tMin', '최저기온', '℃'], ['tMax', '최고기온', '℃'], ['feelsMax', '최고 체감온도', '℃'], ['feelsMin', '최저 체감온도', '℃'],
  ['pop', '강수확률', '%'], ['rain3h', '강수량 3h', 'mm'], ['rain12h', '강수량 12h', 'mm'], ['snow24h', '적설 24h', 'cm'],
  ['windMax', '최대 풍속', 'm/s'], ['gustMax', '최대 순간풍속', 'm/s'], ['pm10', 'PM10', '㎍/㎥']
];

export const num: (v: unknown) => number | null = R.num;
const pad = (n: number) => String(n).padStart(2, '0');
export const fmtV = (v: unknown, u?: string) => (v === null || v === undefined || v === '' ? '-' : `${v}${u || ''}`);

/* ---------- 시각 (모든 표기는 KST) ---------- */
export function kstStrToDate(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || '');
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 9 * HOUR) : null;
}
export function dateToKstStr(d: Date): string {
  const k = new Date(d.getTime() + 9 * HOUR);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}T${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`;
}
export function kstParts(d: Date) {
  const k = new Date(d.getTime() + 9 * HOUR);
  return { y: k.getUTCFullYear(), mo: k.getUTCMonth() + 1, d: k.getUTCDate(), h: k.getUTCHours(), mi: k.getUTCMinutes(), wd: '일월화수목금토'[k.getUTCDay()] };
}
export function fmtLong(d: Date | string | null): string {
  if (!d) return '-';
  const p = kstParts(new Date(d));
  return `${p.y}. ${p.mo}. ${p.d}.(${p.wd}) ${pad(p.h)}:${pad(p.mi)}`;
}
export function fmtShort(iso: string | null | undefined): string {
  if (!iso) return '-';
  const p = kstParts(new Date(iso));
  return `${p.mo}/${p.d} ${pad(p.h)}:${pad(p.mi)}`;
}
export function stamp(d?: Date): string {
  const p = kstParts(d || new Date());
  return `${p.y}${pad(p.mo)}${pad(p.d)}_${pad(p.h)}${pad(p.mi)}`;
}
export function defaultTarget(session: Session, now = new Date()): string {
  const p = kstParts(now);
  const day = `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
  if (session === 'morning') return `${day}T08:00`;
  if (session === 'evening') return `${day}T18:00`;
  return dateToKstStr(new Date(Math.ceil(now.getTime() / HOUR) * HOUR));
}
export function slotTimes(targetTime: string): Date[] {
  const ref = kstStrToDate(targetTime);
  if (!ref) return [];
  const p = kstParts(ref);
  const start = Date.UTC(p.y, p.mo - 1, p.d, Math.floor(p.h / 3) * 3) - 9 * HOUR;
  return Array.from({ length: 8 }, (_, i) => new Date(start + i * 3 * HOUR));
}

/* ---------- 항공기상 ---------- */
export function aviationEntries(reports: any[]): any[] {
  const out: any[] = [];
  const latest: Record<string, any> = {};
  reports.filter(r => r.type !== 'TAF' && r.summary).forEach(r => {
    const k = r.station || '?';
    if (!latest[k] || (r.issued && latest[k].issued && r.issued > latest[k].issued)) latest[k] = r;
  });
  Object.values(latest).forEach(r => out.push({ ...r.summary, temp: r.fields.temp, t: r.issued, point: true, src: '항공 관측(METAR)' }));
  reports.filter(r => r.type === 'TAF' && r.hours).forEach(r => {
    r.hours.forEach((h: any) => out.push({ ...h.worst, t: h.t, src: '항공 예보(TAF)', tags: h.tags }));
  });
  return out;
}
export function aviationSummary(av: any[], ov?: Record<string, any>): AvSummary {
  const s: AvSummary = { windKt: null, gustKt: null, visM: null, ceilFt: null, wxText: '', ts: false, precip: false };
  const wx: string[] = [];
  av.forEach(e => {
    if (e.windKt !== null && (s.windKt === null || e.windKt > s.windKt)) s.windKt = e.windKt;
    if (e.gustKt !== null && (s.gustKt === null || e.gustKt > s.gustKt)) s.gustKt = e.gustKt;
    if (e.visM !== null && (s.visM === null || e.visM < s.visM)) s.visM = e.visM;
    if (e.ceilFt !== null && (s.ceilFt === null || e.ceilFt < s.ceilFt)) s.ceilFt = e.ceilFt;
    (e.wxText || '').split(', ').filter(Boolean).forEach((w: string) => { if (!wx.includes(w)) wx.push(w); });
    if (e.flags && e.flags.ts) s.ts = true;
    if (e.flags && e.flags.precip) s.precip = true;
  });
  s.wxText = wx.join(', ');
  ov = ov || {};
  (['windKt', 'gustKt', 'visM', 'ceilFt'] as const).forEach(k => { if (num(ov![k]) !== null) s[k] = num(ov![k]); });
  if (ov.ts === 'yes') s.ts = true;
  if (ov.ts === 'no') s.ts = false;
  if (ov.precip === 'yes') s.precip = true;
  s.count = av.length;
  return s;
}

export function hourlyWithTimes(targetTime: string, hourly: Record<string, number>[]) {
  return slotTimes(targetTime).map((t, i) => ({ ...(hourly[i] || {}), t: t.toISOString() }));
}

export function deriveFromInput(input: Pick<BriefingInput, 'targetTime' | 'rawMetar' | 'rawTaf' | 'hourly' | 'avOverride'>) {
  const ref = kstStrToDate(input.targetTime) || new Date();
  const reports = P.parse(input.rawMetar || '', ref).reports.concat(P.parse(input.rawTaf || '', ref).reports);
  const av = aviationEntries(reports);
  return { ref, reports, av, hourly: hourlyWithTimes(input.targetTime, input.hourly || []), avSum: aviationSummary(av, input.avOverride) };
}

export function compactReports(reports: any[]) {
  return JSON.parse(JSON.stringify(reports.map(r => ({
    type: r.type, station: r.station, issued: r.issued, raw: r.raw, items: r.items, unparsed: r.unparsed, remarks: r.remarks, trend: r.trend,
    validFrom: r.validFrom || null, validTo: r.validTo || null,
    changes: (r.changes || []).map((c: any) => ({ kind: c.kind, from: c.from, to: c.to, items: c.fields.items }))
  }))));
}

/** 입력 → 판정 결과 (서버에서 저장 직전에 실행) */
export function evaluateInput(input: BriefingInput, settings: UnitSettings, prevRecs: Recommendation[] = []) {
  const d = deriveFromInput(input);
  const res = R.evaluate({ ref: d.ref, civil: input.civil, hourly: d.hourly, aviation: d.av, avOverride: input.avOverride, activeWarnings: input.activeWarnings }, settings);
  res.recs.forEach((r: Recommendation) => {
    r.ruleText = r.text;
    const p = prevRecs.find(x => x.id === r.id);
    if (p && p.edited && p.level === r.level) { r.text = p.text; r.edited = true; }
  });
  return {
    hazards: res.hazards as Record<string, HazardState>,
    recommendations: res.recs as Recommendation[],
    missing: res.missing as string[],
    parsed: compactReports(d.reports),
    av_summary: d.avSum,
    astro: astroFor(input.targetTime, settings)
  };
}

/** 대상일(KST 날짜)의 박명·월광. 위치가 없으면 null */
export function astroFor(targetTime: string, settings: UnitSettings): Astro | null {
  const ref = kstStrToDate(targetTime);
  const loc = settings.location;
  if (!ref || !loc || num(loc.lat) === null || num(loc.lon) === null) return null;
  const p = kstParts(ref);
  const dayStart = new Date(Date.UTC(p.y, p.mo - 1, p.d) - 9 * HOUR);
  return { ...astroForDay(dayStart, Number(loc.lat), Number(loc.lon)), lat: Number(loc.lat), lon: Number(loc.lon) };
}

/** 천문 자료가 없는 예전 브리핑은 부대 위치로 계산해 채움 */
export function ensureAstro<T extends Pick<BriefingRow, 'target_time' | 'astro'>>(b: T, settings: UnitSettings): T {
  return b.astro ? b : { ...b, astro: astroFor(dateToKstStr(new Date(b.target_time)), settings) };
}

export function hm(iso: string | null | undefined): string {
  if (!iso) return '-';
  const p = kstParts(new Date(iso));
  return `${pad(p.h)}:${pad(p.mi)}`;
}
/** 화면·출력 공용 천문 문구 */
export function astroText(a: Astro | null | undefined) {
  if (!a) return { twilight: '-', sun: '', moon: '-', moonTimes: '' };
  const mt = a.moonAlwaysUp ? '종일 떠 있음' : a.moonAlwaysDown ? '종일 지평선 아래' : `월출 ${hm(a.moonrise)} · 월몰 ${hm(a.moonset)}`;
  return {
    twilight: `${hm(a.bmnt)} / ${hm(a.eent)}`,
    sun: `일출 ${hm(a.sunrise)} · 일몰 ${hm(a.sunset)}`,
    moon: `${a.illumination}% ${a.phaseName}`,
    moonTimes: mt + (a.moonUpAtMidnight ? ' · 자정에 떠 있음' : ' · 자정에 짐')
  };
}

export function rowToInput(b: BriefingRow): BriefingInput {
  return {
    id: b.id, session: b.session, targetTime: dateToKstStr(new Date(b.target_time)), author: b.author,
    rawMetar: b.raw_metar, rawTaf: b.raw_taf, civil: b.civil || {}, hourly: b.hourly || [],
    activeWarnings: b.active_warnings || [], avOverride: b.av_override || {}, capturePaths: b.capture_paths || []
  };
}

/* ---------- 특보·요약 표기 ---------- */
export function hazardItems(hz: Record<string, HazardState> | null) {
  const items: { lvl: number; text: string }[] = [];
  const st = { cls: 'none' as 'none' | 'adv' | 'warn' };
  const bump = (c: string) => { if (c === 'warn' || (c === 'adv' && st.cls === 'none')) st.cls = c as 'adv' | 'warn'; };
  HAZARDS.forEach(h => {
    const x = (hz || {})[h];
    if (!x) return;
    if (x.issued) { items.push({ lvl: x.issued === 'warn' ? 2 : 1, text: `${h}${x.issued === 'warn' ? '경보' : '주의보'} 발령 중` }); bump(x.issued); }
    x.reasons.forEach(r => {
      const tag = r.stage === 'warn' ? '경보 기준 도달 예상' : r.stage === 'adv' ? '주의보 기준 도달 예상' : '주의보 기준 근접';
      items.push({ lvl: r.stage === 'warn' ? 2 : 1, text: `[${h} ${tag}] ${r.text}` });
      bump(r.stage === 'near' ? 'adv' : r.stage);
    });
  });
  return { items, cls: st.cls };
}
export function warningText(b: Pick<BriefingRow, 'hazards'>): string[] {
  const { items } = hazardItems(b.hazards);
  return items.length ? items.map(i => i.text) : ['발령 중인 특보 및 기준 도달 예상 없음'];
}
export function hzSummary(b: Pick<BriefingRow, 'hazards'>) {
  const out: { t: string; bad: boolean }[] = [];
  HAZARDS.forEach(h => {
    const x = (b.hazards || {})[h];
    if (!x) return;
    if (x.issued) out.push({ t: `${h}${x.issued === 'warn' ? '경보' : '주의보'}`, bad: x.issued === 'warn' });
    else if (x.reached === 'warn' || x.reached === 'adv') out.push({ t: `${h} ${x.reached === 'warn' ? '경보' : '주의보'}기준`, bad: x.reached === 'warn' });
  });
  return out;
}
export function summaryRows(b: Pick<BriefingRow, 'civil' | 'av_summary' | 'astro'>): [string, string][] {
  const c: any = b.civil || {}, a: any = b.av_summary || {};
  const t = astroText(b.astro);
  return [
    ['BMNT / EENT', b.astro ? `${t.twilight} (${t.sun})` : '-'],
    ['월광 (당일 자정)', b.astro ? `${t.moon} (${t.moonTimes})` : '-'],
    ['기온 (최저/최고)', `${fmtV(c.tMin)} / ${fmtV(c.tMax)} ℃`],
    ['체감온도 (최고/최저)', `${fmtV(c.feelsMax)} / ${fmtV(c.feelsMin ?? c.tMin)} ℃`],
    ['강수확률 / 강수량', `${fmtV(c.pop, '%')} / 3h ${fmtV(c.rain3h, 'mm')}, 12h ${fmtV(c.rain12h, 'mm')}`],
    ['적설(24h) / 하늘', `${fmtV(c.snow24h, 'cm')} / ${c.sky || '-'}`],
    ['바람 (민간)', `최대 ${fmtV(c.windMax, 'm/s')}, 순간 ${fmtV(c.gustMax, 'm/s')}`],
    ['바람 (항공)', `최대 ${fmtV(a.windKt, 'kt')}, 돌풍 ${fmtV(a.gustKt, 'kt')}`],
    ['시정 / 운고 (항공 최저)', `${a.visM !== null && a.visM !== undefined ? P.fmtVis({ m: a.visM }) : '-'} / ${a.ceilFt !== null && a.ceilFt !== undefined ? a.ceilFt.toLocaleString() + 'ft' : '없음'}`],
    ['일기현상 (항공)', a.wxText || '-'],
    ['미세먼지 PM10', fmtV(c.pm10, ' ㎍/㎥')]
  ];
}

/* ---------- 회차 비교 ---------- */
export function compareBriefings(a: BriefingRow, b: BriefingRow) {
  const rows: { group: string; label: string; prev: string; cur: string; changed: boolean; delta?: number | null }[] = [];
  CIVIL_FIELDS.forEach(([k, l, u]) => {
    const x = num((a.civil || {})[k]), y = num((b.civil || {})[k]);
    if (x === null && y === null) return;
    rows.push({ group: '민간', label: l, prev: fmtV(x, u), cur: fmtV(y, u), changed: x !== y, delta: x !== null && y !== null ? Math.round((y - x) * 10) / 10 : null });
  });
  const as: any = a.av_summary || {}, bs: any = b.av_summary || {};
  ([['windKt', '항공 최대풍속', 'kt'], ['gustKt', '항공 최대돌풍', 'kt'], ['visM', '항공 최저시정', 'm'], ['ceilFt', '항공 최저운고', 'ft']] as const).forEach(([k, l, u]) => {
    const x = as[k] ?? null, y = bs[k] ?? null;
    if (x === null && y === null) return;
    rows.push({ group: '항공', label: l, prev: fmtV(x, u), cur: fmtV(y, u), changed: x !== y, delta: x !== null && y !== null ? y - x : null });
  });
  const wl = (x: BriefingRow) => (x.active_warnings || []).map(w => w.type + (w.level === 'warn' ? '경보' : '주의보')).join(', ') || '없음';
  rows.push({ group: '특보', label: '발령 특보', prev: wl(a), cur: wl(b), changed: wl(a) !== wl(b) });
  const acts = b.recommendations.map(r => {
    const p = (a.recommendations || []).find(x => x.name === r.name);
    return { name: r.name, prev: p ? p.level : null, cur: r.level };
  });
  return { rows, acts };
}

/** 설정 저장값과 기본값 병합 */
export function normalizeSettings(s: any): UnitSettings {
  const d = R.defaultSettings() as UnitSettings;
  if (!s || typeof s !== 'object' || !Object.keys(s).length) return d;
  const out = Object.assign(d, s);
  out.ai = Object.assign(R.defaultSettings().ai, s.ai || {});
  if (out.ai.model === 'gemini-2.5-flash') out.ai.model = R.defaultSettings().ai.model;
  if (!Array.isArray(out.criteria) || !out.criteria.length) out.criteria = R.defaultCriteria();
  if (!Array.isArray(out.activities)) out.activities = R.defaultActivities();
  return out;
}

export function sampleTexts(targetTime: string) {
  const ref = kstStrToDate(targetTime) || new Date();
  const u = (d: Date) => ({ d: pad(d.getUTCDate()), h: pad(d.getUTCHours()) });
  const obs = u(new Date(Math.floor((ref.getTime() - HOUR) / HOUR) * HOUR));
  const iss = new Date(Math.floor((ref.getTime() - 2 * HOUR) / HOUR) * HOUR);
  const vf = new Date(iss.getTime() + HOUR), vt = new Date(vf.getTime() + 30 * HOUR);
  const b1 = new Date(vf.getTime() + 5 * HOUR), b2 = new Date(b1.getTime() + HOUR);
  const t1 = new Date(vf.getTime() + 7 * HOUR), t2 = new Date(t1.getTime() + 4 * HOUR);
  const x = u(new Date(vf.getTime() + 8 * HOUR)), n = u(vf);
  const P2 = (a: Date, b: Date) => `${u(a).d}${u(a).h}/${u(b).d}${u(b).h}`;
  return {
    metar: `METAR RKSO ${obs.d}${obs.h}00Z 33012G25KT 4000 -RA BR SCT008 BKN015 OVC030 08/06 Q1012 NOSIG=`,
    taf: `TAF RKSO ${u(iss).d}${u(iss).h}00Z ${P2(vf, vt)} 33010KT 6000 BR SCT010 BKN025 QNH2990INS\n  BECMG ${P2(b1, b2)} 32018G30KT 9999 NSW SCT030\n  TEMPO ${P2(t1, t2)} 3000 -SHRA BKN012 TX15/${x.d}${x.h}Z TN03/${n.d}${n.h}Z=`
  };
}
