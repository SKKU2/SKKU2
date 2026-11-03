-- 기존 계정·부대·브리핑을 모두 지우고 새로 시작한다. 되돌릴 수 없다.
-- 0003_id_accounts.sql을 실행하기 "전에" 한 번만 실행한다.
-- (0003 이후에는 마지막 총괄관리자 삭제 방지 규칙 때문에 관리자 계정이 지워지지 않는다)
delete from public.briefings;
delete from public.profiles;
delete from public.units;
delete from auth.users;
-- 캡처 이미지 파일은 Storage → captures 버킷에서 필요하면 따로 지운다.
