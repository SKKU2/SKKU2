# 배포 절차 (Supabase + Vercel, 관리자 발급형 아이디 계정)

계정은 이메일 가입이 아니라 **관리자가 아이디·임시 비밀번호를 발급**한다. 메일을 보내지 않으므로 메일 발송 한도와 무관하다.

## 1. Supabase
1. 프로젝트 (Region: Northeast Asia (Seoul))
2. **SQL Editor**에서 순서대로 Run
   1. `supabase/migrations/0001_init.sql` — 처음 만드는 프로젝트만
   2. `supabase/migrations/0002_astro.sql` — 처음 만드는 프로젝트만
   3. (기존 계정·데이터를 지우고 새로 시작할 때만) `supabase/reset_accounts.sql` — **되돌릴 수 없음**
   4. `supabase/migrations/0003_id_accounts.sql`
3. **Authentication → Sign In / Providers**
   - **Allow new users to sign up: 끄기** (공개 가입 차단. 관리자 발급은 계속 동작)
   - Email provider는 켜 둔다 (아이디 로그인이 내부적으로 사용). Confirm email은 상관없음
4. **Project Settings → API Keys**에서 세 값을 확인
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable key(`sb_publishable_…`, 없으면 anon) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - **Secret key**(`sb_secret_…`, 없으면 service_role) → `SUPABASE_SECRET_KEY` (서버 전용)

## 2. Vercel 환경변수 (Settings → Environment Variables, 모든 환경)
| 이름 | 값 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key |
| `SUPABASE_SECRET_KEY` | Secret key — **Sensitive로 표시**, `NEXT_PUBLIC_` 붙이지 말 것 |
| `SETUP_CODE` | 최초 설치용 코드 (예: 무작위 12자 이상). 설치 후 지워도 됨 |
| `GEMINI_API_KEY` | (선택) Google AI Studio 키 |

환경변수를 바꾼 뒤에는 **Deployments → Redeploy**.

## 3. 확인
`https://<배포주소>/api/health` →
`{"mode":"supabase","supabaseEnv":true,"secretKey":true,"setupCode":true,"geminiKey":…,"db":"ok","accountSchema":"ok","adminExists":false}`
- `accountSchema: missing…` → 0003 SQL 미실행
- `secretKey:false` / `setupCode:false` → Vercel 환경변수 누락 후 Redeploy

## 4. 최초 설치와 사용자 발급
1. `https://<배포주소>/setup` → 설치 코드, 첫 부대 이름, 총괄관리자 아이디·이름·비밀번호 → 만들기
   - 총괄관리자가 생기면 이 화면은 닫힌다 (`adminExists:true`)
2. `/login`에서 아이디로 로그인
3. **사용자** 메뉴
   - 부대 추가 (총괄관리자)
   - 사용자 발급: 아이디(예: 군번), 이름·계급, 역할, 부대 → 임시 비밀번호가 표시됨(한 번만) → 본인에게 전달
   - 여러 명은 "여러 명 붙여넣기"에 `아이디, 이름, 역할, 부대` 한 줄씩
4. 발급받은 사람은 임시 비밀번호로 로그인 → 새 비밀번호 설정 화면이 강제로 나온다
5. 비밀번호를 잊으면 관리자가 **비밀번호 초기화** (새 임시 비밀번호)

## 역할
| 역할 | 할 수 있는 일 |
|---|---|
| 총괄관리자 | 모든 부대·사용자, 부대 생성 |
| 부대관리자 | 자기 부대의 조작자·열람자 발급·초기화·정지·삭제, 부대 기준 설정, 브리핑 작성 |
| 조작자 | 브리핑 작성·수정 |
| 열람자 | 열람·출력 |

마지막 총괄관리자는 강등·정지·삭제할 수 없다 (DB 규칙).

## 보안 메모
- `SUPABASE_SECRET_KEY`는 RLS를 우회하는 키다. Vercel 환경변수에만 두고 채팅·문서·커밋에 남기지 않는다.
- 저장소가 Public이면 코드와 PRD가 공개된다. 필요하면 Private로 바꾼다.
- 실제 부대 자료를 퍼블릭 클라우드·외부 AI에 올리기 전 보안 승인을 받는다.
