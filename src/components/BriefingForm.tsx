'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HAZARDS, aviationSummary, defaultTarget, deriveFromInput, kstParts, sampleTexts, slotTimes } from '@/lib/briefing';
import { runJudgment } from '@/app/actions';
import { ParseResult } from './ParseResult';
import { toast } from './ui';
import type { BriefingInput, Session } from '@/lib/types';

const CIVIL: [string, string, number][] = [
  ['tMin', '최저기온 (℃)', 0.1], ['tMax', '최고기온 (℃)', 0.1], ['feelsMax', '최고 체감온도 (℃)', 0.1], ['feelsMin', '최저 체감온도 (℃, 선택)', 0.1],
  ['pop', '강수확률 (%)', 10], ['rain3h', '예상 강수량 3h (mm)', 1], ['rain12h', '예상 강수량 12h (mm)', 1], ['snow24h', '예상 적설 24h (cm)', 0.5],
  ['windMax', '최대 풍속 (m/s)', 0.5], ['gustMax', '최대 순간풍속 (m/s)', 0.5], ['pm10', '미세먼지 PM10 (㎍/㎥)', 1]
];
const SKY = ['맑음', '구름많음', '흐림', '비', '비/눈', '눈', '소나기'];
const HOURLY: [string, string][] = [['temp', '기온 ℃'], ['wind', '풍속 m/s'], ['rain', '강수량 mm/3h'], ['pop', '강수확률 %']];
const OV: [string, string, number][] = [['windKt', '최대 풍속 (kt)', 1], ['gustKt', '최대 돌풍 (kt)', 1], ['visM', '최저 시정 (m)', 100], ['ceilFt', '최저 운고 (ft)', 100]];

function emptyInput(author: string): BriefingInput {
  const session: Session = kstParts(new Date()).h < 12 ? 'morning' : 'evening';
  return { session, targetTime: defaultTarget(session), author, rawMetar: '', rawTaf: '', civil: {}, hourly: Array.from({ length: 8 }, () => ({})), activeWarnings: [], avOverride: {}, capturePaths: [] };
}

/** 캡처를 최대 1600px JPEG로 줄임 */
function shrink(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('이미지 변환 실패'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => reject(new Error('이미지를 읽지 못했습니다'));
    img.src = URL.createObjectURL(file);
  });
}

