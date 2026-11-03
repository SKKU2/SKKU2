/* ===== astro.js : 박명(BMNT/EENT)·일출몰·월출몰·월광 계산 (외부 의존 없음) =====
 * 태양·달 위치는 천문 연감 근사식(Astronomical Algorithms, Meeus 계열)을 따른다. 오차 수준: 시각 ±2분, 월광 ±1%.
 */

const PI = Math.PI, rad = PI / 180;
const DAY = 864e5, J1970 = 2440588, J2000 = 2451545;
const HOUR = 3600e3;
const e = rad * 23.4397; // 황도 경사

const toJulian = d => d.valueOf() / DAY - 0.5 + J1970;
const fromJulian = j => new Date((j + 0.5 - J1970) * DAY);
const toDays = d => toJulian(d) - J2000;

const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const altitude = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
function refraction(h) {
  if (h < 0) h = 0;
  return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179));
}

/* ---------- 태양 ---------- */
const solarMeanAnomaly = d => rad * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + rad * 102.9372 + PI;
}
function sunCoords(d) {
  const L = eclipticLongitude(solarMeanAnomaly(d));
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

const J0 = 0.0009;
const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * PI));
const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * PI) + n;
const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const hourAngle = (h, phi, d) => Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));

/** 태양 고도가 angle(도)이 되는 아침·저녁 시각. 해당 고도에 이르지 않으면 null */
function sunTimes(date, lat, lng) {
  const lw = rad * -lng, phi = rad * lat;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const Jnoon = solarTransitJ(ds, M, L);
  const at = angle => {
    const w = hourAngle(angle * rad, phi, dec);
    if (isNaN(w)) return [null, null];
    const Jset = solarTransitJ(approxTransit(w, lw, n), M, L);
    return [fromJulian(Jnoon - (Jset - Jnoon)), fromJulian(Jset)];
  };
  const [sunrise, sunset] = at(-0.833);
  const [bmnt, eent] = at(-12);
  const [bmct, eect] = at(-6);
  return { noon: fromJulian(Jnoon), sunrise, sunset, bmnt, eent, bmct, eect };
}

/* ---------- 달 ---------- */
function moonCoords(d) {
  const L = rad * (218.316 + 13.176396 * d);
  const M = rad * (134.963 + 13.064993 * d);
  const F = rad * (93.272 + 13.22935 * d);
  const l = L + rad * 6.289 * Math.sin(M);
  const b = rad * 5.128 * Math.sin(F);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * Math.cos(M) };
}
function moonAltitude(date, lat, lng) {
  const lw = rad * -lng, phi = rad * lat, d = toDays(date);
  const c = moonCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  const h = altitude(H, phi, c.dec);
  return h + refraction(h);
}

/** 월광: 밝은 면 비율(0~1)과 위상(0 삭 → 0.5 망 → 1 삭) */
function moonIllumination(date) {
  const d = toDays(date);
  const s = sunCoords(d), m = moonCoords(d);
  const sdist = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / PI };
}

/** start부터 24시간 안의 월출·월몰 (고도 곡선을 2시간씩 2차 보간) */
function moonTimes(start, lat, lng) {
  const at = h => new Date(start.getTime() + h * HOUR);
  const hc = 0.133 * rad;
  let h0 = moonAltitude(start, lat, lng) - hc;
  let rise = null, set = null, ye = 0;
  for (let i = 1; i <= 24; i += 2) {
    const h1 = moonAltitude(at(i), lat, lng) - hc;
    const h2 = moonAltitude(at(i + 1), lat, lng) - hc;
    const a = (h0 + h2) / 2 - h1, b = (h2 - h0) / 2;
    const xe = -b / (2 * a);
    ye = (a * xe + b) * xe + h1;
    const disc = b * b - 4 * a * h1;
    let roots = 0, x1 = 0, x2 = 0;
    if (disc >= 0) {
      const dx = Math.sqrt(disc) / (Math.abs(a) * 2);
      x1 = xe - dx; x2 = xe + dx;
      if (Math.abs(x1) <= 1) roots++;
      if (Math.abs(x2) <= 1) roots++;
      if (x1 < -1) x1 = x2;
    }
    if (roots === 1) {
      if (h0 < 0) rise = i + x1; else set = i + x1;
    } else if (roots === 2) {
      rise = i + (ye < 0 ? x2 : x1);
      set = i + (ye < 0 ? x1 : x2);
    }
    if (rise !== null && set !== null) break;
    h0 = h2;
  }
  return {
    moonrise: rise !== null ? at(rise) : null,
    moonset: set !== null ? at(set) : null,
    alwaysUp: rise === null && set === null && ye > 0,
    alwaysDown: rise === null && set === null && ye <= 0
  };
}

function phaseName(p) {
  if (p < 0.03 || p > 0.97) return '삭(그믐)';
  if (p < 0.22) return '초승달';
  if (p < 0.28) return '상현';
  if (p < 0.47) return '상현망간';
  if (p < 0.53) return '보름';
  if (p < 0.72) return '하현망간';
  if (p < 0.78) return '하현';
  return '그믐달';
}

/**
 * 브리핑 대상일(KST)의 천문 자료. dayStartUtc = 대상일 KST 00:00 의 UTC 시각.
 * 월광은 그날 밤 자정(KST 24:00) 기준, 월출몰은 대상일 KST 00~24시 사이.
 */
function astroForDay(dayStartUtc, lat, lng) {
  const noon = new Date(dayStartUtc.getTime() + 12 * HOUR);
  const sun = sunTimes(noon, lat, lng);
  const moon = moonTimes(dayStartUtc, lat, lng);
  const midnight = new Date(dayStartUtc.getTime() + 24 * HOUR);
  const ill = moonIllumination(midnight);
  const iso = d => (d ? d.toISOString() : null);
  return {
    bmnt: iso(sun.bmnt), sunrise: iso(sun.sunrise), sunset: iso(sun.sunset), eent: iso(sun.eent),
    bmct: iso(sun.bmct), eect: iso(sun.eect),
    moonrise: iso(moon.moonrise), moonset: iso(moon.moonset), moonAlwaysUp: moon.alwaysUp, moonAlwaysDown: moon.alwaysDown,
    illumination: Math.round(ill.fraction * 100), phase: Math.round(ill.phase * 1000) / 1000, phaseName: phaseName(ill.phase),
    moonUpAtMidnight: moonAltitude(midnight, lat, lng) > 0
  };
}

export { sunTimes, moonTimes, moonIllumination, moonAltitude, phaseName, astroForDay };
