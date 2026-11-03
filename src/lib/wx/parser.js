/* ===== wx_parser.js : METAR/TAF 해석기 (외부 의존 없음) ===== */

const KT_PER_MS = 1.943844;
const M_PER_SM = 1609.344;
const HOUR = 3600e3;

const INTENSITY = { '+': '강한', '-': '약한', VC: '부근' };
const DESC = { MI: '얕은', PR: '부분', BC: '산재', DR: '낮게 날리는', BL: '날리는', SH: '소나기성', TS: '뇌우', FZ: '어는' };
const PHEN = {
  DZ: '안개비', RA: '비', SN: '눈', SG: '싸락눈', IC: '세빙', PL: '얼음싸라기', GR: '우박', GS: '작은우박', UP: '미상 강수',
  BR: '박무', FG: '안개', FU: '연기', VA: '화산재', DU: '먼지', SA: '모래', HZ: '연무', PY: '물보라',
  PO: '먼지회오리', SQ: '스콜', FC: '깔때기구름', SS: '모래폭풍', DS: '먼지폭풍'
};
const PRECIP = ['DZ', 'RA', 'SN', 'SG', 'IC', 'PL', 'GR', 'GS', 'UP'];
const SNOW = ['SN', 'SG'];
const DUST = ['DU', 'SA', 'SS', 'DS', 'PO'];
const CLOUD_AMT = { FEW: '조금(1~2/8)', SCT: '산재(3~4/8)', BKN: '많음(5~7/8)', OVC: '흐림(8/8)', VV: '수직시정' };
const COLOR = { BLU: '청색', WHT: '백색', GRN: '녹색', YLO: '황색', YLO1: '황색1', YLO2: '황색2', AMB: '호박색', RED: '적색' };

const RE = {
  station: /^[A-Z][A-Z0-9]{3}$/,
  time: /^(\d{2})(\d{2})(\d{2})Z$/,
  period: /^(\d{2})(\d{2})\/(\d{2})(\d{2})$/,
  fm: /^FM(\d{2})(\d{2})(\d{2})$/,
  prob: /^PROB(\d{2})$/,
  wind: /^(\d{3}|VRB|\/{3})(\d{2,3}|\/\/)(?:G(\d{2,3}))?(KT|MPS|KMH)$/,
  windVar: /^(\d{3})V(\d{3})$/,
  visM: /^(\d{4})(NDV|[NSEW]{1,2})?$/,
  visSM: /^([MP])?(\d{1,2})?(?:(\d)\/(\d{1,2}))?SM$/,
  cloud: /^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/{3})(CB|TCU|\/{3})?$/,
  clear: /^(SKC|NSC|NCD|CLR)$/,
  temp: /^(M?\d{2}|\/\/)\/(M?\d{2}|\/\/)?$/,
  qnhQ: /^Q(\d{4})$/,
  qnhA: /^A(\d{4})$/,
  qnhIns: /^QNH(\d{4})INS$/,
  txtn: /^(TX|TN)(M?\d{2})\/(\d{2})(\d{2})Z$/,
  rvr: /^R\d{2}[LRC]?\/[PM]?\d{4}/,
  ws: /^WS\d{3}\/\d{5,6}(KT|MPS)$/,
  milGroup: /^[56]\d{5}$/,
  recent: /^RE[A-Z]{2,6}$/,
  color: /^(BLU|WHT|GRN|YLO1|YLO2|YLO|AMB|RED)\+?$/,
  wx: /^(\+|-|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?((?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)*)$/
};

/* ---------- 공통 유틸 ---------- */
function toKt(v, unit) {
  if (v === null || v === undefined) return null;
  if (unit === 'MPS') return Math.round(v * KT_PER_MS * 10) / 10;
  if (unit === 'KMH') return Math.round(v / 3.6 * KT_PER_MS * 10) / 10;
  return v;
}
function ktToMs(kt) { return kt === null || kt === undefined ? null : Math.round(kt / KT_PER_MS * 10) / 10; }
function parseT(s) { if (!s || s.startsWith('/')) return null; return s[0] === 'M' ? -Number(s.slice(1)) : Number(s); }
function pad(n) { return String(n).padStart(2, '0'); }

