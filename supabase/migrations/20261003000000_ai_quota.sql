-- AI fallback allowance: Free = 100 AI-assisted parses per calendar month, Pro = unlimited.
-- Run in SQL Editor after the init migration. Safe to run again.
--
-- consume_ai_parse() is called by the parse-fallback edge function (service role) BEFORE it
-- calls the model, so the limit can't be raced past. refund_ai_parse() gives the use back
-- if the model call then fails.

create or replace function public.consume_ai_parse(p_user uuid, p_free_limit integer default 100)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  period text := to_char(now() at time zone 'utc', 'YYYY-MM');
  ent public.entitlements%rowtype;
begin
  insert into public.entitlements (user_id) values (p_user) on conflict do nothing;
  select * into ent from public.entitlements where user_id = p_user for update;

  if ent.ai_period <> period then
    ent.ai_period := period;
    ent.ai_count := 0;
  end if;

  if (ent.pro_until is null or ent.pro_until <= now()) and ent.ai_count >= p_free_limit then
    update public.entitlements set ai_period = ent.ai_period, ai_count = ent.ai_count where user_id = p_user;
    return false;
  end if;

  update public.entitlements set ai_period = ent.ai_period, ai_count = ent.ai_count + 1 where user_id = p_user;
  return true;
end $$;

create or replace function public.refund_ai_parse(p_user uuid)
returns void
language sql security definer set search_path = '' as $$
  update public.entitlements set ai_count = greatest(ai_count - 1, 0)
  where user_id = p_user and ai_period = to_char(now() at time zone 'utc', 'YYYY-MM');
$$;

-- Only server code (service role) may spend or refund allowance.
revoke all on function public.consume_ai_parse(uuid, integer) from public, anon, authenticated;
revoke all on function public.refund_ai_parse(uuid) from public, anon, authenticated;
grant execute on function public.consume_ai_parse(uuid, integer) to service_role;
grant execute on function public.refund_ai_parse(uuid) to service_role;
