-- =============================================================================
-- Subconjunto do pgTAP usado pelos testes (no_plan, is, ok, throws_ok, lives_ok,
-- has_function, finish). Permite rodar supabase/tests/*.test.sql sem a extensão.
-- As asserções executam com o papel corrente (RLS valendo); só o registro do
-- resultado usa security definer.
-- =============================================================================
create table public._tap (n serial, ok boolean, description text);
grant all on public._tap, public._tap_n_seq to anon, authenticated, service_role;

create function public._tap_record(p_ok boolean, p_desc text) returns text
  language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into _tap (ok, description) values (coalesce(p_ok, false), p_desc) returning n into v_n;
  raise notice '% % - %', case when coalesce(p_ok, false) then 'ok' else 'not ok' end, v_n, p_desc;
  return (case when coalesce(p_ok, false) then 'ok ' else 'not ok ' end) || v_n || ' - ' || coalesce(p_desc, '');
end $$;

create function public.no_plan() returns setof boolean language sql as $$ select true where false $$;

create function public.ok(p boolean, p_desc text default '') returns text language sql as $$
  select public._tap_record(p, p_desc)
$$;

create function public.is(have anyelement, want anyelement, p_desc text default '') returns text
  language plpgsql as $$
begin
  if have is distinct from want then
    raise notice '#   have: %  want: %', have, want;
  end if;
  return public._tap_record(not (have is distinct from want), p_desc);
end $$;

create function public.throws_ok(p_sql text, p_code text, p_msg text, p_desc text) returns text
  language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if (p_code is null or sqlstate = p_code) and (p_msg is null or sqlerrm = p_msg) then
      return public._tap_record(true, p_desc);
    end if;
    raise notice '#   got: % %', sqlstate, sqlerrm;
    return public._tap_record(false, p_desc);
  end;
  raise notice '#   no exception raised';
  return public._tap_record(false, p_desc);
end $$;

create function public.lives_ok(p_sql text, p_desc text default '') returns text
  language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice '#   died: % %', sqlstate, sqlerrm;
    return public._tap_record(false, p_desc);
  end;
  return public._tap_record(true, p_desc);
end $$;

create function public.has_function(p_schema name, p_name name, p_args text[], p_desc text) returns text
  language sql as $$
  select public._tap_record(exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = p_schema and p.proname = p_name
      and coalesce(array(select format_type(t, null) from unnest(p.proargtypes) t), '{}') = p_args), p_desc)
$$;

create function public.finish() returns setof text language plpgsql security definer set search_path = public as $$
declare v_total int; v_fail int;
begin
  select count(*), count(*) filter (where not ok) into v_total, v_fail from _tap;
  return next format('1..%s', v_total);
  if v_fail > 0 then
    raise exception 'FALHOU: % de % asserções', v_fail, v_total;
  end if;
  return next format('# todas as %s asserções passaram', v_total);
end $$;
grant execute on function public._tap_record(boolean, text), public.no_plan(), public.ok(boolean, text),
  public.throws_ok(text, text, text, text), public.lives_ok(text, text),
  public.has_function(name, name, text[], text), public.finish() to anon, authenticated, service_role;
