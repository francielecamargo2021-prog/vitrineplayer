-- =============================================================================
-- SIMULAR PAGAMENTO CONFIRMADO (somente homologação — não existe gateway ainda)
-- Faz o mesmo que o aviso do gateway fará: registra o pagamento e chama
-- mark_payment_paid, que leva o atleta para "em revisão".
-- 1. No painel, clique em "Ir para pagamento" no atleta de teste.
-- 2. Troque NOME_ESPORTIVO_AQUI pelo nome esportivo do atleta de teste.
-- 3. Cole no SQL Editor e clique em Run.
-- =============================================================================
do $vp$
declare
  v_name text := trim('NOME_ESPORTIVO_AQUI');
  v_athlete uuid;
  v_payer uuid;
  v_payment uuid;
  v_count int;
begin
  if not exists (select 1 from pg_namespace where nspname = 'vp_meta') then
    raise exception 'VITRINEPLAYER: projeto não marcado como homologação. Nada foi alterado.';
  end if;
  if not exists (select 1 from vp_meta.environment where name = 'homolog') then
    raise exception 'VITRINEPLAYER: este projeto não é o de homologação. Nada foi alterado.';
  end if;
  select count(*) into v_count from athletes where sport_name = v_name and status in ('draft', 'pending_payment');
  if v_count <> 1 then
    raise exception 'VITRINEPLAYER: encontrei % atleta(s) "%" aguardando pagamento (precisa ser exatamente 1). Nada foi alterado.', v_count, v_name;
  end if;
  select a.id, g.profile_id into v_athlete, v_payer
  from athletes a join athlete_guardians g on g.athlete_id = a.id and g.is_primary
  where a.sport_name = v_name and a.status in ('draft', 'pending_payment');

  -- mesma identidade que o webhook usará (service role)
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into payments (athlete_id, payer_id, provider, provider_ref, amount_cents)
  values (v_athlete, v_payer, 'HOMOLOG', 'HOMOLOG', 5990) returning id into v_payment;
  perform mark_payment_paid(v_payment, 'HOMOLOG', 'HOMOLOG-' || v_payment);
end $vp$;

select a.sport_name, a.status as atleta, p.status as pagamento, p.paid_at
from payments p join athletes a on a.id = p.athlete_id
where p.provider = 'HOMOLOG' order by p.created_at desc limit 5;