/** UTC Date → KST 표기 */
function kst(d) {
  const k = new Date(d.getTime() + 9 * HOUR);
  return { y: k.getUTCFullYear(), mo: k.getUTCMonth() + 1, d: k.getUTCDate(), h: k.getUTCHours(), mi: k.getUTCMinutes() };
}
function fmtKst(d, withDay) {
  if (!d) return '-';
  const p = kst(d);
  return (withDay === false ? '' : `${p.d}일 `) + `${pad(p.h)}:${pad(p.mi)}`;
}
function fmtUtc(d) { return d ? `${pad(d.getUTCDate())}일 ${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}Z` : '-'; }

/** 전문의 일(DD)만 있는 시각을 기준 시각에 가장 가까운 달로 해석 */
function resolveTime(dd, hh, mm, ref) {
  const y = ref.getUTCFullYear(), mo = ref.getUTCMonth();
  let best = null;
  for (const k of [-1, 0, 1]) {
    const base = Date.UTC(y, mo + k, dd, 0, 0);
    if (new Date(base).getUTCDate() !== dd) continue;
    const t = base + hh * HOUR + mm * 60e3;
    if (best === null || Math.abs(t - ref.getTime()) < Math.abs(best - ref.getTime())) best = t;
  }
  return best === null ? null : new Date(best);
}

function fmtVis(v) {
  if (!v) return '-';
  if (v.plus || v.m >= 10000) return '10km 이상';
  return v.m >= 5000 ? `${(v.m / 1000).toFixed(0)}km` : `${Math.round(v.m).toLocaleString()}m`;
}
function describeWind(w) {
  if (w.spd === 0) return '무풍(0)';
  const dir = w.dir === 'VRB' ? '풍향 가변' : w.dir === null ? '풍향 미상' : `${pad3(w.dir)}°`;
  const unit = w.unit === 'MPS' ? 'm/s' : w.unit === 'KMH' ? 'km/h' : 'kt';
  let s = `${dir} ${w.spd === null ? '?' : w.spd}${unit}`;
  if (w.gust !== null) s += `, 돌풍 ${w.gust}${unit}`;
  if (w.unit !== 'KT') s += ` (≈${w.spdKt}kt${w.gustKt !== null ? ' / ' + w.gustKt + 'kt' : ''})`;
  else s += ` (≈${ktToMs(w.spd)}m/s${w.gust !== null ? ' / ' + ktToMs(w.gust) + 'm/s' : ''})`;
  return s;
}
function pad3(n) { return String(n).padStart(3, '0'); }

function decodeWx(m, code) {
  const phens = m[3] ? m[3].match(/../g) : [];
  const vc = m[1] === 'VC';
  const text = [INTENSITY[m[1]], DESC[m[2]], phens.map(p => PHEN[p]).join('·')].filter(Boolean).join(' ');
  return {
    code, text,
    flags: {
      ts: m[2] === 'TS',
      precip: !vc && phens.some(p => PRECIP.includes(p)),
      snow: !vc && phens.some(p => SNOW.includes(p)),
      freezing: m[2] === 'FZ',
      fog: phens.includes('FG'),
      dust: phens.some(p => DUST.includes(p))
    }
  };
}

function newFields() {
  return { wind: null, vis: null, wx: [], nsw: false, clouds: [], skyClear: false, cavok: false, temp: null, dew: null, qnh: null, color: null, notes: [], items: [] };
}
function item(g, label, value, raw) { g.items.push({ label, value, raw }); }