export function BriefingForm({ initial, unitId, author }: { initial?: BriefingInput; unitId: string; author: string }) {
  const router = useRouter();
  const [f, setF] = useState<BriefingInput>(() => initial || emptyInput(author));
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const editing = !!f.id;

  const set = <K extends keyof BriefingInput>(k: K, v: BriefingInput[K]) => setF(x => ({ ...x, [k]: v }));
  const setCivil = (k: string, v: string) => setF(x => {
    const c = { ...x.civil };
    if (v === '') delete c[k]; else c[k] = k === 'sky' ? v : Number(v);
    return { ...x, civil: c };
  });
  const setOv = (k: string, v: string, text = false) => setF(x => {
    const o = { ...x.avOverride };
    if (v === '') delete o[k]; else o[k] = text ? v : Number(v);
    return { ...x, avOverride: o };
  });
  const setHour = (i: number, k: string, v: string) => setF(x => {
    const h = x.hourly.map(r => ({ ...r }));
    while (h.length < 8) h.push({});
    if (v === '') delete h[i][k]; else h[i][k] = Number(v);
    return { ...x, hourly: h };
  });
  const setWarn = (type: string, level: string) => setF(x => ({
    ...x, activeWarnings: [...x.activeWarnings.filter(w => w.type !== type), ...(level ? [{ type, level: level as 'adv' | 'warn' }] : [])]
  }));

  // 전문 해석 (입력 0.4초 후)
  const [parseKey, setParseKey] = useState({ m: f.rawMetar, t: f.rawTaf, tt: f.targetTime });
  useEffect(() => {
    const id = setTimeout(() => setParseKey({ m: f.rawMetar, t: f.rawTaf, tt: f.targetTime }), 400);
    return () => clearTimeout(id);
  }, [f.rawMetar, f.rawTaf, f.targetTime]);
  const derived = useMemo(() => deriveFromInput({ targetTime: parseKey.tt, rawMetar: parseKey.m, rawTaf: parseKey.t, hourly: [], avOverride: {} }), [parseKey]);
  const auto = useMemo(() => aviationSummary(derived.av, {}), [derived]);
  const slots = slotTimes(f.targetTime);

  const imgUrl = (p: string) => urls[p] || `/api/captures?path=${encodeURIComponent(p)}`;

  async function addFiles(files: FileList | File[] | null) {
    const list = Array.from(files || []).filter(x => x.type.startsWith('image/'));
    if (!list.length) return;
    for (const file of list) {
      try {
        const blob = await shrink(file);
        const body = new FormData();
        body.append('file', blob, 'capture.jpg');
        body.append('unitId', unitId);
        const res = await fetch('/api/captures', { method: 'POST', body });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || res.statusText);
        setUrls(u => ({ ...u, [j.path]: URL.createObjectURL(blob) }));
        setF(x => ({ ...x, capturePaths: [...x.capturePaths, j.path] }));
        setActive(Number.MAX_SAFE_INTEGER); // 마지막(방금 올린) 캡처 표시
      } catch (e: any) {
        toast('캡처 업로드 실패: ' + (e.message || e), 'err');
      }
    }
  }
  async function removeCapture(path: string) {
    await fetch(`/api/captures?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    setF(x => ({ ...x, capturePaths: x.capturePaths.filter(p => p !== path) }));
    setActive(0);
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items || []).filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean) as File[];
      if (files.length) { e.preventDefault(); addFiles(files); }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  async function run() {
    setBusy(true);
    const res = await runJudgment(f, unitId);
    setBusy(false);
    if (!res.ok) { toast(res.error, 'err'); return; }
    toast('판단 완료 · 저장됨', 'ok');
    router.push(`/briefings/${res.data!.id}`);
    router.refresh();
  }

  const warnLevel = (t: string) => f.activeWarnings.find(w => w.type === t)?.level || '';
  const caps = f.capturePaths;
  const cur = caps[Math.min(active, caps.length - 1)];

  return (
    <div className="input-layout">
      <div>
        <div className="card">
          <div className="card-head"><h2>회차 정보</h2><span className="note">{editing ? '저장된 회차 수정 중' : '새 회차 작성 중'}</span></div>
          <div className="grid g3">
            <div className="field">
              <span className="note">회차</span>
              <div className="seg">
                {(['morning', 'evening', 'extreme'] as Session[]).map(s => (
                  <label key={s}><input type="radio" name="session" checked={f.session === s} onChange={() => setF(x => ({ ...x, session: s, targetTime: editing ? x.targetTime : defaultTarget(s) }))} /><span>{{ morning: '아침', evening: '저녁', extreme: '기상이변' }[s]}</span></label>
                ))}
              </div>
            </div>
            <label className="field"><span>대상 시각 (KST)</span><input type="datetime-local" value={f.targetTime} onChange={e => set('targetTime', e.target.value)} /></label>
            <label className="field"><span>작성자</span><input type="text" value={f.author} onChange={e => set('author', e.target.value)} placeholder="예: 기상담당 상사 ○○○" /></label>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>항공기상 전문 (공군기상전대)</h2>
            <button className="btn sm" type="button" onClick={() => { const s = sampleTexts(f.targetTime); setF(x => ({ ...x, rawMetar: s.metar, rawTaf: s.taf })); }}>샘플 전문 넣기</button>
          </div>
          <div className="grid g2">
            <label className="field"><span><b>METAR / SPECI</b> (여러 건 가능)</span><textarea className="mono" rows={4} value={f.rawMetar} onChange={e => set('rawMetar', e.target.value)} placeholder="METAR RKSO 022100Z 33012G25KT 4000 -RA BR SCT008 BKN015 08/06 Q1012=" /></label>
            <label className="field"><span><b>TAF</b></span><textarea className="mono" rows={4} value={f.rawTaf} onChange={e => set('rawTaf', e.target.value)} placeholder="TAF RKSO 022000Z 0221/0403 33010KT 6000 BR BKN025 ..." /></label>
          </div>
          <ParseResult reports={derived.reports} />
          <details className="report" style={{ padding: '8px 10px' }} open={Object.keys(f.avOverride).length > 0}>
            <summary>항공기상 수동 보정 (해석이 틀렸을 때만 입력, 빈칸 = 자동값 사용)</summary>
            <div className="grid g3" style={{ marginTop: 8 }}>
              {OV.map(([k, l, step]) => {
                const a = (auto as any)[k];
                return <label key={k} className="field"><span>{l}</span><input type="number" step={step} value={f.avOverride[k] ?? ''} placeholder={a !== null && a !== undefined ? `자동: ${a}` : '자동: 없음'} onChange={e => setOv(k, e.target.value)} /></label>;
              })}
              <label className="field"><span>뇌우</span><select value={(f.avOverride.ts as string) || ''} onChange={e => setOv('ts', e.target.value, true)}><option value="">자동</option><option value="yes">있음</option><option value="no">없음</option></select></label>
              <label className="field"><span>강수</span><select value={(f.avOverride.precip as string) || ''} onChange={e => setOv('precip', e.target.value, true)}><option value="">자동</option><option value="yes">있음</option></select></label>
            </div>
          </details>
        </div>

        <div className="card">
          <div className="card-head"><h2>민간기상 핵심 수치</h2><span className="note">오른쪽 캡처를 보며 입력 · 빈칸은 판단에서 제외</span></div>
          <div className="grid g4">
            {CIVIL.map(([k, l, step]) => <label key={k} className="field"><span>{l}</span><input type="number" step={step} value={f.civil[k] ?? ''} onChange={e => setCivil(k, e.target.value)} /></label>)}
            <label className="field"><span>하늘상태</span>
              <select value={(f.civil.sky as string) || ''} onChange={e => setCivil('sky', e.target.value)}><option value="">선택</option>{SKY.map(s => <option key={s}>{s}</option>)}</select>
            </label>
          </div>
          <details style={{ marginTop: 12 }}>
            <summary>시간대별 예보 (선택, 3시간 간격) — 그래프와 시간대 판단에 사용</summary>
            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table className="tbl compact hourly-tbl">
                <thead><tr><th />{slots.map((t, i) => { const p = kstParts(t); return <th key={i}>{p.d}일<br />{String(p.h).padStart(2, '0')}시</th>; })}</tr></thead>
                <tbody>
                  {HOURLY.map(([k, l]) => (
                    <tr key={k}><th className="nowrap">{l}</th>{slots.map((_, i) => <td key={i}><input type="number" step={k === 'pop' ? 10 : 0.5} value={f.hourly[i]?.[k] ?? ''} onChange={e => setHour(i, k, e.target.value)} /></td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>

        <div className="card">
          <div className="card-head"><h2>현재 발령 중인 기상특보</h2><span className="note">해당 지역 기준</span></div>
          <div className="warn-grid">
            {HAZARDS.map(hz => {
              const opts = hz === '황사' ? [['', '없음'], ['warn', '경보']] : [['', '없음'], ['adv', '주의보'], ['warn', '경보']];
              return (
                <div className="warn-item" key={hz}><b>{hz}</b>
                  <div className="seg">{opts.map(([v, l]) => <label key={v}><input type="radio" name={`w_${hz}`} checked={warnLevel(hz) === v} onChange={() => setWarn(hz, v)} /><span>{l}</span></label>)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sticky-actions">
          <button className="btn primary big" onClick={run} disabled={busy}>{busy ? '판단 중…' : '판단 실행 →'}</button>
          <span className="note">서버에서 다시 해석·판정해 저장하고 브리핑 화면으로 이동합니다</span>
        </div>
      </div>

      <aside className="capture-pane">
        <div className="card">
          <div className="card-head"><h2>민간기상 캡처</h2><span className="note">판독 없음 · 보면서 입력</span></div>
          <div className={'dropzone' + (over ? ' over' : '')} tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
            onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
            이미지를 끌어다 놓거나 <b>클릭</b>해서 선택<br /><span className="small">Ctrl+V로 붙여넣기도 가능</span>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
          <div className="thumbs">
            {caps.map((p, i) => (
              <div key={p} className={'thumb' + (p === cur ? ' active' : '')} onClick={() => setActive(i)}>
                <img src={imgUrl(p)} alt={`캡처 ${i + 1}`} />
                <button type="button" title="삭제" onClick={e => { e.stopPropagation(); removeCapture(p); }}>✕</button>
              </div>
            ))}
          </div>
          {cur && <div className={'viewer' + (zoom ? ' zoom' : '')} onClick={() => setZoom(z => !z)}><img src={imgUrl(cur)} alt="민간기상 캡처 (클릭하면 원래 크기)" /></div>}
        </div>
      </aside>
    </div>
  );
}
