-- =============================================================================
-- DADOS DE TESTE (somente homologação) — organizações fictícias marcadas [TESTE].
-- Atletas e responsáveis de teste são criados pela própria interface, com
-- dados inventados. Nunca usar dados ou vídeos reais de menores.
-- Pode rodar mais de uma vez: não duplica.
-- =============================================================================
do $vp$
begin
  if not exists (select 1 from pg_namespace where nspname = 'vp_meta') then
    raise exception 'VITRINEPLAYER: projeto não marcado como homologação. Nada foi alterado.';
  end if;
  if not exists (select 1 from vp_meta.environment where name = 'homolog') then
    raise exception 'VITRINEPLAYER: este projeto não é o de homologação. Nada foi alterado.';
  end if;
end $vp$;

insert into organizations (name, kind, country, status)
select v.name, v.kind::pro_org_kind, 'BR', v.status::review_status
from (values
  ('[TESTE] Clube Atlético Horizonte', 'club', 'approved'),
  ('[TESTE] Esporte Clube Vale Verde', 'club', 'approved'),
  ('[TESTE] Agência Linha de Fundo', 'agent', 'approved'),
  ('[TESTE] Núcleo de Captação Sul', 'scouting_hub', 'approved'),
  ('[TESTE] Clube Aguardando Verificação', 'club', 'pending'),
  ('[TESTE] Representações Aguardando', 'company', 'pending')
) as v (name, kind, status)
where not exists (select 1 from organizations o where o.name = v.name);

select name, kind, status from organizations where name like '[TESTE]%' order by status, name;
