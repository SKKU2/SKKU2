# 기상 브리핑·부대운용 건의 웹앱 (v0.3)

공군 기상전문(METAR/TAF)과 민간기상 수치를 넣으면 기상청 특보 기준과 부대 기준표로 활동별 운용 건의(정상·조정·중단)와 근거를 만든다. pptx·인쇄(PDF)·한글용 표 복사, 이력·직전 회차 비교, 부대별 기준 설정, Gemini 보조 조언(상향만 반영)을 지원한다.

## 구성
| 영역 | 사용 |
|---|---|
| 웹·서버 | Next.js 16 (App Router, Server Actions) → Vercel 배포 |
| DB·로그인·파일 | Supabase (PostgreSQL + RLS, Auth, Storage `captures` 비공개 버킷) |
| AI | Gemini API, 서버에서만 호출 (`GEMINI_API_KEY`는 브라우저로 내려가지 않음) |

```
src/lib/wx/        전문 해석기, 규칙 엔진, AI 안전장치, pptx 생성기 (검증된 순수 로직)
src/lib/           브리핑 공통 로직, 그래프, 산출물, Supabase 연결
src/app/           화면과 서버 액션 (actions.ts)
supabase/migrations/0001_init.sql   테이블·권한(RLS)·저장소
tests/             vitest
```

## 역할
- **관리자**: 부대 생성, 사용자 역할·소속 지정, 모든 부대 열람·수정 (첫 가입자가 자동으로 관리자)
- **조작자**: 소속 부대 브리핑 작성·수정, 부대 기준 수정
- **열람자**: 소속 부대 브리핑 열람·출력 (가입 기본값)

## 로컬 실행
```bash
npm install
npm run dev      # http://localhost:3000
npm test
```
- `.env.local`에 Supabase 값이 **없으면 로컬 체험 모드**로 동작한다: 로그인 없이 관리자로 들어가고, 데이터와 캡처는 `.localdata/`에 저장되며, 첫 실행 시 시범 부대와 예시 브리핑 1건이 만들어진다.
- Supabase를 쓰려면 `.env.example`을 `.env.local`로 복사해 값을 넣고, `supabase/migrations/0001_init.sql`을 Supabase SQL 편집기에서 실행한다.

## GitHub 자동 반영
- `npm run sync`: 바뀐 파일을 커밋하고 `origin`(GitHub)에 푸시한다.
- `npm run sync:watch`: 파일 저장을 감시해 마지막 저장 15초 뒤 자동으로 커밋·푸시한다 (직접 편집할 때 켜 둔다).
- 개발 PC에서는 Claude Code가 작업을 마칠 때마다 같은 스크립트가 실행된다 (`../.claude/settings.json`의 Stop 훅).

## 문서
- [PRD](docs/PRD_기상브리핑_부대운용건의도구_2.md)

## 보안 메모
- AI는 부대 설정에서 켜야 하고 서버에 키가 있어야 동작한다. 꺼져 있으면 외부 AI 호출이 전혀 없다.
- AI로 보내는 자료는 서버가 허용 목록으로 만든다 (부대명·위치·작성자·전문 원문·캡처·메모 제외). 보내기 전 미리보기로 확인한다.
- 실제 군 자료를 퍼블릭 클라우드에 올리기 전에 보안 승인 절차를 거친다.
