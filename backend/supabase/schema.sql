-- Pasokin schema. Run once in the Supabase SQL Editor before starting the backend.
-- The browser never queries these tables directly. RLS and revoked public grants
-- keep buyer, supplier payout, and payment data behind the backend service role.

do $$ begin
  create type public.procurement_status as enum
    ('parsing', 'optimizing', 'awaiting_approval', 'dispatched', 'triaging',
     'needs_manual_review', 'awaiting_summary_confirmation', 'completed');
exception when duplicate_object then null; end $$;
alter type public.procurement_status add value if not exists 'needs_manual_review' before 'completed';
alter type public.procurement_status add value if not exists 'awaiting_summary_confirmation' before 'completed';
do $$ begin
  create type public.payment_status as enum
    ('awaiting_payment', 'paid_held', 'shipped', 'delivered', 'released', 'expired', 'disputed', 'refunded');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.verification_status as enum ('unverified', 'pending', 'verified');
exception when duplicate_object then null; end $$;

create table if not exists public.suppliers (
  id text primary key,
  supplier_uuid uuid not null default gen_random_uuid() unique,
  name text not null,
  phone text not null,
  material_category text not null,
  categories text[] not null default '{}',
  address text,
  location text,
  lat double precision,
  lng double precision,
  max_capacity_qty numeric not null default 0 check (max_capacity_qty >= 0),
  min_order_qty numeric not null default 0 check (min_order_qty >= 0),
  price_per_unit numeric not null default 0 check (price_per_unit >= 0),
  unit text not null default 'kg',
  lead_time_days numeric not null default 0 check (lead_time_days >= 0),
  verification_status public.verification_status not null default 'unverified',
  reliability_score numeric not null default 0.5 check (reliability_score between 0 and 1),
  nib text,
  npwp text,
  payment_terms text,
  payout_bank text,
  payout_account_number text,
  payout_account_holder text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.procurements (
  id uuid primary key,
  reference_code text not null unique check (reference_code ~ '^PSK-[A-Z0-9]{4}$'),
  buyer_info jsonb not null default '{}'::jsonb,
  material_summary text not null default '',
  parsed_material_summary jsonb not null default '{}'::jsonb,
  status public.procurement_status not null default 'parsing',
  weight_preset_used text,
  negotiated_supplier_id uuid references public.suppliers(supplier_uuid),
  manual_price numeric,
  manual_unit text,
  manual_quantity numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Additive migration for databases created before concurrent procurements.
alter table public.suppliers add column if not exists supplier_uuid uuid default gen_random_uuid();
update public.suppliers set supplier_uuid = gen_random_uuid() where supplier_uuid is null;
alter table public.suppliers alter column supplier_uuid set not null;
create unique index if not exists suppliers_supplier_uuid_key on public.suppliers (supplier_uuid);
alter table public.procurements add column if not exists reference_code text;
alter table public.procurements add column if not exists material_summary text not null default '';
alter table public.procurements add column if not exists negotiated_supplier_id uuid references public.suppliers(supplier_uuid);
alter table public.procurements add column if not exists manual_price numeric;
alter table public.procurements add column if not exists manual_unit text;
alter table public.procurements add column if not exists manual_quantity numeric;
alter table public.procurements alter column weight_preset_used drop default;
alter table public.procurements alter column weight_preset_used type text using weight_preset_used::text;
with numbered as (
  select id, row_number() over (order by created_at, id) as ordinal
  from public.procurements where reference_code is null
)
update public.procurements p
set reference_code = 'PSK-' || lpad(upper(to_hex(numbered.ordinal::int)), 4, '0')
from numbered where p.id = numbered.id;
alter table public.procurements alter column reference_code set not null;
create unique index if not exists procurements_reference_code_key on public.procurements (reference_code);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'procurements_reference_code_format') then
    alter table public.procurements add constraint procurements_reference_code_format
      check (reference_code ~ '^PSK-[A-Z0-9]{4}$');
  end if;
end $$;

create table if not exists public.procurement_messages (
  id uuid primary key default gen_random_uuid(),
  procurement_id uuid not null references public.procurements(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(supplier_uuid),
  message_type text not null check (message_type in ('negotiation', 'summary_confirmation')),
  direction text not null check (direction in ('outbound', 'inbound')),
  raw_text text not null,
  classified_as text,
  created_at timestamptz not null default now(),
  check (message_type = 'negotiation' or classified_as is null)
);
create index if not exists procurement_messages_scope_idx
  on public.procurement_messages (procurement_id, message_type, created_at desc);

create table if not exists public.allocations (
  id uuid primary key default gen_random_uuid(),
  procurement_id uuid not null references public.procurements(id) on delete cascade,
  supplier_id text not null references public.suppliers(id),
  quantity numeric not null default 0 check (quantity >= 0),
  price_per_unit numeric not null default 0 check (price_per_unit >= 0),
  total_cost numeric not null default 0 check (total_cost >= 0),
  cost_score numeric,
  speed_score numeric,
  reliability_score numeric,
  distance_score numeric,
  final_score numeric,
  created_at timestamptz not null default now(),
  unique (procurement_id, supplier_id)
);

alter table public.suppliers add column if not exists is_active boolean not null default true;
alter table public.suppliers add column if not exists nib text;
alter table public.suppliers add column if not exists npwp text;
alter table public.suppliers add column if not exists payment_terms text;
alter table public.allocations add column if not exists speed_score numeric;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  procurement_id uuid not null references public.procurements(id) on delete cascade,
  supplier_id text not null references public.suppliers(id),
  status public.payment_status not null default 'awaiting_payment',
  va_reference text,
  qris_reference text,
  amount numeric not null default 0 check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (procurement_id, supplier_id)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  supplier_id text not null references public.suppliers(id),
  procurement_id uuid references public.procurements(id) on delete set null,
  outcome_score numeric not null check (outcome_score in (0, 0.5, 1)),
  occurred_at timestamptz not null default now()
);

-- Existing RFQ and reply flows need durable per-supplier records during migration.
create table if not exists public.dispatch_logs (
  procurement_id uuid not null references public.procurements(id) on delete cascade,
  supplier_id text not null references public.suppliers(id),
  name text not null,
  phone text not null,
  message_sent text not null,
  requirement_snapshot jsonb not null,
  allocation_snapshot jsonb not null,
  dispatched_at timestamptz not null default now(),
  status text not null check (status in ('sent', 'failed')),
  po_sent boolean not null default false,
  primary key (procurement_id, supplier_id)
);

create table if not exists public.supplier_replies (
  id uuid primary key,
  procurement_id uuid references public.procurements(id) on delete set null,
  procurement_message_id uuid references public.procurement_messages(id) on delete set null,
  legacy_dispatch_id text,
  supplier_id text references public.suppliers(id) on delete set null,
  supplier_name text,
  phone text not null,
  message_received text not null,
  received_at timestamptz not null default now(),
  classification text not null default 'pending',
  ai_summary text,
  ai_extracted jsonb,
  human_override boolean not null default false,
  override_note text,
  resolved boolean not null default false
);
alter table public.supplier_replies add column if not exists procurement_message_id uuid
  references public.procurement_messages(id) on delete set null;

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists suppliers_category_idx on public.suppliers (material_category);
create index if not exists procurements_status_idx on public.procurements (status, updated_at desc);
create index if not exists dispatch_logs_phone_time_idx on public.dispatch_logs (phone, dispatched_at desc);
create index if not exists supplier_replies_procurement_idx on public.supplier_replies (procurement_id, received_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists suppliers_updated_at on public.suppliers;
create trigger suppliers_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();
drop trigger if exists procurements_updated_at on public.procurements;
create trigger procurements_updated_at before update on public.procurements
  for each row execute function public.set_updated_at();
drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
drop trigger if exists app_settings_updated_at on public.app_settings;
create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

-- A transaction outcome updates the supplier's observed reliability.
-- With no outcomes, a supplier returns to the neutral cold-start value.
create or replace function public.refresh_supplier_reliability()
returns trigger language plpgsql as $$
begin
  if tg_op <> 'INSERT' then
    update public.suppliers set reliability_score = coalesce(
      (select avg(outcome_score) from public.transactions where supplier_id = old.supplier_id), 0.5)
    where id = old.supplier_id;
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.supplier_id <> old.supplier_id) then
    update public.suppliers set reliability_score = coalesce(
      (select avg(outcome_score) from public.transactions where supplier_id = new.supplier_id), 0.5)
    where id = new.supplier_id;
  end if;
  return null;
end $$;
drop trigger if exists transactions_reliability on public.transactions;
create trigger transactions_reliability
  after insert or update or delete on public.transactions
  for each row execute function public.refresh_supplier_reliability();

alter table public.suppliers enable row level security;
alter table public.procurements enable row level security;
alter table public.procurement_messages enable row level security;
alter table public.allocations enable row level security;
alter table public.payments enable row level security;
alter table public.transactions enable row level security;
alter table public.dispatch_logs enable row level security;
alter table public.supplier_replies enable row level security;
alter table public.app_settings enable row level security;

-- Even if a project has permissive default grants, anonymous browser clients
-- cannot query these tables. Only the backend's service role can access them.
revoke all on public.suppliers, public.procurements, public.allocations,
  public.payments, public.transactions, public.dispatch_logs,
  public.supplier_replies, public.procurement_messages, public.app_settings from anon, authenticated;
grant all on public.suppliers, public.procurements, public.allocations,
  public.payments, public.transactions, public.dispatch_logs,
  public.supplier_replies, public.procurement_messages, public.app_settings to service_role;

-- Supabase Realtime watches status changes; the backend forwards safe events.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'procurements'
  ) then
    alter publication supabase_realtime add table public.procurements;
  end if;
end $$;