/** 토큰 하나(또는 둘)를 해석. 소비한 토큰 수 반환, 0이면 해석 실패 */
function parseToken(toks, i, g) {
  const t = toks[i];
  let m;
  if ((m = RE.wind.exec(t))) {
    const unit = m[4];
    const w = {
      dir: m[1] === 'VRB' ? 'VRB' : m[1].startsWith('/') ? null : Number(m[1]),
      spd: m[2].startsWith('/') ? null : Number(m[2]),
      gust: m[3] ? Number(m[3]) : null,
      unit
    };
    w.spdKt = toKt(w.spd, unit);
    w.gustKt = toKt(w.gust, unit);
    g.wind = w;
    item(g, '바람', describeWind(w), t);
    return 1;
  }
  if ((m = RE.windVar.exec(t))) {
    if (g.wind) { g.wind.varFrom = Number(m[1]); g.wind.varTo = Number(m[2]); }
    item(g, '풍향 변동', `${m[1]}° ~ ${m[2]}°`, t);
    return 1;
  }
  if (t === 'CAVOK') {
    g.cavok = true; g.vis = { m: 10000, plus: true }; g.wx = []; g.clouds = []; g.skyClear = true;
    item(g, 'CAVOK', '시정 10km 이상, 유의미한 구름·일기현상 없음', t);
    return 1;
  }
  if (/^\d{1,2}$/.test(t) && /^\d\/\d{1,2}SM$/.test(toks[i + 1] || '')) {
    const f = RE.visSM.exec(toks[i + 1]);
    const mi = Number(t) + Number(f[3]) / Number(f[4]);
    g.vis = { m: Math.round(mi * M_PER_SM), sm: mi };
    item(g, '시정', `${fmtVis(g.vis)} (${t} ${toks[i + 1]})`, `${t} ${toks[i + 1]}`);
    return 2;
  }
  if ((m = RE.visSM.exec(t)) && (m[2] || m[3])) {
    const mi = (m[2] ? Number(m[2]) : 0) + (m[3] ? Number(m[3]) / Number(m[4]) : 0);
    g.vis = { m: Math.round(mi * M_PER_SM), sm: mi, plus: m[1] === 'P' };
    item(g, '시정', `${m[1] === 'M' ? '미만 ' : ''}${fmtVis(g.vis)} (${t})`, t);
    return 1;
  }
  if ((m = RE.visM.exec(t))) {
    const v = Number(m[1]);
    g.vis = { m: v === 9999 ? 10000 : v, plus: v === 9999 };
    item(g, '시정', fmtVis(g.vis) + (m[2] && m[2] !== 'NDV' ? ` (${m[2]} 방향)` : ''), t);
    return 1;
  }
  if (t === 'NSW') {
    g.nsw = true; g.wx = [];
    item(g, '일기현상', '현저한 일기현상 종료(NSW)', t);
    return 1;
  }
  if ((m = RE.cloud.exec(t))) {
    const ft = m[2].startsWith('/') ? null : Number(m[2]) * 100;
    const type = m[3] && !m[3].startsWith('/') ? m[3] : null;
    g.clouds.push({ amt: m[1], ft, type });
    item(g, m[1] === 'VV' ? '수직시정' : '구름',
      `${CLOUD_AMT[m[1]]} ${ft === null ? '높이 미상' : ft.toLocaleString() + 'ft'}${type ? ' ' + (type === 'CB' ? '적란운(CB)' : '탑상적운(TCU)') : ''}`, t);
    return 1;
  }
  if (RE.clear.test(t)) {
    g.skyClear = true; g.clouds = [];
    item(g, '구름', '유의미한 구름 없음', t);
    return 1;
  }
  if ((m = RE.temp.exec(t))) {
    g.temp = parseT(m[1]); g.dew = m[2] ? parseT(m[2]) : null;
    item(g, '기온/이슬점', `${g.temp ?? '-'}℃ / ${g.dew ?? '-'}℃`, t);
    return 1;
  }
  if ((m = RE.qnhQ.exec(t))) {
    g.qnh = { hpa: Number(m[1]) };
    item(g, '기압(QNH)', `${m[1]} hPa`, t);
    return 1;
  }
  if ((m = RE.qnhA.exec(t)) || (m = RE.qnhIns.exec(t))) {
    const inHg = Number(m[1]) / 100;
    g.qnh = { hpa: Math.round(inHg * 33.8639), inHg };
    item(g, '기압(QNH)', `${inHg.toFixed(2)} inHg (≈${g.qnh.hpa} hPa)`, t);
    return 1;
  }
  if ((m = RE.color.exec(t))) {
    g.color = m[1];
    item(g, '색상 상태', `${COLOR[m[1]]}(${m[1]})`, t);
    return 1;
  }
  if (RE.rvr.test(t)) { item(g, '활주로가시거리', t, t); return 1; }
  if (RE.ws.test(t)) { g.notes.push('윈드시어'); item(g, '윈드시어', t, t); return 1; }
  if (RE.milGroup.test(t)) { item(g, t[0] === '5' ? '난류 예보 그룹' : '착빙 예보 그룹', t + ' (원문 참조)', t); return 1; }
  if (RE.recent.test(t)) { item(g, '최근 일기', t, t); return 1; }
  if ((m = RE.wx.exec(t)) && (m[2] || m[3])) {
    const w = decodeWx(m, t);
    g.wx.push(w);
    item(g, '일기현상', w.text, t);
    return 1;
  }
  if (/^\/+$/.test(t)) return 1;
  return 0;
}

