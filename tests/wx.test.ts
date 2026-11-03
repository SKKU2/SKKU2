import { describe, expect, it } from 'vitest';
import * as P from '../src/lib/wx/parser.js';
import * as R from '../src/lib/wx/rules.js';
import * as G from '../src/lib/wx/advisor.js';
import { MiniPptx, crc32 } from '../src/lib/wx/pptx.js';
import { astroForDay, moonIllumination } from '../src/lib/wx/astro.js';
import { ID_RE, normalizeId, toEmail } from '../src/lib/account';
import { evaluateInput, kstStrToDate } from '../src/lib/briefing';

const REF = new Date('2026-11-02T22:00:00Z'); // 11/3 07:00 KST
const one = (t: string) => P.parse(t, REF).reports[0];
const levels = (res: any) => Object.fromEntries(res.recs.map((r: any) => [r.id, r.level]));
const run = (input: any, s?: any) => R.evaluate({ ref: REF, ...input }, s || R.defaultSettings());
const avFrom = (text: string) => P.parse(text, REF).reports.flatMap((r: any) => r.type === 'TAF'
  ? r.hours.map((h: any) => ({ ...h.worst, t: h.t, src: '항공 예보(TAF)' }))
  : [{ ...r.summary, temp: r.fields.temp, t: r.issued, point: true, src: '항공 관측(METAR)' }]);
const hourAt = (taf: any, iso: string) => taf.hours.find((h: any) => h.t.toISOString() === iso);

const TAF1 = 'TAF RKSO 022000Z 0221/0403 33010KT 6000 BR SCT010 BKN025 QNH2990INS\nBECMG 0303/0304 32018G28KT 9999 NSW SCT030\nTEMPO 0306/0310 3000 -SHRA BKN012 TX15/0305Z TN03/0221Z=';
const TAF2 = 'TAF RKSG 022300Z 0300/0324 VRB05KT 9999 FEW040 FM031200 27020G35KT 4000 TSRA BKN015CB PROB30 0315/0318 1200 +TSRA';

describe('전문 해석', () => {
  it('METAR 기본', () => {
    const r = one('METAR RKSO 022100Z 33012G25KT 4000 -RA BR SCT008 BKN015 OVC030 08/06 Q1012 NOSIG=');
    expect(P.fmtKst(r.issued)).toBe('3일 06:00');
    const s = r.summary;
    expect([s.dir, s.windKt, s.gustKt, s.visM, s.ceilFt]).toEqual([330, 12, 25, 4000, 1500]);
    expect(s.wx).toEqual(['-RA', 'BR']);
    expect([r.fields.temp, r.fields.dew, r.fields.qnh.hpa]).toEqual([8, 6, 1012]);
    expect(r.unparsed).toEqual([]);
  });
  it('무풍·안개·수직시정·inHg·RMK', () => {
    const r = one('METAR RKSG 022055Z 00000KT 0800 FG VV002 M02/M02 A3001 RMK AO2 SLP165');
    expect([r.summary.windKt, r.summary.visM, r.summary.ceilFt, r.fields.temp, r.fields.qnh.inHg]).toEqual([0, 800, 200, -2, 30.01]);
    expect(r.remarks).toBe('AO2 SLP165');
  });
  it('SPECI 뇌우·CB', () => {
    const s = one('SPECI RKTH 022130Z 27015G30KT 1600 +TSRA FEW010CB BKN020 21/19 Q1003').summary;
    expect(s.flags.ts && s.cb).toBe(true);
    expect([s.gustKt, s.visM, s.ceilFt]).toEqual([30, 1600, 2000]);
  });
  it('MPS·9999', () => expect(one('METAR RKNN 022100Z 05008MPS 9999 FEW030 15/03 Q1020').summary.windKt).toBe(15.6));
  it('SM 시정', () => expect(one('METAR RKSO 022100Z 18010KT 1 1/2SM -SN BR OVC006 M01/M03 A2992').summary.visM).toBe(2414));
  it('CAVOK·색상코드', () => {
    const r = one('METAR RKSS 022100Z VRB03KT CAVOK 12/05 Q1018 WHT');
    expect([r.summary.visM, r.summary.ceilFt, r.fields.color, r.unparsed.length]).toEqual([10000, null, 'WHT', 0]);
  });
  it('TAF BECMG/TEMPO 펼침', () => {
    const t = P.parse(TAF1, REF).tafs[0];
    expect([t.hours.length, t.changes.length, t.unparsed.length]).toEqual([30, 2, 0]);
    expect(hourAt(t, '2026-11-03T03:00:00.000Z').worst.gustKt).toBe(28);
    expect(hourAt(t, '2026-11-03T05:00:00.000Z').prevail.windKt).toBe(18);
    expect(hourAt(t, '2026-11-03T07:00:00.000Z').worst.visM).toBe(3000);
    expect(hourAt(t, '2026-11-03T11:00:00.000Z').worst.visM).toBe(10000);
  });
  it('TAF FM·PROB30', () => {
    const t = P.parse(TAF2, REF).tafs[0];
    expect(hourAt(t, '2026-11-03T12:00:00.000Z').prevail.flags.ts).toBe(true);
    expect(hourAt(t, '2026-11-03T16:00:00.000Z').worst.visM).toBe(1200);
  });
  it('해석 실패 토큰 보존', () => expect(one('METAR RKSO 022100Z 33012KT 9999 XYZ123 SCT030').unparsed).toEqual(['XYZ123']));
});

