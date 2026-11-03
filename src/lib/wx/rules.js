/* ===== wx_rules.js : 부대운용 판단 규칙 엔진 (기준표 비교, 안전 하한선) ===== */

const LEVELS = ['정상', '조정', '중단'];
const HAZARDS = ['폭염', '한파', '호우', '대설', '강풍', '태풍', '황사'];
const OPS = { ge: '≥', gt: '>', le: '≤', lt: '<', is: '' };
const HOUR = 3600e3;
const KT_PER_MS = 1.943844;

const METRICS = {
  tMin: { label: '최저기온', unit: '℃' },
  tMax: { label: '최고기온', unit: '℃' },
  feelsMax: { label: '최고 체감온도', unit: '℃' },
  feelsMin: { label: '최저 체감온도', unit: '℃' },
  pop: { label: '강수확률', unit: '%' },
  rain3h: { label: '3시간 강수량', unit: 'mm' },
  rain12h: { label: '12시간 강수량', unit: 'mm' },
  snow24h: { label: '24시간 신적설', unit: 'cm' },
  windMs: { label: '풍속', unit: 'm/s' },
  gustMs: { label: '순간풍속', unit: 'm/s' },
  windKt: { label: '풍속', unit: 'kt' },
  gustKt: { label: '돌풍', unit: 'kt' },
  visKm: { label: '시정', unit: 'km' },
  ceilingFt: { label: '운고', unit: 'ft' },
  pm10: { label: 'PM10', unit: '㎍/㎥' },
  precip: { label: '강수', bool: true },
  snowing: { label: '강설·적설', bool: true },
  icing: { label: '결빙 예상', bool: true },
  ts: { label: '뇌우', bool: true }
};

function cond(metric, op, value, level) { return { metric, op, value, level }; }

function defaultCriteria() {
  return [
    { id: 'heat', hazard: '폭염', metric: 'feelsMax', dir: 'ge', adv: 33, warn: 35, mAdv: null, mWarn: null, label: '일 최고체감온도', note: '2일 이상 지속 여부 확인' },
    { id: 'cold', hazard: '한파', metric: 'tMin', dir: 'le', adv: -12, warn: -15, mAdv: null, mWarn: null, label: '아침 최저기온', note: '2일 이상 지속·급강하 여부 확인' },
    { id: 'rain3h', hazard: '호우', metric: 'rain3h', dir: 'ge', adv: 60, warn: 90, mAdv: null, mWarn: null, label: '3시간 강수량' },
    { id: 'rain12h', hazard: '호우', metric: 'rain12h', dir: 'ge', adv: 110, warn: 180, mAdv: null, mWarn: null, label: '12시간 강수량' },
    { id: 'snow', hazard: '대설', metric: 'snow24h', dir: 'ge', adv: 5, warn: 20, mAdv: 5, mWarn: 30, label: '24시간 신적설' },
    { id: 'wind', hazard: '강풍', metric: 'windMs', dir: 'ge', adv: 14, warn: 21, mAdv: 17, mWarn: 24, label: '풍속' },
    { id: 'gust', hazard: '강풍', metric: 'gustMs', dir: 'ge', adv: 20, warn: 26, mAdv: 25, mWarn: 30, label: '순간풍속' },
    { id: 'dust', hazard: '황사', metric: 'pm10', dir: 'ge', adv: null, warn: 800, mAdv: null, mWarn: null, label: 'PM10(1시간 평균)', note: '2시간 이상 지속 여부 확인' }
  ];
}