/* ---------- 상태 요약 ---------- */
function ceiling(clouds) {
  let c = null;
  (clouds || []).forEach(x => {
    if ((x.amt === 'BKN' || x.amt === 'OVC' || x.amt === 'VV') && x.ft !== null && (c === null || x.ft < c)) c = x.ft;
  });
  return c;
}
function summarize(s) {
  const w = s.wind;
  const wx = s.wx || [];
  const flags = { ts: false, precip: false, snow: false, freezing: false, fog: false, dust: false };
  wx.forEach(x => Object.keys(flags).forEach(k => { if (x.flags[k]) flags[k] = true; }));
  return {
    dir: w ? w.dir : null,
    windKt: w ? w.spdKt : null,
    gustKt: w ? w.gustKt : null,
    visM: s.vis ? s.vis.m : null,
    ceilFt: ceiling(s.clouds),
    cb: (s.clouds || []).some(c => c.type === 'CB'),
    wx: wx.map(x => x.code),
    wxText: wx.map(x => x.text).join(', '),
    flags
  };
}
function worstOf(list) {
  const maxN = k => list.reduce((m, x) => (x[k] !== null && x[k] !== undefined && (m === null || x[k] > m) ? x[k] : m), null);
  const minN = k => list.reduce((m, x) => (x[k] !== null && x[k] !== undefined && (m === null || x[k] < m) ? x[k] : m), null);
  const wx = [], wxText = [];
  list.forEach(x => {
    x.wx.forEach(c => { if (!wx.includes(c)) wx.push(c); });
    x.wxText.split(', ').filter(Boolean).forEach(c => { if (!wxText.includes(c)) wxText.push(c); });
  });
  const flags = {};
  Object.keys(list[0].flags).forEach(k => { flags[k] = list.some(x => x.flags[k]); });
  return {
    dir: list[0].dir, windKt: maxN('windKt'), gustKt: maxN('gustKt'), visM: minN('visM'), ceilFt: minN('ceilFt'),
    cb: list.some(x => x.cb), wx, wxText: wxText.join(', '), flags
  };
}

/* ---------- 전문 분리 ---------- */
function splitReports(text) {
  const reps = [];
  let cur = null;
  const lines = String(text || '').toUpperCase().split(/\r?\n/);
  for (const line of lines) {
    const toks = line.replace(/=/g, ' = ').split(/\s+/).filter(Boolean);
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t === 'METAR' || t === 'SPECI' || t === 'TAF') {
        cur = { type: t, tokens: [] }; reps.push(cur); continue;
      }
      if (t === '=') { cur = null; continue; }
      const startsNew = RE.station.test(t) && RE.time.test(toks[i + 1] || '') && cur && cur.tokens.some(x => RE.time.test(x));
      if (!cur || startsNew) {
        cur = { type: null, tokens: [] };
        reps.push(cur);
      }
      cur.tokens.push(t);
    }
  }
  reps.forEach(r => {
    if (!r.type) r.type = r.tokens.some(x => RE.period.test(x)) ? 'TAF' : 'METAR';
  });
  return reps.filter(r => r.tokens.length);
}

