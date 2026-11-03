export type Role = 'admin' | 'operator' | 'viewer';
export type Session = 'morning' | 'evening' | 'extreme';
export type Level = 0 | 1 | 2;

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  unit_id: string | null;
}

export interface Unit {
  id: string;
  name: string;
  settings: UnitSettings;
}

export interface Reason { lvl: number; text: string; ai?: boolean }

export interface Recommendation {
  id: string;
  name: string;
  level: number;
  ruleLevel: number;
  capped?: boolean;
  reasons: Reason[];
  text: string;
  ruleText?: string;
  edited: boolean;
  source: '규칙' | 'AI' | 'AI 상향';
  aiAdvice?: string;
  aiNote?: string;
}

export interface HazardState { issued: 'adv' | 'warn' | null; reached: 'near' | 'adv' | 'warn' | null; reasons: { stage: string; text: string }[] }

export interface AiResponse {
  summary: string;
  risks: { title: string; detail: string; timeWindow: string; severity: string }[];
  activities: { name: string; level: string; advice: string; timeWindow: string }[];
  uncertainty: string;
}

export interface BriefingInput {
  id?: string;
  session: Session;
  targetTime: string; // 'YYYY-MM-DDTHH:mm' (KST)
  author: string;
  rawMetar: string;
  rawTaf: string;
  civil: Record<string, number | string>;
  hourly: Record<string, number>[];
  activeWarnings: { type: string; level: 'adv' | 'warn' }[];
  avOverride: Record<string, number | string>;
  capturePaths: string[];
}

/** DB 행 (snake_case) */
export interface BriefingRow {
  id: string;
  unit_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  session: Session;
  target_time: string;
  author: string;
  raw_metar: string;
  raw_taf: string;
  civil: Record<string, number | string>;
  hourly: Record<string, number>[];
  active_warnings: { type: string; level: 'adv' | 'warn' }[];
  av_override: Record<string, number | string>;
  parsed: any[] | null;
  av_summary: AvSummary | null;
  hazards: Record<string, HazardState> | null;
  recommendations: Recommendation[];
  missing: string[];
  memo: string;
  ai: { response?: AiResponse; error?: string; model: string; at: string } | null;
  include_ai: boolean;
  capture_paths: string[];
  astro?: Astro | null;
}

/** 대상일(KST)의 박명·일출몰·월출몰·월광 (ISO 시각) */
export interface Astro {
  bmnt: string | null; sunrise: string | null; sunset: string | null; eent: string | null;
  bmct: string | null; eect: string | null;
  moonrise: string | null; moonset: string | null; moonAlwaysUp: boolean; moonAlwaysDown: boolean;
  illumination: number; phase: number; phaseName: string; moonUpAtMidnight: boolean;
  lat?: number; lon?: number;
}

export interface AvSummary {
  windKt: number | null; gustKt: number | null; visM: number | null; ceilFt: number | null;
  wxText: string; ts: boolean; precip: boolean; count?: number;
}

export interface UnitSettings {
  version?: number;
  region: 'land' | 'mountain';
  location: { lat: number; lon: number };
  approachRatio: number;
  popThreshold: number;
  criteria: any[];
  activities: any[];
  ai: { enabled: boolean; model: string; includeInOutputs: boolean };
}