describe('규칙 판정', () => {
  it('입력 없음 → 정상', () => expect(run({}).recs.every((r: any) => r.level === 0)).toBe(true));
  it('순간풍속 22m/s', () => {
    const res = run({ civil: { gustMax: 22 } });
    const l = levels(res);
    expect([l.field, l.shoot, l.march, l.vehicle, l.guard, l.heli]).toEqual([2, 2, 1, 0, 1, 2]);
    expect(res.recs[0].reasons.some((x: any) => x.text.includes('순간풍속 22m/s ≥ 강풍주의보 기준 20m/s'))).toBe(true);
  });
  it('호우경보 → 중단, 경계근무 조정', () => {
    const l = levels(run({ activeWarnings: [{ type: '호우', level: 'warn' }] }));
    expect([l.field, l.vehicle, l.guard]).toEqual([2, 2, 1]);
  });
  it('뇌우 → 야외훈련·헬기 중단', () => {
    const l = levels(run({ aviation: avFrom('SPECI RKTH 022130Z 27015G30KT 1600 +TSRA FEW010CB BKN020 21/19 Q1003') }));
    expect([l.field, l.heli, l.vehicle]).toEqual([2, 2, 0]);
  });
  it('산지 기준', () => {
    const s = R.defaultSettings(); s.region = 'mountain';
    expect((run({ civil: { gustMax: 22 } }, s).hazards as any)['강풍'].reached).toBe('near');
  });
  it('한파주의보 기준 → 행군 중단', () => expect(levels(run({ civil: { tMin: -13 } })).march).toBe(2));
  it('수동 보정 시정 400m → 사격 중단', () => expect(levels(run({ aviation: avFrom(TAF1), avOverride: { visM: 400 } })).shoot).toBe(2));
  it('evaluateInput: 편집 문구 유지', () => {
    const input: any = { session: 'morning', targetTime: '2026-11-03T08:00', author: '', rawMetar: '', rawTaf: '', civil: { gustMax: 22 }, hourly: [], activeWarnings: [], avOverride: {}, capturePaths: [] };
    const settings = R.defaultSettings() as any;
    const first = evaluateInput(input, settings);
    const edited = first.recommendations.map(r => (r.id === 'shoot' ? { ...r, text: '직접 수정', edited: true } : r));
    const again = evaluateInput(input, settings, edited);
    expect(again.recommendations.find(r => r.id === 'shoot')!.text).toBe('직접 수정');
    expect(kstStrToDate('2026-11-03T08:00')!.toISOString()).toBe('2026-11-02T23:00:00.000Z');
  });
});

describe('AI 안전장치', () => {
  it('하향 무시·상향 반영·형태 조정 상한', () => {
    expect(G.merge([{ id: 'x', name: '사격', level: 1, ruleLevel: 1, reasons: [], text: 't' }], { activities: [{ name: '사격', level: '정상', advice: '' }] })[0].level).toBe(1);
    const up = G.merge([{ id: 'x', name: '행군', level: 0, ruleLevel: 0, reasons: [], text: 't' }], { activities: [{ name: '행군', level: '중단', advice: 'a' }] })[0];
    expect([up.level, up.source]).toEqual([2, 'AI 상향']);
    expect(G.merge([{ id: 'guard', name: '경계근무', level: 0, ruleLevel: 0, reasons: [], text: 't' }], { activities: [{ name: '경계근무', level: '중단', advice: 'a' }] }, { guard: 1 })[0].level).toBe(1);
  });
  it('허용 목록', () => {
    const res = run({ civil: { gustMax: 22 }, aviation: avFrom('METAR RKSO 022100Z 33012G25KT 4000 -RA BKN015 08/06 Q1012') });
    res.recs[0].reasons.push({ lvl: 1, text: '테스트 RKSO 근거' });
    const p: any = G.buildPayload({ session: 'morning', region: 'land', civil: { gustMax: 22 }, recs: res.recs, unitName: '제99보병대대', author: '홍길동', memo: '비밀메모' } as any);
    G.assertAllowlist(p);
    const s = JSON.stringify(p);
    ['제99보병대대', '홍길동', '비밀메모', 'RKSO'].forEach(w => expect(s.includes(w)).toBe(false));
    p.부대명 = 'x';
    expect(() => G.assertAllowlist(p)).toThrow();
  });
  it('장애 시 예외 (네트워크·HTTP·형식·시간초과·꺼짐)', async () => {
    await expect(G.requestAdvice({}, { enabled: true, apiKey: 'k', fetchImpl: () => Promise.reject(new TypeError('x')) })).rejects.toThrow(/네트워크/);
    await expect(G.requestAdvice({}, { enabled: true, apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }) })).rejects.toThrow(/HTTP 403/);
    await expect(G.requestAdvice({}, { enabled: true, apiKey: 'k', fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'x' }] } }] }) }) })).rejects.toThrow(/JSON/);
    const hang = (_u: string, init: any) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))));
    await expect(G.requestAdvice({}, { enabled: true, apiKey: 'k', timeoutMs: 30, fetchImpl: hang })).rejects.toThrow(/시간 초과/);
    let calls = 0;
    await expect(G.requestAdvice({}, { enabled: false, apiKey: 'k', fetchImpl: async () => { calls++; return {}; } })).rejects.toThrow(/꺼져/);
    expect(calls).toBe(0);
  });
  it('요청 형식: 3.x는 temperature 미전송, 스키마 거부 시 재시도', async () => {
    const bodies: any[] = [];
    const ok = { summary: 's', risks: [], activities: [], uncertainty: '' };
    const f = async (_u: string, init: any) => {
      bodies.push(JSON.parse(init.body));
      return bodies.length === 1
        ? { ok: false, status: 400, json: async () => ({ error: { message: 'unknown field responseSchema' } }) }
        : { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(ok) }] } }] }) };
    };
    const r = await G.requestAdvice({}, { enabled: true, apiKey: 'k', model: 'gemini-3.8-flash', fetchImpl: f });
    expect(r.summary).toBe('s');
    expect('temperature' in bodies[0].generationConfig).toBe(false);
    expect(bodies[1].generationConfig.responseSchema).toBeUndefined();
  });
});

