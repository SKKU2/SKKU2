/* ===== gemini_advisor.js : Gemini API 보조 조언 모듈 (선택 기능, 기본 꺼짐) =====
 * - 규칙 엔진 판정이 최종 하한선이며, AI는 단계를 올릴 수만 있다 (merge에서 코드로 강제)
 * - 허용 목록에 있는 필드만 새 객체로 복사해서 보낸다 (부대명·위치·작성자·전문 원문·캡처·메모 제외)
 * - enabled=false이면 어떤 네트워크 호출도 하지 않는다
 * - 엔드포인트만 바꾸면 Gemini 호환 내부 AI(안 C)로 전환 가능
 */

const LEVELS = ['정상', '조정', '중단'];
const SESSION = { morning: '아침', evening: '저녁', extreme: '기상이변' };

/** 전송 허용 필드 (키 이름 기준). assertAllowlist가 이 밖의 키를 거부한다 */
const ALLOWED = {
  root: ['회차', '지형', '기상', '시간대별', '발령특보', '규칙판정'],
  기상: ['최저기온', '최고기온', '최고체감온도', '최저체감온도', '강수확률', '강수량_3시간', '강수량_12시간', '신적설_24시간', '최대풍속_ms', '최대순간풍속_ms', 'PM10', '하늘상태', '항공'],
  항공: ['최대풍속_kt', '최대돌풍_kt', '최저시정_m', '최저운고_ft', '현상', '뇌우'],
  시간대별: ['시각', '출처', '기온', '풍속_ms', '강수량_mm', '강수확률', '풍속_kt', '돌풍_kt', '시정_m', '운고_ft', '현상'],
  발령특보: ['종류', '단계'],
  규칙판정: ['활동', '판정', '근거']
};

const num = v => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v));
const str = (v, max) => (v === null || v === undefined ? '' : String(v).slice(0, max || 200));
const kstLabel = t => {
  const k = new Date(new Date(t).getTime() + 9 * 3600e3);
  return `${k.getUTCDate()}일 ${String(k.getUTCHours()).padStart(2, '0')}시`;
};
/** 근거 문자열에서 비행장 식별부호(ICAO 4자) 등 위치성 토큰 제거 */
const scrub = s => str(s, 300).replace(/\b[A-Z]{4}\b/g, '****');

/**
 * 브리핑 컨텍스트 → 전송 페이로드 (허용 목록 방식, 필드 하나씩 명시 복사)
 * ctx: { session, region, civil, hourly, aviationSummary, aviationHours, activeWarnings, recs }
 */
function buildPayload(ctx) {
  const c = ctx.civil || {};
  const a = ctx.aviationSummary || {};
  const hours = [];
  (ctx.hourly || []).forEach(h => {
    if ([h.temp, h.wind, h.rain, h.pop].every(v => num(v) === null)) return;
    hours.push({ 시각: kstLabel(h.t), 출처: '민간', 기온: num(h.temp), 풍속_ms: num(h.wind), 강수량_mm: num(h.rain), 강수확률: num(h.pop) });
  });
  (ctx.aviationHours || []).forEach((h, i) => {
    if (i % 3 !== 0) return; // 3시간 간격으로 축약
    hours.push({ 시각: kstLabel(h.t), 출처: '항공예보', 풍속_kt: num(h.windKt), 돌풍_kt: num(h.gustKt), 시정_m: num(h.visM), 운고_ft: num(h.ceilFt), 현상: str(h.wxText, 60) });
  });
  return {
    회차: SESSION[ctx.session] || '아침',
    지형: ctx.region === 'mountain' ? '산지' : '육상',
    기상: {
      최저기온: num(c.tMin), 최고기온: num(c.tMax), 최고체감온도: num(c.feelsMax), 최저체감온도: num(c.feelsMin),
      강수확률: num(c.pop), 강수량_3시간: num(c.rain3h), 강수량_12시간: num(c.rain12h), 신적설_24시간: num(c.snow24h),
      최대풍속_ms: num(c.windMax), 최대순간풍속_ms: num(c.gustMax), PM10: num(c.pm10), 하늘상태: str(c.sky, 20),
      항공: {
        최대풍속_kt: num(a.windKt), 최대돌풍_kt: num(a.gustKt), 최저시정_m: num(a.visM), 최저운고_ft: num(a.ceilFt),
        현상: str(a.wxText, 120), 뇌우: !!a.ts
      }
    },
    시간대별: hours.slice(0, 24),
    발령특보: (ctx.activeWarnings || []).map(w => ({ 종류: str(w.type, 10), 단계: w.level === 'warn' ? '경보' : '주의보' })),
    규칙판정: (ctx.recs || []).map(r => ({ 활동: str(r.name, 40), 판정: LEVELS[r.ruleLevel] || '정상', 근거: (r.reasons || []).slice(0, 6).map(x => scrub(x.text)) }))
  };
}

