-- Run once in the Supabase SQL Editor for databases that already have Pasokin tables.
-- A fresh database gets this column from schema.sql.
alter table public.suppliers
  add column if not exists location_verified boolean not null default false;

-- Earlier registration forms saved either a geocoded point or a chosen map pin.
update public.suppliers
set location_verified = true
where location_verified = false and lat is not null and lng is not null;
