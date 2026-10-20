-- Portal dos profissionais (0008): cadastro e verificação, exposição mínima dos dados do
-- atleta, busca/filtros, limite diário de fichas, favoritos, listas e interesse decidido
-- pela família. Tudo dentro de begin/rollback: nenhum dado fica gravado.
begin;
create extension if not exists pgtap;
select no_plan();

create function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anonymous"}', true);
  execute 'set local role anonymous';
end $$;

create temp table ids (k text primary key, id uuid) on commit drop;
grant all on ids to authenticated, anonymous;

-- contas: responsáveis G1 (menor + adulto em nome próprio é G2), G3 (outra família), profissional P, P2, admin
insert into neon_auth."user" (id, name, email, "emailVerified") values
  ('f1000000-0000-0000-0000-0000000000f1', 'Mãe Portal', 'portal-g1@test.dev', true),
  ('f2000000-0000-0000-0000-0000000000f2', 'Adulto Portal', 'portal-g2@test.dev', true),
  ('f3000000-0000-0000-0000-0000000000f3', 'Outra Família', 'portal-g3@test.dev', true),
  ('f4000000-0000-0000-0000-0000000000f4', 'Paula Olheira', 'portal-p@test.dev', true),
  ('f5000000-0000-0000-0000-0000000000f5', 'Pedro Agente', 'portal-p2@test.dev', true),
  ('f6000000-0000-0000-0000-0000000000f6', 'Admin Portal', 'portal-admin@test.dev', true);
update profiles set role = 'ADMIN' where id = 'f6000000-0000-0000-0000-0000000000f6';

-- atletas: menor (sobrenome não pode vazar), menor sem nome esportivo, adulto
select pg_temp.as_user('f1000000-0000-0000-0000-0000000000f1');
insert into ids values ('minor', create_athlete('Lucas Pereira Souza', 'Lukinha', (current_date - interval '14 years')::date, 'BR', 'mother'));
insert into ids values ('minor2', create_athlete('Ana Clara Ribeiro', '', (current_date - interval '13 years')::date, 'BR', 'mother'));
update athletes set primary_position = 'ST', category = 'Sub-15', modality = 'field', sex = 'male', foot = 'left', height_cm = 165,
       state = 'São Paulo', city = 'Campinas', current_club = 'EC Teste', available = true where id = (select id from ids where k = 'minor');
update athletes set primary_position = 'GK', category = 'Sub-13', modality = 'futsal', sex = 'female', state = 'Paraná', city = 'Curitiba'
 where id = (select id from ids where k = 'minor2');
insert into athlete_media (athlete_id, kind, url, external_id) select id, 'youtube', 'https://www.youtube.com/watch?v=abcdefghijk', 'abcdefghijk' from ids where k = 'minor';
insert into athlete_achievements (athlete_id, title, year) select id, 'Artilheiro da copa', 2025 from ids where k = 'minor';
select pg_temp.as_user('f2000000-0000-0000-0000-0000000000f2');
insert into ids values ('adult', create_athlete('Bruno Henrique Alves', '', (current_date - interval '19 years')::date, 'BR', 'self'));
update athletes set primary_position = 'CB', category = 'Profissional', modality = 'field', sex = 'male' where id = (select id from ids where k = 'adult');
select pg_temp.as_service();
update athletes set status = 'approved', approved_at = now(), review_note = 'nota interna do admin' where id in (select id from ids);

-- ================================================================ cadastro do profissional
select pg_temp.as_user('f4000000-0000-0000-0000-0000000000f4');
select throws_ok($$ select complete_professional_signup('+5511988880001', 'BR', 'pt-BR', array['terms', 'privacy'], 'v',
  '{"name":"Olheira Paula","kind":"scout","document":"123.456.789-00","contact_role":"Olheira"}') $$,
  'P0001', 'consents', 'cadastro profissional exige o termo de conduta');
select throws_ok($$ select complete_professional_signup('+5511988880001', 'BR', 'pt-BR', array['terms', 'privacy', 'pro_conduct'], 'v',
  '{"name":"Olheira Paula","kind":"brand","document":"123","contact_role":"Olheira"}') $$,
  'P0001', 'invalid kind', 'só os tipos de profissional previstos');