function defaultActivities() {
  return [
    {
      id: 'field', name: '야외 교육훈련', hazards: HAZARDS.slice(), stopOnAdvisory: HAZARDS.slice(), tsStop: true, capAdjust: false,
      conds: [cond('feelsMax', 'ge', 31, 1), cond('tMin', 'le', -10, 1), cond('precip', 'is', true, 1)],
      tpl: ['{활동} 정상 시행', '{활동} 조정 건의 – {근거}. 시간·장소 조정, 휴식 및 보호대책 강화', '{활동} 중단 건의 – {근거}. 실내 교육으로 전환']
    },
    {
      id: 'shoot', name: '사격', hazards: HAZARDS.slice(), stopOnAdvisory: ['강풍'], tsStop: true, capAdjust: false,
      conds: [cond('visKm', 'lt', 1, 1), cond('windMs', 'ge', 10, 1), cond('precip', 'is', true, 1), cond('visKm', 'lt', 0.5, 2)],
      tpl: ['{활동} 정상 시행', '{활동} 조정 건의 – {근거}. 사격 통제·표적 확인 강화, 필요 시 시간 조정', '{활동} 중단 건의 – {근거}']
    },
    {
      id: 'march', name: '행군', hazards: HAZARDS.slice(), stopOnAdvisory: ['폭염', '한파', '대설', '호우'], tsStop: true, capAdjust: false,
      conds: [cond('feelsMax', 'ge', 31, 1), cond('tMin', 'le', -10, 1), cond('snowing', 'is', true, 1)],
      tpl: ['{활동} 정상 시행', '{활동} 조정 건의 – {근거}. 거리·경로 단축, 휴식 증가', '{활동} 중단 건의 – {근거}']
    },
    {
      id: 'vehicle', name: '차량 운행', hazards: ['대설', '호우', '태풍'], stopOnAdvisory: [], tsStop: false, capAdjust: false,
      conds: [cond('visKm', 'lt', 1, 1), cond('icing', 'is', true, 1), cond('visKm', 'lt', 0.2, 2)],
      tpl: ['{활동} 정상 시행', '{활동} 조정 건의 – {근거}. 저속·차간거리 확보, 선도차량 운용', '{활동} 중단 건의 – {근거}. 긴급 운행만 승인 후 실시']
    },
    {
      id: 'guard', name: '경계근무', hazards: HAZARDS.slice(), stopOnAdvisory: [], tsStop: false, capAdjust: true,
      conds: [cond('feelsMax', 'ge', 31, 1), cond('feelsMin', 'le', -10, 1), cond('ts', 'is', true, 1)],
      tpl: ['{활동} 정상 시행', '{활동} 형태 조정 건의 – {근거}. 근무시간 단축, 보호장구 착용', '{활동} 형태 조정 건의 – {근거}. 근무시간 단축, 보호장구 착용']
    },
    {
      id: 'pt', name: '체력단련', hazards: HAZARDS.slice(), stopOnAdvisory: ['폭염'], tsStop: true, capAdjust: false,
      conds: [cond('feelsMax', 'ge', 31, 1), cond('pm10', 'ge', 150, 1), cond('pm10', 'ge', 300, 2)],
      tpl: ['{활동} 정상 시행', '{활동} 조정 건의 – {근거}. 강도 조절 또는 실내 대체', '{활동} 중단 건의 – {근거}']
    },
    {
      id: 'heli', name: '헬기 지원', hazards: ['강풍', '호우', '대설', '태풍', '황사'], stopOnAdvisory: [], tsStop: true, capAdjust: false,
      conds: [cond('visKm', 'lt', 5, 1), cond('ceilingFt', 'lt', 1500, 1), cond('windKt', 'ge', 15, 1),
        cond('visKm', 'lt', 1.6, 2), cond('ceilingFt', 'lt', 500, 2), cond('gustKt', 'ge', 25, 2)],
      tpl: ['{활동} 정상 시행', '{활동} 조정 건의 – {근거}. 항공부대와 기상 재확인', '{활동} 중단 건의 – {근거}']
    }
  ];
}

function defaultSettings() {
  return {
    version: 1,
    region: 'land',
    approachRatio: 0.8,
    popThreshold: 60,
    criteria: defaultCriteria(),
    activities: defaultActivities(),
    // 엔드포인트·API 키·시간 제한은 서버 환경변수(GEMINI_*)로 관리
    ai: { enabled: false, model: 'gemini-3.8-flash', includeInOutputs: true }
  };
}

/* ---------- 유틸 ---------- */
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}
function r1(n) { return Math.round(n * 10) / 10; }
function fmtN(n) { return Number.isInteger(n) ? String(n) : String(r1(n)); }
function cmp(v, op, th) {
  if (op === 'is') return v === true;
  if (v === null || v === undefined) return false;
  switch (op) {
    case 'ge': return v >= th;
    case 'gt': return v > th;
    case 'le': return v <= th;
    case 'lt': return v < th;
  }
  return false;
}
function worstEntry(hits, op) {
  if (op === 'le' || op === 'lt') return hits.reduce((a, b) => (b.v < a.v ? b : a));
  if (op === 'is') return hits[0];
  return hits.reduce((a, b) => (b.v > a.v ? b : a));
}
function kstHour(d) { return new Date(d.getTime() + 9 * HOUR); }
function hourLabel(d, refDay) {
  const k = kstHour(d);
  const h = String(k.getUTCHours()).padStart(2, '0');
  return k.getUTCDate() === refDay ? `${h}시` : `${k.getUTCDate()}일 ${h}시`;
}
function hm(d) {
  const k = kstHour(d);
  return `${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`;
}

