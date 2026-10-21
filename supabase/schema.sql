-- 알파 웹: Supabase SQL Editor에 통째로 붙여 넣고 Run 한다. 여러 번 실행해도 안전하다.

-- 1) 사용자별 기록 (진단·지표·퀘스트·체크·지출·리포트 추이·내 알림 링크·수집 결과)
create table if not exists public.user_docs (
  user_id    uuid not null references auth.users(id) on delete cascade,
  doc_id     text not null check (char_length(doc_id) between 1 and 40),
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, doc_id)
);
alter table public.user_docs enable row level security;
drop policy if exists "user_docs: 본인만 읽기" on public.user_docs;
drop policy if exists "user_docs: 본인만 쓰기" on public.user_docs;
drop policy if exists "user_docs: 본인만 수정" on public.user_docs;
drop policy if exists "user_docs: 본인만 삭제" on public.user_docs;
create policy "user_docs: 본인만 읽기" on public.user_docs for select to authenticated using (auth.uid() = user_id);
create policy "user_docs: 본인만 쓰기" on public.user_docs for insert to authenticated with check (auth.uid() = user_id);
create policy "user_docs: 본인만 수정" on public.user_docs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_docs: 본인만 삭제" on public.user_docs for delete to authenticated using (auth.uid() = user_id);

-- 2) 익명 평균 (켠 사람만, 결과 지표 숫자만)
create table if not exists public.pool (
  user_id uuid primary key references auth.users(id) on delete cascade,
  m       jsonb not null default '{}'::jsonb,
  at      text
);
alter table public.pool enable row level security;
drop policy if exists "pool: 로그인한 사람은 읽기" on public.pool;
drop policy if exists "pool: 본인만 쓰기" on public.pool;
drop policy if exists "pool: 본인만 수정" on public.pool;
drop policy if exists "pool: 본인만 삭제" on public.pool;
create policy "pool: 로그인한 사람은 읽기" on public.pool for select to authenticated using (true);
create policy "pool: 본인만 쓰기" on public.pool for insert to authenticated with check (auth.uid() = user_id);
create policy "pool: 본인만 수정" on public.pool for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "pool: 본인만 삭제" on public.pool for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_docs, public.pool to authenticated;
revoke all on public.user_docs, public.pool from anon;