describe('박명·월광', () => {
  it('서울 2026-11-03: 일출몰·항해박명 (한국천문연구원 값과 ±3분)', () => {
    const a = astroForDay(new Date('2026-11-02T15:00:00Z'), 37.5665, 126.978);
    const kmin = (iso: string) => { const d = new Date(new Date(iso).getTime() + 9 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
    expect(Math.abs(kmin(a.sunrise!) - (7 * 60 + 0))).toBeLessThanOrEqual(3);
    expect(Math.abs(kmin(a.sunset!) - (17 * 60 + 36))).toBeLessThanOrEqual(3);
    expect(kmin(a.bmnt!)).toBeLessThan(kmin(a.sunrise!));
    expect(kmin(a.eent!)).toBeGreaterThan(kmin(a.sunset!));
  });
  it('월광: 2024-01-25 보름 ≈ 100%, 2024-01-11 삭 ≈ 0%', () => {
    expect(moonIllumination(new Date('2024-01-25T18:00:00Z')).fraction).toBeGreaterThan(0.99);
    expect(moonIllumination(new Date('2024-01-11T12:00:00Z')).fraction).toBeLessThan(0.01);
  });
  it('판단 결과에 천문 자료 포함', () => {
    const input: any = { session: 'morning', targetTime: '2026-11-03T08:00', author: '', rawMetar: '', rawTaf: '', civil: {}, hourly: [], activeWarnings: [], avOverride: {}, capturePaths: [] };
    const ev = evaluateInput(input, R.defaultSettings() as any);
    expect(ev.astro?.phaseName).toBeTruthy();
    expect(ev.astro?.illumination).toBeGreaterThanOrEqual(0);
  });
});

describe('계정 아이디', () => {
  it('아이디 규칙과 내부 주소', () => {
    expect(['21-12345', 'kim.cs', 'admin_01'].every(s => ID_RE.test(s))).toBe(true);
    expect(['ab', 'Kim', '홍길동', 'a b', '-abc', 'x'.repeat(33)].some(s => ID_RE.test(s))).toBe(false);
    expect(normalizeId('  Kim.CS ')).toBe('kim.cs');
    expect(toEmail('Kim.CS')).toBe('kim.cs@id.wxbrief.local');
  });
});

describe('pptx', () => {
  it('ZIP 구조·CRC', () => {
    const deck = new MiniPptx({ title: '시험 <&>' });
    deck.addSlide().addText('한글 & <꺾쇠>', { x: 1, y: 1, w: 5, h: 1 }).addTable([['a', 'b']], { x: 1, y: 2, colW: [2, 2] });
    const z: Uint8Array = deck.build();
    const dv = new DataView(z.buffer);
    const names: string[] = [];
    let p = 0;
    while (dv.getUint32(p, true) === 0x04034b50) {
      const size = dv.getUint32(p + 18, true), nl = dv.getUint16(p + 26, true);
      const name = new TextDecoder().decode(z.subarray(p + 30, p + 30 + nl));
      expect(crc32(z.subarray(p + 30 + nl, p + 30 + nl + size))).toBe(dv.getUint32(p + 14, true));
      names.push(name);
      p += 30 + nl + size;
    }
    expect(names).toContain('ppt/slides/slide1.xml');
    expect(names[0]).toBe('[Content_Types].xml');
  });
});
