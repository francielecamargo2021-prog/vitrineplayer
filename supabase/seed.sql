-- =============================================================================
-- SEED LOCAL (somente `supabase db reset` / `supabase start` em desenvolvimento).
-- Nunca é aplicado em produção (`supabase db push` não executa seeds).
-- =============================================================================

-- Organizações fictícias para testar "Ocultar meu perfil para".
insert into organizations (name, kind, country, status) values
  ('[DEV] Clube Atlético Horizonte', 'club', 'BR', 'approved'),
  ('[DEV] Esporte Clube Vale Verde', 'club', 'BR', 'approved'),
  ('[DEV] Agência Linha de Fundo', 'agent', 'BR', 'approved'),
  ('[DEV] Scouting Sul Talentos', 'scout', 'BR', 'approved'),
  ('[DEV] Clube em Análise', 'club', 'BR', 'pending');

-- DEV/TEST: simula a confirmação do gateway. NÃO é checkout: não existe na
-- interface, não está nas migrations e só pode ser chamada por conexão direta
-- ao banco local (sem permissão para anon/authenticated/service_role).
create or replace function dev_test_simulate_payment(p_athlete uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare v_payment uuid; v_payer uuid;
begin
  select profile_id into v_payer from athlete_guardians where athlete_id = p_athlete and is_primary;
  insert into payments (athlete_id, payer_id, provider, provider_ref) values (p_athlete, v_payer, 'DEV_TEST', 'DEV_TEST')
    returning id into v_payment;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform mark_payment_paid(v_payment, 'DEV_TEST', 'DEV_TEST-' || v_payment);
end $$;
revoke execute on function dev_test_simulate_payment(uuid) from public, anon, authenticated, service_role;
