-- 알파: 내 알림 링크 매일 아침 자동 갱신 (한국 시간 오전 7시)
-- Supabase → SQL Editor 에 붙여 넣고 Run 한다. 여러 번 실행해도 안전하다.

-- 1) 예약 실행과 웹 요청에 필요한 확장 기능 켜기
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) 예약 실행용 비밀값을 만들어 Vault(암호화 보관함)에 넣는다. 이미 있으면 그대로 둔다.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'alpha_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'alpha_cron_secret');
  end if;
end $$;

-- 3) 매일 22:00 UTC(= 한국 시간 다음 날 07:00)에 refresh-feeds 함수를 부른다.
select cron.unschedule('alpha-daily-feeds') where exists (select 1 from cron.job where jobname = 'alpha-daily-feeds');
select cron.schedule(
  'alpha-daily-feeds',
  '0 22 * * *',
  $job$
  select net.http_post(
    url := 'https://exyvscpyjkpftbhiebwn.supabase.co/functions/v1/refresh-feeds',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'alpha_cron_secret')
    ),
    body := '{"mode":"cron"}'::jsonb,
    timeout_milliseconds := 10000
  );
  $job$
);

-- 4) 아래 결과로 나오는 값을 복사해서
--    Edge Functions → Secrets 에 이름 CRON_SECRET 으로 저장한다. (이 값은 GitHub나 채팅에 올리지 않는다)
select decrypted_secret as "CRON_SECRET에 넣을 값" from vault.decrypted_secrets where name = 'alpha_cron_secret';
