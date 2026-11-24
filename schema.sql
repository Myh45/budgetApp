-- Expense Tracker: run once in Supabase SQL Editor.
-- Data lives in Supabase. The user's auth session may be persisted by Supabase SDK.
create table if not exists public.cash_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  opening_balance_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  constraint opening_balance_safe check (opening_balance_cents between -9000000000000 and 9000000000000)
);

create table if not exists public.cash_transactions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income','expense')),
  description text not null check (length(btrim(description)) between 1 and 160),
  amount_cents bigint not null check (amount_cents between 1 and 9000000000000),
  created_at timestamptz not null default now()
);

create index if not exists idx_cash_transactions_user_created
  on public.cash_transactions(user_id, created_at desc, id desc);

alter table public.cash_wallets enable row level security;
alter table public.cash_transactions enable row level security;

revoke all on public.cash_wallets from anon, authenticated;
revoke all on public.cash_transactions from anon, authenticated;
grant select, insert on public.cash_wallets to authenticated;
grant select, insert, delete on public.cash_transactions to authenticated;

drop policy if exists "wallet_select_own" on public.cash_wallets;
create policy "wallet_select_own" on public.cash_wallets
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "wallet_insert_own" on public.cash_wallets;
create policy "wallet_insert_own" on public.cash_wallets
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "tx_select_own" on public.cash_transactions;
create policy "tx_select_own" on public.cash_transactions
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "tx_insert_own" on public.cash_transactions;
create policy "tx_insert_own" on public.cash_transactions
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "tx_delete_own" on public.cash_transactions;
create policy "tx_delete_own" on public.cash_transactions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- These policies intentionally do NOT permit edits to initial balances or transactions.
-- Re-running is idempotent for this project schema, but do not edit policies without review.