select throws_ok($$ select complete_professional_signup('+5511988880001', 'BR', 'pt-BR', array['terms', 'privacy', 'pro_conduct'], 'v',
  '{"name":"Olheira Paula","kind":"scout","contact_role":"Olheira"}') $$,
  'P0001', 'organization required', 'documento é obrigatório para a verificação');
select lives_ok($$ insert into ids values ('org', complete_professional_signup('+5511988880001', 'BR', 'pt-BR', array['terms', 'privacy', 'pro_conduct'], 'v',
  '{"name":"Olheira Paula Scouting","kind":"scout","document":"123.456.789-00","contact_role":"Olheira autônoma","state":"SP","website":"https://paula.example"}')) $$,
  'olheira autônoma se cadastra');
select is((select role::text from profiles where id = public.vp_uid()), 'PROFESSIONAL', 'conta vira profissional');
select is((select status::text from organizations where id = (select id from ids where k = 'org')), 'pending', 'organização entra como pendente');
select is((select count(*)::int from organization_members where profile_id = public.vp_uid() and is_owner), 1, 'quem cadastra é a dona da organização');
select throws_ok($$ select complete_professional_signup('+5511988880001', 'BR', 'pt-BR', array['terms', 'privacy', 'pro_conduct'], 'v',
  '{"name":"Outra","kind":"club","document":"999","contact_role":"x y"}') $$, 'P0001', 'signup already completed', 'cadastro profissional só uma vez');
select is((pro_account()->>'approved')::boolean, false, 'antes da aprovação o portal fica fechado');
select is((select count(*)::int from pro_search_athletes()), 0, 'pendente não encontra atletas');
select throws_ok(format($$ select pro_athlete_profile(%L) $$, (select id from ids where k = 'minor')), 'P0001', 'not found', 'pendente não abre ficha');
select throws_ok(format($$ select pro_send_interest(%L, 'Gostaria de conhecer o atleta.') $$, (select id from ids where k = 'minor')), 'P0001', 'not found',
  'pendente não envia interesse');
update organizations set status = 'approved' where id = (select id from ids where k = 'org');
select is((select status::text from organizations where id = (select id from ids where k = 'org')), 'pending', 'profissional não aprova a própria organização');

select pg_temp.as_user('f1000000-0000-0000-0000-0000000000f1');
select throws_ok($$ select complete_professional_signup('+5511988880002', 'BR', 'pt-BR', array['terms', 'privacy', 'pro_conduct'], 'v',
  '{"name":"Clube da Mãe","kind":"club","document":"12345","contact_role":"Diretora"}') $$, 'P0001', null,
  'responsável com atleta não vira profissional');

-- segundo profissional (empresário), aprovado
select pg_temp.as_user('f5000000-0000-0000-0000-0000000000f5');
insert into ids values ('org2', complete_professional_signup('+5511988880003', 'BR', 'pt-BR', array['terms', 'privacy', 'pro_conduct'], 'v',
  '{"name":"Agência Pedro","kind":"manager","document":"12.345.678/0001-90","contact_role":"Empresário"}'));

-- verificação pelo admin
select pg_temp.as_user('f6000000-0000-0000-0000-0000000000f6');
select throws_ok(format($$ select admin_review_organization(%L, 'reject') $$, (select id from ids where k = 'org')), 'P0001', 'note required', 'recusa exige motivo');
select is(admin_review_organization((select id from ids where k = 'org'), 'approve')::text, 'approved', 'admin aprova a olheira');
select is(admin_review_organization((select id from ids where k = 'org2'), 'approve')::text, 'approved', 'admin aprova o empresário');

