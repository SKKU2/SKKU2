import 'server-only';
/* 로컬 체험 모드: Supabase 없이 이 PC의 파일(web/.localdata)에 저장하는 대체 클라이언트.
 * 앱이 쓰는 Supabase 쿼리 문법(from/select/eq/order/single/insert/update/…)만 흉내 낸다. 권한(RLS) 검사는 없다. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = path.join(process.cwd(), '.localdata');
const DB_FILE = path.join(DIR, 'db.json');
const CAP_DIR = path.join(DIR, 'captures');

export const LOCAL_USER = { id: '00000000-0000-4000-8000-000000000001', email: 'demo@local' };

type Row = Record<string, any>;
type Db = Record<'units' | 'profiles' | 'briefings', Row[]>;

let seeding: ((db: Db) => void) | null = null;
/** 처음 실행 시 기본 데이터를 채우는 함수를 등록 (순환 의존을 피하려고 바깥에서 주입) */
export function onSeed(fn: (db: Db) => void) { seeding = fn; }

function load(): Db {
  if (!fs.existsSync(DB_FILE)) {
    fs.mkdirSync(CAP_DIR, { recursive: true });
    const db: Db = { units: [], profiles: [], briefings: [] };
    seeding?.(db);
    save(db);
    return db;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function save(db: Db) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db));
  fs.renameSync(DB_FILE + '.tmp', DB_FILE);
}

const now = () => new Date().toISOString();
const DEFAULTS: Record<string, () => Row> = {
  units: () => ({ id: crypto.randomUUID(), settings: {}, created_at: now(), updated_at: now() }),
  profiles: () => ({ display_name: '', role: 'viewer', unit_id: null, created_at: now() }),
  briefings: () => ({
    id: crypto.randomUUID(), created_at: now(), updated_at: now(), author: '', raw_metar: '', raw_taf: '', civil: {}, hourly: [],
    active_warnings: [], av_override: {}, parsed: null, av_summary: null, hazards: null, recommendations: [], missing: [], memo: '',
    ai: null, include_ai: true, capture_paths: []
  })
};

class Query implements PromiseLike<{ data: any; error: any }> {
  private filters: ((r: Row) => boolean)[] = [];
  private orders: [string, boolean][] = [];
  private lim: number | null = null;
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: any = null;
  private cols = '*';
  private mode: 'many' | 'single' | 'maybe' = 'many';
  constructor(private table: keyof Db) {}

  select(cols = '*') { this.cols = cols; return this; }
  insert(v: any) { this.op = 'insert'; this.payload = v; return this; }
  update(v: any) { this.op = 'update'; this.payload = v; return this; }
  upsert(v: any) { this.op = 'upsert'; this.payload = v; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(k: string, v: any) { this.filters.push(r => r[k] === v); return this; }
  neq(k: string, v: any) { this.filters.push(r => r[k] !== v); return this; }
  lte(k: string, v: any) { this.filters.push(r => r[k] <= v); return this; }
  in(k: string, vs: any[]) { this.filters.push(r => vs.includes(r[k])); return this; }
  order(k: string, o?: { ascending?: boolean }) { this.orders.push([k, o?.ascending !== false]); return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }

  private exec(): { data: any; error: any } {
    const db = load();
    const rows = db[this.table];
    const match = (r: Row) => this.filters.every(f => f(r));
    let out: Row[] = [];
    if (this.op === 'insert' || this.op === 'upsert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      list.forEach((v: Row) => {
        const i = v.id ? rows.findIndex(r => r.id === v.id) : -1;
        if (i >= 0 && this.op === 'upsert') { rows[i] = { ...rows[i], ...v, updated_at: now() }; out.push(rows[i]); }
        else { const r = { ...DEFAULTS[this.table](), ...v }; rows.push(r); out.push(r); }
      });
      save(db);
    } else if (this.op === 'update') {
      rows.forEach((r, i) => { if (match(r)) { rows[i] = { ...r, ...this.payload, ...('updated_at' in r ? { updated_at: now() } : {}) }; out.push(rows[i]); } });
      save(db);
    } else if (this.op === 'delete') {
      out = rows.filter(match);
      db[this.table] = rows.filter(r => !match(r));
      save(db);
    } else {
      out = rows.filter(match);
      this.orders.slice().reverse().forEach(([k, asc]) => out.sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (asc ? 1 : -1)));
      // 안정 정렬을 위해 마지막 정렬 기준부터 적용했으므로 첫 기준이 우선
      if (this.lim !== null) out = out.slice(0, this.lim);
    }
    // 'units(name)' 같은 관계 조회 흉내
    if (/units\(name\)/.test(this.cols)) out = out.map(r => ({ ...r, units: db.units.find(u => u.id === r.unit_id) ? { name: db.units.find(u => u.id === r.unit_id)!.name } : null }));
    out = JSON.parse(JSON.stringify(out));
    if (this.mode === 'single') return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: out.length ? '여러 행' : '행 없음' } };
    if (this.mode === 'maybe') return { data: out[0] || null, error: null };
    return { data: out, error: null };
  }
  then<A = { data: any; error: any }, B = never>(ok?: ((v: { data: any; error: any }) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    try { return Promise.resolve(this.exec()).then(ok, bad); } catch (e) { return Promise.reject(e).then(ok, bad); }
  }
}

const safe = (p: string) => {
  const full = path.resolve(CAP_DIR, p);
  if (!full.startsWith(path.resolve(CAP_DIR) + path.sep)) throw new Error('잘못된 경로');
  return full;
};

export function localClient() {
  return {
    from: (t: keyof Db) => new Query(t),
    auth: {
      getUser: async () => ({ data: { user: LOCAL_USER }, error: null }),
      signOut: async () => ({ error: null }),
      exchangeCodeForSession: async () => ({ error: null })
    },
    storage: {
      from: (_bucket: string) => ({
        upload: async (p: string, data: Buffer | Uint8Array) => {
          const f = safe(p);
          fs.mkdirSync(path.dirname(f), { recursive: true });
          fs.writeFileSync(f, data);
          return { data: { path: p }, error: null };
        },
        download: async (p: string) => {
          try { return { data: new Blob([new Uint8Array(fs.readFileSync(safe(p)))], { type: 'image/jpeg' }), error: null }; }
          catch (e: any) { return { data: null, error: { message: e.message } }; }
        },
        remove: async (ps: string[]) => {
          ps.forEach(p => { try { fs.unlinkSync(safe(p)); } catch { /* 이미 없음 */ } });
          return { data: null, error: null };
        }
      })
    }
  };
}