/* ---------- METAR ---------- */
function parseMetarBody(r, toks, i) {
  const g = newFields();
  while (i < toks.length) {
    const t = toks[i];
    if (t === 'RMK') { r.remarks = toks.slice(i + 1).join(' '); break; }
    if (t === 'NOSIG') { r.trend = 'NOSIG (2시간 내 현저한 변화 없음)'; i++; continue; }
    if (t === 'BECMG' || t === 'TEMPO') {
      const end = toks.indexOf('RMK', i);
      const stop = end < 0 ? toks.length : end;
      r.trend = toks.slice(i, stop).join(' ');
      i = stop;
      continue;
    }
    const n = parseToken(toks, i, g);
    if (n) i += n; else { r.unparsed.push(t); i++; }
  }
  r.fields = g;
  r.items = g.items;
  r.summary = summarize(g);
  return r;
}

/* ---------- TAF ---------- */
function parseTafBody(r, toks, i, ref) {
  let m;
  const anchor = r.issued || ref;
  if ((m = RE.period.exec(toks[i] || ''))) {
    r.validFrom = resolveTime(+m[1], +m[2], 0, anchor);
    r.validTo = r.validFrom ? resolveTime(+m[3], +m[4], 0, new Date(r.validFrom.getTime() + 15 * HOUR)) : null;
    i++;
  }
  r.base = newFields();
  r.changes = [];
  r.tx = []; r.tn = [];
  let cur = r.base;
  const pAnchor = r.validFrom || anchor;
  const periodOf = tok => {
    const p = RE.period.exec(tok || '');
    if (!p) return null;
    const from = resolveTime(+p[1], +p[2], 0, pAnchor);
    return { from, to: from ? resolveTime(+p[3], +p[4], 0, new Date(from.getTime() + 6 * HOUR)) : null };
  };
  const start = (kind, from, to) => {
    cur = { kind, from, to, fields: newFields() };
    r.changes.push(cur);
    return cur.fields;
  };
  let g = r.base;
  while (i < toks.length) {
    const t = toks[i];
    if (t === 'RMK' || t === 'LAST' || t === 'NEXT' || (t === 'AMD' && toks[i + 1] === 'NOT')) {
      r.remarks = toks.slice(t === 'RMK' ? i + 1 : i).join(' ');
      break;
    }
    if ((m = RE.txtn.exec(t))) {
      (m[1] === 'TX' ? r.tx : r.tn).push({ v: parseT(m[2]), t: resolveTime(+m[3], +m[4], 0, pAnchor) });
      i++;
      continue;
    }
    if ((m = RE.fm.exec(t))) {
      g = start('FM', resolveTime(+m[1], +m[2], +m[3], pAnchor), null);
      i++;
      continue;
    }
    if (t === 'BECMG' || t === 'TEMPO') {
      const p = periodOf(toks[i + 1]);
      g = start(t, p ? p.from : null, p ? p.to : null);
      if (!p) r.unparsed.push(t + '(기간 없음)');
      i += p ? 2 : 1;
      continue;
    }
    if ((m = RE.prob.exec(t))) {
      let kind = 'PROB' + m[1];
      let j = i + 1;
      if (toks[j] === 'TEMPO') { kind += ' TEMPO'; j++; }
      const p = periodOf(toks[j]);
      g = start(kind, p ? p.from : null, p ? p.to : null);
      i = j + (p ? 1 : 0);
      continue;
    }
    const n = parseToken(toks, i, g);
    if (n) i += n; else { r.unparsed.push(t); i++; }
  }
  // FM 그룹 종료시각 = 다음 FM 또는 유효기간 끝
  const fms = r.changes.filter(c => c.kind === 'FM').sort((a, b) => a.from - b.from);
  fms.forEach((c, k) => { c.to = k + 1 < fms.length ? fms[k + 1].from : r.validTo; });
  r.items = r.base.items;
  r.hours = tafHours(r);
  return r;
}

