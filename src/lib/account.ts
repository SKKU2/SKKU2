/* 계정 규칙 (서버·브라우저 공용) */
import type { Role } from './types';

/** 로그인 아이디: 영문 소문자·숫자·. _ - 로 3~32자 (군번·사번 등) */
export const ID_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const normalizeId = (s: string) => String(s || '').trim().toLowerCase();

/** Supabase Auth는 이메일 형식이 필요하므로 아이디를 내부 주소로 바꿔 쓴다 (메일은 보내지 않음) */
export const ID_DOMAIN = 'id.wxbrief.local';
export const toEmail = (id: string) => `${normalizeId(id)}@${ID_DOMAIN}`;

export const ROLE_LABEL: Record<Role, string> = { admin: '총괄관리자', unit_admin: '부대관리자', operator: '조작자', viewer: '열람자' };
export const ROLES: Role[] = ['admin', 'unit_admin', 'operator', 'viewer'];
/** 브리핑 작성·수정 */
export const EDITOR_ROLES: Role[] = ['admin', 'unit_admin', 'operator'];
/** 사용자·부대 기준 관리 */
export const MANAGER_ROLES: Role[] = ['admin', 'unit_admin'];

export const PASSWORD_MIN = 8;
