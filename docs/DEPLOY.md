# 배포 절차 (Supabase + Vercel)

코드 쪽 준비는 끝나 있다. 아래는 계정에서 할 일이다.

## 1. Supabase
1. https://supabase.com/dashboard 에서 **New project**
   - Region: **Northeast Asia (Seoul)** · DB 비밀번호: **Generate a password**로 생성 후 비밀번호 관리자에 보관
2. **SQL Editor**에서 아래 두 파일 내용을 순서대로 붙여넣고 Run
   1. `supabase/migrations/0001_init.sql` (테이블·권한(RLS)·트리거·캡처 저장소)
   2. `supabase/migrations/0002_astro.sql` (박명·월광 열)
   - 확인: Table Editor에 `units`, `profiles`, `briefings`가 보이고, Storage에 `captures`(Private) 버킷이 보이면 성공
3. **Project Settings → API**에서 두 값을 확인 (Vercel에 넣을 값)
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable key(`sb_publishable_…`, 없으면 anon public key) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - **secret / service_role 키는 쓰지 않는다** (앱에 필요 없음, 넣으면 안 됨)

## 2. Vercel
1. https://vercel.com/new → **Import Git Repository** → `SKKU2/SKKU2`
   - Framework: Next.js (자동) · Root Directory: 그대로(`./`)
2. **Environment Variables** (Production·Preview·Development 모두)
   | 이름 | 값 |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable(anon) key |
   | `GEMINI_API_KEY` | Google AI Studio 키 (AI 안 쓰면 생략) |
3. **Deploy**. 이후 GitHub `main`에 푸시될 때마다 자동 재배포된다.
   - 환경변수를 나중에 바꾸면 **Redeploy**해야 반영된다 (`NEXT_PUBLIC_*`는 빌드 때 들어감).

## 3. Supabase 로그인 주소 등록
Supabase → **Authentication → URL Configuration**
- Site URL: `https://<배포주소>.vercel.app`
- Redirect URLs: `https://<배포주소>.vercel.app/auth/callback`, `http://localhost:3000/auth/callback`

가입 확인 메일은 Supabase 기본 메일 서버를 쓰며 시간당 발송 수가 적다. 사용자가 늘면 Authentication → SMTP에 부대 메일 서버를 연결한다.

## 4. 확인
1. `https://<배포주소>.vercel.app/api/health`
   → `{"mode":"supabase","supabaseEnv":true,"geminiKey":true,"db":"ok"}` 이면 정상
   - `misconfigured`: Vercel 환경변수 누락 → 넣고 Redeploy
   - `db: error …`: SQL(1-2단계)이 실행되지 않음
2. `/login`에서 **가입** → 확인 메일 링크 클릭 → 로그인. **첫 가입자가 관리자**가 된다.
3. 설정 → 부대·사용자 관리에서 **부대 추가** → 설정에서 위도·경도, AI 사용 켜기 → **연결 테스트**
4. 새 브리핑 → 샘플 전문 넣기 → 판단 실행 → pptx·인쇄 확인
5. 다른 사용자는 가입 후 관리자가 역할(조작자/열람자)과 부대를 지정한다.

## 보안 메모
- 저장소가 Public이면 코드와 PRD가 공개된다. 필요하면 GitHub에서 Private로 바꾼다 (Vercel 연동은 유지됨).
- 실제 부대 자료를 퍼블릭 클라우드·외부 AI에 올리기 전 보안 승인을 받는다.
