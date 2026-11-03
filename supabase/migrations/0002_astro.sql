-- 브리핑 대상일의 박명(BMNT/EENT)·일출몰·월출몰·월광
alter table public.briefings add column if not exists astro jsonb;