/** 허용 목록 밖의 키가 있으면 예외 */
function assertAllowlist(p) {
  const bad = [];
  const check = (obj, allowed, path) => Object.keys(obj).forEach(k => { if (!allowed.includes(k)) bad.push(path + k); });
  check(p, ALLOWED.root, '');
  check(p.기상 || {}, ALLOWED.기상, '기상.');
  check((p.기상 || {}).항공 || {}, ALLOWED.항공, '기상.항공.');
  (p.시간대별 || []).forEach(h => check(h, ALLOWED.시간대별, '시간대별[].'));
  (p.발령특보 || []).forEach(h => check(h, ALLOWED.발령특보, '발령특보[].'));
  (p.규칙판정 || []).forEach(h => check(h, ALLOWED.규칙판정, '규칙판정[].'));
  if (bad.length) throw new Error('허용 목록 밖 필드: ' + bad.join(', '));
  return true;
}

const SYSTEM_PROMPT = [
  '당신은 한국 육군 보병대대 기상 담당자의 부대운용 건의를 돕는 기상 조언자입니다.',
  '입력 JSON의 수치, 발령 특보, 규칙 엔진 판정만 근거로 판단하고 없는 사실을 만들지 마십시오.',
  '규칙판정보다 낮은 단계를 제안하지 마십시오. 위험이 더 크다고 보면 상향하고 이유를 적으십시오.',
  '시각은 모두 한국 표준시(KST)입니다. 위험이 집중되는 시간대를 "14~18시"처럼 구체적으로 제시하십시오.',
  '문장은 한국어로, 군 보고 문체(간결한 개조식)로 작성하십시오. 최종 결심은 지휘관이 합니다.'
].join('\n');

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING', description: '전반 기상 요약 2~3문장' },
    risks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          detail: { type: 'STRING' },
          timeWindow: { type: 'STRING', description: '예: 14~18시' },
          severity: { type: 'STRING', enum: ['주의', '경고', '위험'] }
        },
        required: ['title', 'detail', 'severity']
      }
    },
    activities: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: '규칙판정의 활동 이름 그대로' },
          level: { type: 'STRING', enum: LEVELS },
          advice: { type: 'STRING', description: '건의 문구 1~2문장' },
          timeWindow: { type: 'STRING' }
        },
        required: ['name', 'level', 'advice']
      }
    },
    uncertainty: { type: 'STRING', description: '예보 불확실성, 재확인 필요 사항' }
  },
  required: ['summary', 'risks', 'activities', 'uncertainty']
};

/** Gemini 3 이후 모델은 temperature가 폐기됨(무시, 이후 400 예정) → 2.x 이하에만 보냄 */
function legacySampling(model) { return /^gemini-[12]\./.test(String(model || '')); }

/** lite=true: 스키마·온도 없이 JSON 형식만 요구 (스키마 거부 시 재시도용) */
function buildRequestBody(payload, model, lite) {
  const generationConfig = { responseMimeType: 'application/json' };
  if (!lite) {
    generationConfig.responseSchema = RESPONSE_SCHEMA;
    if (legacySampling(model)) generationConfig.temperature = 0.2;
  }
  const shape = lite ? '\n응답 형식: {"summary":문자열,"risks":[{"title","detail","timeWindow","severity":"주의|경고|위험"}],"activities":[{"name","level":"정상|조정|중단","advice","timeWindow"}],"uncertainty":문자열}' : '';
  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: '다음 기상 자료와 규칙 판정을 검토해 조언을 JSON으로 작성하십시오.' + shape + '\n' + JSON.stringify(payload) }] }],
    generationConfig
  };
}

/** 응답 검증·정리. 형식이 틀리면 예외 */
function validate(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('응답이 객체가 아님');
  if (typeof obj.summary !== 'string') throw new Error('summary 누락');
  if (!Array.isArray(obj.activities)) throw new Error('activities 누락');
  return {
    summary: str(obj.summary, 800),
    risks: (Array.isArray(obj.risks) ? obj.risks : []).filter(r => r && typeof r.title === 'string').slice(0, 8).map(r => ({
      title: str(r.title, 80), detail: str(r.detail, 300), timeWindow: str(r.timeWindow, 40),
      severity: ['주의', '경고', '위험'].includes(r.severity) ? r.severity : '주의'
    })),
    activities: obj.activities.filter(x => x && typeof x.name === 'string' && LEVELS.includes(x.level)).map(x => ({
      name: str(x.name, 40), level: x.level, advice: str(x.advice, 300), timeWindow: str(x.timeWindow, 40)
    })),
    uncertainty: str(obj.uncertainty, 400)
  };
}