-- ================================================================ exposição mínima
select pg_temp.as_user('f4000000-0000-0000-0000-0000000000f4');
select is((pro_account()->>'approved')::boolean, true, 'aprovada, o portal abre');
select is((select count(*)::int from athletes), 0, 'profissional não lê a tabela de atletas');
select is((select count(*)::int from athlete_media), 0, 'nem a de mídia');
select is((select count(*)::int from athlete_achievements), 0, 'nem a de conquistas');
select is((select count(*)::int from athlete_clubs), 0, 'nem a de clubes');
select is((select count(*)::int from athlete_guardians), 0, 'nem os vínculos com responsáveis');
select is((select count(*)::int from profiles), 1, 'só lê o próprio perfil (nenhum contato de família)');
select is((select count(*)::int from pro_search_athletes()), 3, 'busca encontra os 3 atletas aprovados');
select is((select display_name from pro_search_athletes() where id = (select id from ids where k = 'minor')), 'Lukinha', 'menor aparece pelo nome esportivo');
select is((select display_name from pro_search_athletes() where id = (select id from ids where k = 'minor2')), 'Ana', 'menor sem nome esportivo: só o primeiro nome');
select is((select display_name from pro_search_athletes() where id = (select id from ids where k = 'adult')), 'Bruno Henrique Alves', 'adulto aparece com o nome');
select is((select age from pro_search_athletes() where id = (select id from ids where k = 'minor')), 14, 'idade, não a data de nascimento');
select is((select state || '/' || country from pro_search_athletes() where id = (select id from ids where k = 'minor')), 'São Paulo/BR', 'localização: estado e país');

create temp table prof on commit drop as select pro_athlete_profile((select id from ids where k = 'minor')) as j;
select ok(not ((select j from prof) ?| array['full_name', 'birth_date', 'city', 'review_note', 'responsible_id', 'reviewed_by']),
  'ficha não traz nome completo, data, cidade nem dados internos');
select ok(not ((select j->'card' from prof) ?| array['full_name', 'birth_date', 'city', 'review_note']), 'cartão também não');
select ok(position('Souza' in (select j::text from prof)) = 0 and position('Pereira' in (select j::text from prof)) = 0, 'sobrenome do menor não aparece em lugar nenhum');
select ok(position('Campinas' in (select j::text from prof)) = 0 and position('nota interna' in (select j::text from prof)) = 0, 'cidade e nota do admin não aparecem');
select is(jsonb_array_length((select j->'videos' from prof)), 1, 'ficha traz os vídeos');
select is(jsonb_array_length((select j->'achievements' from prof)), 1, 'e as conquistas');

-- filtros
select is((select count(*)::int from pro_search_athletes('{"positions":["ST"]}')), 1, 'filtro de posição');
select is((select count(*)::int from pro_search_athletes('{"age_min":"18"}')), 1, 'filtro de idade mínima');
select is((select count(*)::int from pro_search_athletes('{"age_max":"14","sex":"female"}')), 1, 'idade máxima + sexo');
select is((select count(*)::int from pro_search_athletes('{"modality":"futsal"}')), 1, 'modalidade');
select is((select count(*)::int from pro_search_athletes('{"with_video":"1"}')), 1, 'com vídeo');
select is((select count(*)::int from pro_search_athletes('{"state":"paraná"}')), 1, 'estado (sem diferenciar maiúsculas)');
select is((select count(*)::int from pro_search_athletes('{"foot":"left","height_min":"160","available":"1"}')), 1, 'pé, altura e disponibilidade');

-- ================================================================ limite diário de fichas
select pg_temp.as_owner();
update portal_settings set profile_views_per_day = 2;
select pg_temp.as_user('f4000000-0000-0000-0000-0000000000f4');
select lives_ok(format($$ select pro_athlete_profile(%L) $$, (select id from ids where k = 'minor')), 'reabrir a mesma ficha não conta de novo');
select lives_ok(format($$ select pro_athlete_profile(%L) $$, (select id from ids where k = 'minor2')), 'segunda ficha do dia');
select throws_ok(format($$ select pro_athlete_profile(%L) $$, (select id from ids where k = 'adult')), 'P0001', 'daily limit', 'terceira ficha diferente: limite diário');
select is((pro_account()->'usage'->>'views_today')::int, 2, 'uso do dia aparece para o profissional');
select pg_temp.as_owner();
update portal_settings set profile_views_per_day = 100;

-- ================================================================ favoritos e listas privadas
select pg_temp.as_user('f4000000-0000-0000-0000-0000000000f4');
select lives_ok(format($$ insert into pro_favorites (profile_id, athlete_id) values (public.vp_uid(), %L) $$, (select id from ids where k = 'minor')), 'favorita um atleta');
select is((select count(*)::int from pro_saved_athletes()), 1, 'favoritos listados como cartões');
select is((select is_favorite from pro_search_athletes() where id = (select id from ids where k = 'minor')), true, 'busca marca o favorito');
with x as (insert into pro_lists (organization_id, name, created_by) values ((select id from ids where k = 'org'), 'Atacantes Sub-15', public.vp_uid()) returning id)
insert into ids select 'list', id from x;
select throws_ok(format($$ insert into pro_lists (organization_id, name, created_by) values (%L, 'Invasão', public.vp_uid()) $$, (select id from ids where k = 'org2')),
  '42501', null, 'não cria lista em outra organização');
