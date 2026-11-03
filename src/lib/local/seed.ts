import 'server-only';
import crypto from 'node:crypto';
import { LOCAL_USER, onSeed } from './db';
import { dateToKstStr, evaluateInput, kstStrToDate, normalizeSettings, sampleTexts } from '../briefing';
import type { BriefingInput } from '../types';

/** 로컬 체험 모드 첫 실행: 시범 부대, 관리자, 예시 브리핑 1건 */
onSeed(db => {
  const unitId = crypto.randomUUID();
  const settings = normalizeSettings(null);
  db.units.push({ id: unitId, name: '시범 보병대대', settings, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  db.profiles.push({ id: LOCAL_USER.id, email: LOCAL_USER.email, display_name: '체험 사용자', role: 'admin', unit_id: unitId, created_at: new Date().toISOString() });

  const now = new Date();
  const k = dateToKstStr(now).slice(0, 10);
  const targetTime = `${k}T08:00`;
  const s = sampleTexts(targetTime);
  const input: BriefingInput = {
    session: 'morning', targetTime, author: '기상담당 (예시)', rawMetar: s.metar, rawTaf: s.taf,
    civil: { tMin: 2, tMax: 13, feelsMax: 12, pop: 70, rain3h: 5, rain12h: 12, windMax: 9, gustMax: 17, pm10: 45, sky: '비' },
    hourly: [[4, 3, 0, 20], [7, 5, 0, 30], [11, 8, 1, 60], [13, 11, 3, 70], [10, 12, 4, 70], [8, 9, 2, 60], [6, 6, 0, 30], [4, 4, 0, 20]]
      .map(([temp, wind, rain, pop]) => ({ temp, wind, rain, pop })),
    activeWarnings: [{ type: '강풍', level: 'adv' }], avOverride: {}, capturePaths: []
  };
  const ev = evaluateInput(input, settings);
  db.briefings.push({
    id: crypto.randomUUID(), unit_id: unitId, created_by: LOCAL_USER.id, created_at: now.toISOString(), updated_at: now.toISOString(),
    session: input.session, target_time: kstStrToDate(targetTime)!.toISOString(), author: input.author,
    raw_metar: input.rawMetar, raw_taf: input.rawTaf, civil: input.civil, hourly: input.hourly, active_warnings: input.activeWarnings,
    av_override: {}, ...ev, memo: '로컬 체험용 예시 브리핑입니다.', ai: null, include_ai: true, capture_paths: []
  });
});