/** 근거 출처 요약: 출처별로 시간대를 묶어 "항공 예보(TAF) 15~18시" 형태로 */
function srcSummary(hits, ref) {
  const refDay = ref ? kstHour(ref).getUTCDate() : null;
  const groups = new Map();
  hits.forEach(e => {
    if (!groups.has(e.src)) groups.set(e.src, []);
    groups.get(e.src).push(e);
  });
  const parts = [];
  groups.forEach((list, src) => {
    const timed = list.filter(e => e.t).sort((a, b) => a.t - b.t);
    if (!timed.length) { parts.push(src); return; }
    if (timed[0].point) { parts.push(`${src} ${timed.map(e => hm(e.t)).join(', ')}`); return; }
    const step = timed[0].step || HOUR;
    const ranges = [];
    timed.forEach(e => {
      const last = ranges[ranges.length - 1];
      if (last && e.t.getTime() - last.end.getTime() <= 0) last.end = new Date(e.t.getTime() + step);
      else ranges.push({ start: e.t, end: new Date(e.t.getTime() + step) });
    });
    parts.push(`${src} ${ranges.map(r => `${hourLabel(r.start, refDay)}~${hourLabel(r.end, kstHour(r.start).getUTCDate()).replace(/^\d+일 /, '')}`).join(', ')}`);
  });
  return parts.join(', ');
}

/* ---------- 관측·예보값 수집 ---------- */
function buildObs(input, settings) {
  const o = {};
  Object.keys(METRICS).forEach(k => { o[k] = []; });
  const add = (k, v, src, extra) => {
    if (v === null || v === undefined || (typeof v === 'number' && !isFinite(v))) return;
    o[k].push(Object.assign({ v, src, t: null }, extra || {}));
  };
  const c = input.civil || {};
  const civ = '민간 입력';
  const tMin = num(c.tMin);
  add('tMin', tMin, civ);
  add('tMax', num(c.tMax), civ);
  add('feelsMax', num(c.feelsMax), civ);
  if (num(c.feelsMin) !== null) add('feelsMin', num(c.feelsMin), civ);
  else add('feelsMin', tMin, '민간 입력(최저기온으로 대체)');
  add('pop', num(c.pop), civ);
  add('rain3h', num(c.rain3h), civ);
  add('rain12h', num(c.rain12h), civ);
  add('snow24h', num(c.snow24h), civ);
  add('pm10', num(c.pm10), civ);
  const wMax = num(c.windMax), gMax = num(c.gustMax);
  add('windMs', wMax, civ);
  add('gustMs', gMax, civ);
  if (wMax !== null) add('windKt', r1(wMax * KT_PER_MS), '민간 입력(환산)');
  if (gMax !== null) add('gustKt', r1(gMax * KT_PER_MS), '민간 입력(환산)');

  const popTh = num(settings.popThreshold) ?? 60;
  if (num(c.pop) !== null && num(c.pop) >= popTh) add('precip', true, `민간 강수확률 ${num(c.pop)}%`);
  if ((num(c.rain3h) || 0) > 0 || (num(c.rain12h) || 0) > 0) add('precip', true, '민간 예상 강수량');
  const sky = c.sky || '';
  if (/비|눈|소나기/.test(sky)) add('precip', true, `민간 하늘상태(${sky})`);
  if ((num(c.snow24h) || 0) > 0) add('snowing', true, '민간 예상 적설');
  if (/눈/.test(sky)) add('snowing', true, `민간 하늘상태(${sky})`);

  // 민간 시간대별 (3시간 간격)
  const hs = { src: '민간 시간대', step: 3 * HOUR };
  (input.hourly || []).forEach(h => {
    const t = h.t ? new Date(h.t) : null;
    if (!t) return;
    const ex = Object.assign({ t }, hs);
    add('tMin', num(h.temp), hs.src, ex);
    add('tMax', num(h.temp), hs.src, ex);
    add('windMs', num(h.wind), hs.src, ex);
    if (num(h.wind) !== null) add('windKt', r1(num(h.wind) * KT_PER_MS), '민간 시간대(환산)', ex);
    add('rain3h', num(h.rain), hs.src, ex);
    if ((num(h.rain) || 0) > 0) add('precip', true, hs.src, ex);
    if (num(h.pop) !== null && num(h.pop) >= popTh) add('precip', true, `민간 시간대 강수확률≥${popTh}%`, ex);
  });

  // 항공기상 (METAR 최신 관측 + TAF 시간대별 최악값)
  const temps = o.tMin.map(e => e.v);
  (input.aviation || []).forEach(e => {
    const ex = { t: e.t ? new Date(e.t) : null, point: !!e.point, step: HOUR, av: true };
    const src = e.src;
    if (e.windKt !== null && e.windKt !== undefined) { add('windKt', e.windKt, src, ex); add('windMs', r1(e.windKt / KT_PER_MS), src, ex); }
    if (e.gustKt !== null && e.gustKt !== undefined) { add('gustKt', e.gustKt, src, ex); add('gustMs', r1(e.gustKt / KT_PER_MS), src, ex); }
    if (e.visM !== null && e.visM !== undefined) add('visKm', r1(e.visM / 1000), src, ex);
    if (e.ceilFt !== null && e.ceilFt !== undefined) add('ceilingFt', e.ceilFt, src, ex);
    const f = e.flags || {};
    if (f.ts) add('ts', true, src, ex);
    if (f.precip) add('precip', true, src, ex);
    if (f.snow) add('snowing', true, src, ex);
    if (f.freezing) add('icing', true, `${src} 어는 강수/안개`, ex);
    if (e.temp !== null && e.temp !== undefined) temps.push(e.temp);
  });

  // 수동 보정값이 있으면 해당 항공 지표를 대체
  const ov = input.avOverride || {};
  const replace = (keys, entries) => {
    keys.forEach(k => { o[k] = o[k].filter(e => !e.av); });
    entries.forEach(([k, v]) => add(k, v, '항공 수동 보정', { av: true }));
  };
  if (num(ov.windKt) !== null) replace(['windKt'], [['windKt', num(ov.windKt)], ['windMs', r1(num(ov.windKt) / KT_PER_MS)]]);
  if (num(ov.gustKt) !== null) replace(['gustKt'], [['gustKt', num(ov.gustKt)], ['gustMs', r1(num(ov.gustKt) / KT_PER_MS)]]);
  if (num(ov.visM) !== null) replace(['visKm'], [['visKm', r1(num(ov.visM) / 1000)]]);
  if (num(ov.ceilFt) !== null) replace(['ceilingFt'], [['ceilingFt', num(ov.ceilFt)]]);
  if (ov.ts === 'yes') replace(['ts'], [['ts', true]]);
  if (ov.ts === 'no') replace(['ts'], []);
  if (ov.precip === 'yes') add('precip', true, '항공 수동 보정', { av: true });

  const minT = temps.length ? Math.min.apply(null, temps) : null;
  if (minT !== null && minT <= 0 && o.precip.length) add('icing', true, `기온 ${fmtN(minT)}℃ 이하 + 강수`);
  if (o.snowing.length && minT !== null && minT <= 0) add('icing', true, '영하 기온 + 강설');
  return o;
}