select lives_ok(format($$ insert into pro_list_items (list_id, athlete_id, added_by) values (%L, %L, public.vp_uid()) $$,
  (select id from ids where k = 'list'), (select id from ids where k = 'minor')), 'adiciona atleta à lista');
select is((select count(*)::int from pro_saved_athletes((select id from ids where k = 'list'))), 1, 'lista mostra o atleta');
select pg_temp.as_user('f5000000-0000-0000-0000-0000000000f5');
select is((select count(*)::int from pro_lists), 0, 'outra organização não vê as listas');
select is((select count(*)::int from pro_saved_athletes((select id from ids where k = 'list'))), 0, 'nem os atletas da lista');
select is((select count(*)::int from pro_favorites), 0, 'nem os favoritos de outra pessoa');

-- ================================================================ interesse
select pg_temp.as_user('f4000000-0000-0000-0000-0000000000f4');
select throws_ok(format($$ select pro_send_interest(%L, 'Oi') $$, (select id from ids where k = 'minor')), 'P0001', 'message length', 'mensagem curta demais');
select throws_ok(format($$ select pro_send_interest(%L, 'Me chame no 11 98888-7777 para conversarmos') $$, (select id from ids where k = 'minor')),
  'P0001', 'message contact', 'mensagem não leva telefone');
select throws_ok(format($$ select pro_send_interest(%L, 'Escreva para paula@exemplo.com por favor') $$, (select id from ids where k = 'minor')),
  'P0001', 'message contact', 'nem e-mail');
select lives_ok(format($$ insert into ids values ('req', pro_send_interest(%L, 'Gostamos do seu jogo e queremos convidar para uma avaliação.')) $$, (select id from ids where k = 'minor')),
  'envia interesse');
select throws_ok(format($$ select pro_send_interest(%L, 'Gostamos do seu jogo de novo, segunda tentativa.') $$, (select id from ids where k = 'minor')),
  'P0001', 'already open', 'um interesse aberto por atleta');
select is((select count(*)::int from contact_requests), 0, 'organização não lê a tabela de interesses diretamente');
select is((select status from pro_my_interests() where id = (select id from ids where k = 'req')), 'requested', 'organização acompanha pelo portal');
select throws_ok(format($$ select respond_interest(%L, 'accept') $$, (select id from ids where k = 'req')), 'P0001', 'not found', 'profissional não responde pela família');

-- família
select pg_temp.as_user('f3000000-0000-0000-0000-0000000000f3');
select is((select count(*)::int from guardian_interests()), 0, 'outra família não vê o interesse');
select throws_ok(format($$ select respond_interest(%L, 'accept') $$, (select id from ids where k = 'req')), 'P0001', 'not found', 'nem responde');
select pg_temp.as_user('f1000000-0000-0000-0000-0000000000f1');
select is((select count(*)::int from guardian_interests()), 1, 'o responsável recebe o interesse direto');
select is((select org_name from guardian_interests()), 'Olheira Paula Scouting', 'vê quem é a organização');
select ok((select org_contact from guardian_interests()) is null, 'contato da organização só depois de aceitar');
select is(respond_interest((select id from ids where k = 'req'), 'accept'), 'accept', 'família aceita');
select ok((select org_contact->>'email' from guardian_interests()) = 'portal-p@test.dev', 'família recebe o contato oficial da organização');
select pg_temp.as_user('f4000000-0000-0000-0000-0000000000f4');
select is((select status from pro_my_interests() where id = (select id from ids where k = 'req')), 'accepted', 'organização vê "aceito"');
select ok(position('portal-g1' in (select coalesce(jsonb_agg(x)::text, '') from pro_my_interests() x)) = 0
      and position('+55' in (select coalesce(jsonb_agg(x)::text, '') from pro_my_interests() x)) = 0, 'nenhum dado da família é liberado ao profissional');

