create extension if not exists pgcrypto;

create type account_type as enum ('physical','digital','investment','other');
create type account_status as enum ('active','archived');
create type transaction_type as enum ('income','expense','transfer');
create type category_kind as enum ('income','expense');
create type origin as enum ('personal','gbr');
create type receivable_status as enum ('pending','partial','received','overdue');
create type debt_status as enum ('pending','partial','paid','overdue');
create type bill_status as enum ('pending','paid','overdue');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username varchar(80) not null default 'admin',
  name varchar(120) not null default 'Gabriel',
  email varchar(180) not null default 'admin@gbrbank.local',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_username_idx on profiles(username);

create table accounts (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id) on delete cascade,
  name varchar(100) not null, type account_type not null default 'digital', balance numeric(14,2) not null default 0,
  description text, status account_status not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index accounts_profile_idx on accounts(profile_id); create index accounts_status_idx on accounts(status);

create table categories (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id) on delete cascade,
  name varchar(80) not null, kind category_kind not null, color varchar(20) not null default '#8b9bb4', is_default boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index categories_profile_kind_idx on categories(profile_id, kind);

create table transfers (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id) on delete cascade,
  from_account_id uuid not null references accounts(id), to_account_id uuid not null references accounts(id), amount numeric(14,2) not null check (amount > 0),
  occurred_at timestamptz not null default now(), description text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index transfers_profile_date_idx on transfers(profile_id, occurred_at);

create table transactions (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id) on delete cascade,
  account_id uuid not null references accounts(id), category_id uuid references categories(id) on delete set null, transfer_id uuid references transfers(id) on delete set null,
  type transaction_type not null, amount numeric(14,2) not null check (amount > 0), occurred_at timestamptz not null default now(), description text, note text,
  origin origin not null default 'personal', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index transactions_profile_date_idx on transactions(profile_id, occurred_at); create index transactions_account_idx on transactions(account_id); create index transactions_category_idx on transactions(category_id);

create table receivables (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id) on delete cascade,
  person varchar(140) not null, description text not null, original_amount numeric(14,2) not null check (original_amount > 0), due_date date,
  status receivable_status not null default 'pending', note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index receivables_profile_status_idx on receivables(profile_id,status); create index receivables_due_date_idx on receivables(due_date);

create table receivable_payments (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id) on delete cascade, receivable_id uuid not null references receivables(id) on delete cascade,
  account_id uuid not null references accounts(id), transaction_id uuid references transactions(id) on delete set null, amount numeric(14,2) not null check (amount > 0), paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index receivable_payments_receivable_idx on receivable_payments(receivable_id);

create table debts (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id) on delete cascade,
  name varchar(140) not null, creditor varchar(140) not null, category varchar(80) not null default 'Outros', original_amount numeric(14,2) not null check (original_amount > 0),
  installments integer, installment_amount numeric(14,2), next_due_date date, status debt_status not null default 'pending', note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index debts_profile_status_idx on debts(profile_id,status); create index debts_due_date_idx on debts(next_due_date);

create table debt_payments (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id) on delete cascade, debt_id uuid not null references debts(id) on delete cascade,
  account_id uuid not null references accounts(id), transaction_id uuid references transactions(id) on delete set null, amount numeric(14,2) not null check (amount > 0), paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index debt_payments_debt_idx on debt_payments(debt_id);

create table bills (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id) on delete cascade, name varchar(140) not null, amount numeric(14,2) not null check (amount > 0),
  due_date date not null, recurrence varchar(30) not null default 'none', category varchar(80) not null default 'Outros', status bill_status not null default 'pending', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index bills_profile_status_idx on bills(profile_id,status); create index bills_due_date_idx on bills(due_date);

create table goals (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id) on delete cascade, name varchar(140) not null, target_amount numeric(14,2) not null check (target_amount > 0),
  current_amount numeric(14,2) not null default 0, deadline date, category varchar(80) not null default 'Outros', note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index goals_profile_idx on goals(profile_id);

create table personal_settlement (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id) on delete cascade, target_amount numeric(14,2) not null default 0, saved_amount numeric(14,2) not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index personal_settlement_profile_idx on personal_settlement(profile_id);

create table settings (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id) on delete cascade, currency varchar(8) not null default 'BRL', locale varchar(20) not null default 'pt-BR', theme varchar(20) not null default 'dark', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index settings_profile_idx on settings(profile_id);

create table audit_logs (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id) on delete cascade, action varchar(80) not null, entity varchar(80) not null, entity_id uuid, metadata text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index audit_logs_profile_date_idx on audit_logs(profile_id,created_at);

create or replace function public.handle_new_gbr_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, name, username) values (new.id, coalesce(new.email, 'admin@gbrbank.local'), coalesce(new.raw_user_meta_data->>'name','Gabriel'), coalesce(new.raw_user_meta_data->>'username','admin')) on conflict (id) do nothing;
  insert into public.settings(profile_id) values (new.id) on conflict (profile_id) do nothing;
  insert into public.personal_settlement(profile_id) values (new.id) on conflict (profile_id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created_gbr after insert on auth.users for each row execute procedure public.handle_new_gbr_profile();

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

do $$ declare table_name text; begin foreach table_name in array array['profiles','accounts','categories','transfers','transactions','receivables','receivable_payments','debts','debt_payments','bills','goals','personal_settlement','settings','audit_logs'] loop execute format('create trigger %I_updated_at before update on %I for each row execute procedure public.set_updated_at()', table_name, table_name); end loop; end $$;

alter table profiles enable row level security; alter table accounts enable row level security; alter table categories enable row level security; alter table transfers enable row level security; alter table transactions enable row level security; alter table receivables enable row level security; alter table receivable_payments enable row level security; alter table debts enable row level security; alter table debt_payments enable row level security; alter table bills enable row level security; alter table goals enable row level security; alter table personal_settlement enable row level security; alter table settings enable row level security; alter table audit_logs enable row level security;

do $$ declare table_name text; begin foreach table_name in array array['accounts','categories','transfers','transactions','receivables','receivable_payments','debts','debt_payments','bills','goals','personal_settlement','settings','audit_logs'] loop execute format('create policy %I_owner_policy on %I for all using (profile_id = auth.uid()) with check (profile_id = auth.uid())', table_name, table_name); end loop; end $$;
create policy profiles_owner_policy on profiles for all using (id = auth.uid()) with check (id = auth.uid());