function evalCond(c, obs, ref) {
  const meta = METRICS[c.metric];
  if (!meta) return null;
  const list = obs[c.metric] || [];
  const hits = meta.bool ? list.filter(e => e.v === true) : list.filter(e => cmp(e.v, c.op, num(c.value)));
  if (!hits.length) return null;
  const rep = worstEntry(hits, c.op);
  const text = meta.bool
    ? `${meta.label} (${srcSummary(hits, ref)})`
    : `${meta.label} ${fmtN(rep.v)}${meta.unit} ${OPS[c.op]} ${fmtN(num(c.value))}${meta.unit} (${srcSummary(hits, ref)})`;
  return { hits, rep, text, short: meta.bool ? meta.label : `${meta.label} ${fmtN(rep.v)}${meta.unit}` };
}

const STAGE_RANK = { near: 1, adv: 2, warn: 3 };

function evalHazards(obs, active, settings, ref) {
  const res = {};
  HAZARDS.forEach(h => { res[h] = { issued: null, reached: null, reasons: [] }; });
  (active || []).forEach(w => {
    const r = res[w.type];
    if (!r) return;
    if (!r.issued || (w.level === 'warn' && r.issued === 'adv')) r.issued = w.level;
  });
  const mountain = settings.region === 'mountain';
  const ratio = num(settings.approachRatio) ?? 0.8;
  (settings.criteria || []).forEach(cr => {
    const meta = METRICS[cr.metric] || { unit: '' };
    const unit = meta.unit;
    const adv = mountain && num(cr.mAdv) !== null ? num(cr.mAdv) : num(cr.adv);
    const warn = mountain && num(cr.mWarn) !== null ? num(cr.mWarn) : num(cr.warn);
    const list = obs[cr.metric] || [];
    if (!list.length || !res[cr.hazard]) return;
    const check = th => (th === null ? [] : list.filter(e => cmp(e.v, cr.dir, th)));
    let stage = null, hits = [], label = '';
    if ((hits = check(warn)).length) { stage = 'warn'; label = `${cr.hazard}경보 기준 ${fmtN(warn)}${unit}`; }
    else if ((hits = check(adv)).length) { stage = 'adv'; label = `${cr.hazard}주의보 기준 ${fmtN(adv)}${unit}`; }
    else if (ratio > 0 && ratio < 1) {
      const base = adv !== null ? adv : warn;
      if (base !== null) {
        const nearTh = r1(base * ratio);
        if ((hits = check(nearTh)).length) {
          stage = 'near';
          label = `${cr.hazard}${adv !== null ? '주의보' : '경보'} 기준(${fmtN(base)}${unit})의 ${Math.round(ratio * 100)}%인 ${fmtN(nearTh)}${unit}`;
        }
      }
    }
    if (!stage) return;
    const rep = worstEntry(hits, cr.dir);
    const note = cr.note && stage !== 'near' ? `, ${cr.note}` : '';
    const text = `${cr.label} ${fmtN(rep.v)}${unit} ${OPS[cr.dir]} ${label} (${srcSummary(hits, ref)}${note})`;
    const r = res[cr.hazard];
    r.reasons.push({ stage, text });
    if (!r.reached || STAGE_RANK[stage] > STAGE_RANK[r.reached]) r.reached = stage;
  });
  return res;
}

