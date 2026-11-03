import 'server-only';
import * as G from './wx/advisor.js';
import { deriveFromInput, rowToInput } from './briefing';
import type { BriefingRow, UnitSettings } from './types';

/** 서버 환경변수. API 키는 브라우저로 내려가지 않는다 */
export function aiEnv() {
  return {
    apiKey: process.env.GEMINI_API_KEY || '',
    endpoint: process.env.GEMINI_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta',
    timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) || 20000
  };
}

export function aiOptions(settings: UnitSettings) {
  const env = aiEnv();
  return { enabled: !!settings.ai.enabled && !!env.apiKey, apiKey: env.apiKey, endpoint: env.endpoint, timeoutMs: env.timeoutMs, model: settings.ai.model || 'gemini-3.8-flash' };
}

/** DB 행 → 허용 목록 페이로드 (부대명·작성자·전문 원문·캡처·메모는 애초에 넘기지 않음) */
export function payloadFor(b: BriefingRow, settings: UnitSettings) {
  const d = deriveFromInput(rowToInput(b));
  const payload = G.buildPayload({
    session: b.session, region: settings.region, civil: b.civil, hourly: d.hourly,
    aviationSummary: b.av_summary || d.avSum, aviationHours: d.av.filter(e => !e.point),
    activeWarnings: b.active_warnings, recs: b.recommendations
  });
  G.assertAllowlist(payload);
  return payload;
}

export const requestAdvice = G.requestAdvice;
export const testConnection = G.testConnection;
export const mergeAdvice = G.merge;