function stateOf(f) { return { wind: f.wind, vis: f.vis, wx: f.wx.slice(), clouds: f.clouds.slice() }; }
function applyFields(s, f, isFM) {
  const n = {
    wind: f.wind || s.wind,
    vis: f.vis || s.vis,
    wx: f.nsw ? [] : f.wx.length ? f.wx.slice() : isFM ? [] : s.wx.slice(),
    clouds: f.clouds.length || f.skyClear || f.cavok ? f.clouds.slice() : s.clouds.slice()
  };
  if (f.cavok) { n.vis = { m: 10000, plus: true }; n.wx = []; n.clouds = []; }
  return n;
}

/** TAF를 1시간 단위로 펼침: prevail(우세), worst(TEMPO/PROB/전이 구간 포함 최악) */
function tafHours(taf) {
  if (!taf.validFrom || !taf.validTo || taf.validTo <= taf.validFrom) return [];
  const out = [];
  const ch = taf.changes.filter(c => c.from).sort((a, b) => a.from - b.from);
  for (let t = taf.validFrom.getTime(); t < taf.validTo.getTime() && out.length < 48; t += HOUR) {
    let prev = stateOf(taf.base);
    const trans = [];
    ch.forEach(c => {
      const f = c.from.getTime(), e = c.to ? c.to.getTime() : Infinity;
      if (c.kind === 'FM') { if (f <= t) prev = applyFields(prev, c.fields, true); }
      else if (c.kind === 'BECMG') {
        if (e <= t) prev = applyFields(prev, c.fields);
        else if (f <= t) trans.push(c);
      }
    });
    const states = [prev];
    const tags = [];
    trans.forEach(c => { states.push(applyFields(prev, c.fields)); tags.push('BECMG'); });
    ch.forEach(c => {
      if (c.kind === 'FM' || c.kind === 'BECMG') return;
      const e = c.to ? c.to.getTime() : Infinity;
      if (c.from.getTime() <= t && t < e) { states.push(applyFields(prev, c.fields)); tags.push(c.kind); }
    });
    const sums = states.map(summarize);
    out.push({ t: new Date(t), prevail: sums[0], worst: worstOf(sums), tags });
  }
  return out;
}

/* ---------- 진입점 ---------- */
function parseReport(rep, ref) {
  const toks = rep.tokens;
  const r = { type: rep.type, raw: (rep.type + ' ' + toks.join(' ')).trim(), station: null, issued: null, mods: [], items: [], unparsed: [], remarks: '', trend: '' };
  let i = 0;
  while (i < toks.length && /^(AMD|COR|RTD|CCA|CCB|CNL)$/.test(toks[i])) { r.mods.push(toks[i]); i++; }
  if (RE.station.test(toks[i] || '') && !RE.time.test(toks[i])) { r.station = toks[i]; i++; }
  let m;
  if ((m = RE.time.exec(toks[i] || ''))) { r.issued = resolveTime(+m[1], +m[2], +m[3], ref); i++; }
  if (toks[i] === 'NIL') { r.nil = true; return r; }
  if (toks[i] === 'AUTO') { r.mods.push('AUTO'); i++; }
  return r.type === 'TAF' ? parseTafBody(r, toks, i, ref) : parseMetarBody(r, toks, i);
}

function parse(text, ref) {
  ref = ref || new Date();
  const reports = splitReports(text).map(rep => parseReport(rep, ref));
  return {
    reports,
    metars: reports.filter(r => r.type !== 'TAF'),
    tafs: reports.filter(r => r.type === 'TAF')
  };
}

export { parse, summarize, worstOf, tafHours, ktToMs, toKt, kst, fmtKst, fmtUtc, fmtVis, KT_PER_MS, PHEN };