function fillTemplate(act, level, reasons) {
  const tpl = (act.tpl && act.tpl[level]) || ['{활동} 정상 시행', '{활동} 조정 건의 – {근거}', '{활동} 중단 건의 – {근거}'][level];
  const top = reasons.filter(r => r.lvl === reasons[0].lvl).slice(0, 2).map(r => r.short || r.text);
  return tpl.replace(/\{활동\}/g, act.name).replace(/\{근거\}/g, top.join(', ') || '-');
}

function evalActivity(act, obs, hazards, ref) {
  const reasons = [];
  const stopAdv = act.stopOnAdvisory || [];
  (act.hazards || HAZARDS).forEach(hz => {
    const h = hazards[hz];
    if (!h) return;
    if (h.issued) {
      const lvl = h.issued === 'warn' || stopAdv.includes(hz) ? 2 : 1;
      reasons.push({ lvl, text: `${hz}${h.issued === 'warn' ? '경보' : '주의보'} 발령 중`, short: `${hz}${h.issued === 'warn' ? '경보' : '주의보'} 발령` });
    }
    h.reasons.forEach(r => {
      const lvl = r.stage === 'warn' ? 2 : r.stage === 'adv' ? (stopAdv.includes(hz) ? 2 : 1) : 1;
      const short = r.stage === 'warn' ? `${hz}경보 기준 도달` : r.stage === 'adv' ? `${hz}주의보 기준 도달` : `${hz}주의보 기준 근접`;
      reasons.push({ lvl, text: r.text, short });
    });
  });
  if (act.tsStop) {
    const ts = evalCond({ metric: 'ts', op: 'is', value: true }, obs, ref);
    if (ts) reasons.push({ lvl: 2, text: ts.text, short: '뇌우' });
  }
  (act.conds || []).forEach(c => {
    const r = evalCond(c, obs, ref);
    if (r) reasons.push({ lvl: Number(c.level) === 2 ? 2 : 1, text: r.text, short: r.short });
  });
  reasons.sort((a, b) => b.lvl - a.lvl);
  let level = reasons.length ? reasons[0].lvl : 0;
  let capped = false;
  if (act.capAdjust && level > 1) { level = 1; capped = true; }
  return {
    id: act.id, name: act.name, level, ruleLevel: level, capped,
    reasons: reasons.map(r => ({ lvl: r.lvl, text: r.text })),
    text: reasons.length ? fillTemplate(act, level, reasons) : fillTemplate(act, 0, [{ lvl: 0, text: '' }]),
    edited: false, source: '규칙'
  };
}

function evaluate(input, settings) {
  const ref = input.ref ? new Date(input.ref) : new Date();
  const obs = buildObs(input, settings);
  const hazards = evalHazards(obs, input.activeWarnings, settings, ref);
  const recs = (settings.activities || []).map(a => evalActivity(a, obs, hazards, ref));
  const civil = input.civil || {};
  const missing = [['tMin', '최저기온'], ['tMax', '최고기온'], ['feelsMax', '최고 체감온도'], ['pop', '강수확률'], ['windMax', '최대 풍속'], ['gustMax', '최대 순간풍속'], ['pm10', 'PM10']]
    .filter(([k]) => num(civil[k]) === null).map(([, l]) => l);
  return { obs, hazards, recs, missing };
}

export { LEVELS, HAZARDS, METRICS, OPS, defaultSettings, defaultCriteria, defaultActivities, evaluate, evalCond, buildObs, srcSummary, num };