function endpointUrl(opt, path) {
  const base = String(opt.endpoint || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  return `${base}/models/${encodeURIComponent(opt.model || 'gemini-3.8-flash')}${path}`;
}

async function timedFetch(opt, url, init) {
  const f = opt.fetchImpl || globalThis.fetch.bind(globalThis);
  const ctrl = new AbortController();
  const ms = opt.timeoutMs || 20000;
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await f(url, Object.assign({}, init, { signal: ctrl.signal }));
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error(`시간 초과(${Math.round(ms / 1000)}초)`);
    throw new Error('네트워크 오류: ' + (e && e.message ? e.message : e));
  } finally {
    clearTimeout(timer);
  }
}

function guard(opt) {
  if (!opt || !opt.enabled) throw new Error('AI 기능이 꺼져 있음');
  if (!opt.apiKey) throw new Error('API 키가 없음');
}

async function httpError(res) {
  let msg = '';
  try { const j = await res.json(); msg = j && j.error && j.error.message ? j.error.message : ''; } catch (e) { /* 무시 */ }
  return new Error(`HTTP ${res.status}${msg ? ': ' + msg.slice(0, 200) : ''}`);
}

/** 조언 요청. 성공 시 검증된 객체, 실패 시 예외 (호출측은 규칙 결과로 계속) */
async function requestAdvice(payload, opt) {
  guard(opt);
  assertAllowlist(payload);
  const post = lite => timedFetch(opt, endpointUrl(opt, ':generateContent'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opt.apiKey },
    body: JSON.stringify(buildRequestBody(payload, opt.model, lite))
  });
  let res = await post(false);
  if (!res.ok) {
    const err = await httpError(res);
    // 모델이 스키마·샘플링 설정을 거부하면 형식만 요구해 1회 재시도 (응답은 validate로 검증)
    if (res.status === 400 && /schema|temperature|generation_?config/i.test(err.message)) {
      res = await post(true);
      if (!res.ok) throw await httpError(res);
    } else throw err;
  }
  let data;
  try { data = await res.json(); } catch (e) { throw new Error('응답 JSON 해석 실패'); }
  const cand = data && data.candidates && data.candidates[0];
  const text = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts.map(p => p.text || '').join('') : '';
  if (!text) throw new Error('빈 응답' + (cand && cand.finishReason ? ` (${cand.finishReason})` : ''));
  let obj;
  try { obj = JSON.parse(text); } catch (e) { throw new Error('응답이 JSON 형식이 아님'); }
  return validate(obj);
}

/** 연결 테스트: 모델 정보 조회 (생성 비용 없음) */
async function testConnection(opt) {
  guard(opt);
  const res = await timedFetch(opt, endpointUrl(opt, ''), { method: 'GET', headers: { 'x-goog-api-key': opt.apiKey } });
  if (!res.ok) throw await httpError(res);
  const j = await res.json().catch(() => ({}));
  return { ok: true, model: j.displayName || j.name || opt.model };
}

/**
 * 규칙 판정과 AI 조언 병합. 최종 단계 = max(규칙, AI). AI 하향 제안은 무시.
 * caps: { 활동id: 최대단계 } (예: 경계근무는 '조정'까지만)
 */
function merge(recs, ai, caps) {
  caps = caps || {};
  return recs.map(r => {
    const out = Object.assign({}, r, { reasons: (r.reasons || []).filter(x => !x.ai), source: '규칙', aiAdvice: '', aiNote: '' });
    out.level = r.ruleLevel;
    if (!r.edited && r.ruleText) out.text = r.ruleText;
    const a = ai && ai.activities.find(x => x.name.trim() === String(r.name).trim());
    if (!a) return out;
    const cap = caps[r.id] !== undefined ? caps[r.id] : 2;
    const aiLvl = Math.min(LEVELS.indexOf(a.level), cap);
    const advice = a.advice + (a.timeWindow ? ` (${a.timeWindow})` : '');
    out.aiAdvice = advice;
    if (aiLvl > r.ruleLevel) {
      out.level = aiLvl;
      out.source = 'AI 상향';
      out.reasons = [{ lvl: aiLvl, text: 'AI 조언: ' + advice, ai: true }].concat(out.reasons);
      if (!r.edited) out.text = `${r.name} ${LEVELS[aiLvl]} 건의 – ${advice}`;
    } else if (aiLvl === r.ruleLevel) {
      out.source = 'AI';
    } else {
      out.aiNote = `AI 하향 제안(${LEVELS[r.ruleLevel]}→${a.level})은 반영하지 않음`;
    }
    out.level = Math.max(out.level, r.ruleLevel);
    return out;
  });
}

export { buildPayload, assertAllowlist, buildRequestBody, validate, requestAdvice, testConnection, merge, RESPONSE_SCHEMA, SYSTEM_PROMPT, ALLOWED };
