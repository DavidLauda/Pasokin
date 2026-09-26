-- Run once in Supabase SQL Editor before deploying the reply model toggle.
-- Existing procurements keep Gemma as their default reply classifier.
alter table public.procurements
  add column if not exists reply_ai_provider text not null default 'gemma';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'procurements_reply_ai_provider_check') then
    alter table public.procurements add constraint procurements_reply_ai_provider_check
      check (reply_ai_provider in ('gemma', 'gemini'));
  end if;
end $$;