-- recusar, bloquear, denunciar
select lives_ok(format($$ insert into ids values ('req2', pro_send_interest(%L, 'Temos uma vaga na escolinha para a sua categoria.')) $$, (select id from ids where k = 'minor2')),
  'interesse em outra atleta');
select pg_temp.as_user('f1000000-0000-0000-0000-0000000000f1');
select throws_ok(format($$ select respond_interest(%L, 'report', 'x') $$, (select id from ids where k = 'req2')), 'P0001', 'reason required', 'denúncia exige motivo');
select is(respond_interest((select id from ids where k = 'req2'), 'report', 'Mensagem inadequada para a idade'), 'report', 'família denuncia');
select is(respond_interest((select id from ids where k = 'req2'), 'block'), 'block', 'e bloqueia a organização');
select pg_temp.as_user('f4000000-0000-0000-0000-0000000000f4');
select is((select status from pro_my_interests() where id = (select id from ids where k = 'req2')), 'declined', 'organização vê só "não aceito" (sem denúncia)');
select ok((select athlete_name from pro_my_interests() where id = (select id from ids where k = 'req2')) is null, 'atleta que bloqueou fica indisponível');
select is((select count(*)::int from pro_search_athletes() where id = (select id from ids where k = 'minor2')), 0, 'bloqueio tira a atleta da busca');
select pg_temp.as_user('f6000000-0000-0000-0000-0000000000f6');
select is((select count(*)::int from contact_requests where reported_at is not null), 1, 'admin vê a denúncia');

-- limite mensal e expiração
select pg_temp.as_owner();
update portal_settings set interests_per_month = 2;
select pg_temp.as_user('f4000000-0000-0000-0000-0000000000f4');
select throws_ok(format($$ select pro_send_interest(%L, 'Queremos conhecer melhor o seu trabalho em campo.') $$, (select id from ids where k = 'adult')),
  'P0001', 'monthly limit', 'limite mensal de interesses da organização');
select pg_temp.as_owner();
update portal_settings set interests_per_month = 30;
select pg_temp.as_user('f5000000-0000-0000-0000-0000000000f5');
insert into ids values ('req3', pro_send_interest((select id from ids where k = 'adult'), 'Sou empresário e gostaria de conversar sobre sua carreira.'));
select pg_temp.as_owner();
update contact_requests set created_at = now() - interval '40 days' where id = (select id from ids where k = 'req3');
select pg_temp.as_user('f2000000-0000-0000-0000-0000000000f2');
select is((select status from guardian_interests()), 'expired', 'interesse sem resposta expira no prazo');
select throws_ok(format($$ select respond_interest(%L, 'accept') $$, (select id from ids where k = 'req3')), 'P0001', 'invalid transition', 'expirado não pode ser aceito');

-- ================================================================ limites: só o admin ajusta
select pg_temp.as_user('f4000000-0000-0000-0000-0000000000f4');
select throws_ok($$ select admin_update_portal_settings(1000, 1000, 30) $$, 'P0001', 'not allowed', 'profissional não muda os limites');
update portal_settings set profile_views_per_day = 9999;
select is((select profile_views_per_day from portal_settings), 100, 'nem direto na tabela');
select pg_temp.as_user('f6000000-0000-0000-0000-0000000000f6');
select lives_ok($$ select admin_update_portal_settings(120, 40, 30) $$, 'admin ajusta os limites');
select is((select interests_per_month from portal_settings), 40, 'limite novo vale');

-- ================================================================ suspensão e anônimo
select lives_ok(format($$ select admin_review_organization(%L, 'suspend', 'Documento vencido') $$, (select id from ids where k = 'org')), 'admin suspende');
select pg_temp.as_user('f4000000-0000-0000-0000-0000000000f4');
select is((select count(*)::int from pro_search_athletes()), 0, 'organização suspensa perde a busca');
select is(pro_account()->'organization'->>'review_note', 'Documento vencido', 'profissional vê o motivo da suspensão');
select pg_temp.as_anon();
select throws_ok($$ select * from pro_search_athletes() $$, '42501', null, 'anônimo não executa a busca');
select throws_ok($$ select * from guardian_interests() $$, '42501', null, 'nem a caixa de interesses');
select pg_temp.as_owner();

select * from finish();
rollback;
