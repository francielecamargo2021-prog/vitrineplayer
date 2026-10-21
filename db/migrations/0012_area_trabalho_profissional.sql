-- =============================================================================
-- VITRINEPLAYER — Área de trabalho do profissional na ficha do atleta (fase B1).
-- Leituras por função, porque o profissional não lê as tabelas do atleta nem os
-- perfis de outras pessoas (regra de 0008):
--  * pro_athlete_videos: vídeos do atleta com id (para a avaliação citar o vídeo);
--  * pro_workspace: etapa do funil, notas e avaliações da organização, com o nome
--    de quem escreveu (colegas da mesma organização) — ocultas sem visibilidade;
--  * pro_tracked_athletes: cartões dos atletas acompanhados, por etapa do funil.
-- =============================================================================

create or replace function pro_athlete_videos(p_athlete uuid)
  returns table (id uuid, youtube text, title text, video_type text)
  language sql stable security definer set search_path = public as $$
  select m.id, m.external_id, m.title, m.video_type::text from athlete_media m
   where m.athlete_id = p_athlete and m.kind = 'youtube'
     and public.vp_uid() is not null and is_approved_pro() and athlete_visible_to_pro(p_athlete)
   order by m.position, m.created_at
$$;

create or replace function pro_workspace(p_athlete uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  with org as (select my_pro_org() as id)
  select case when public.vp_uid() is null or not is_approved_pro() or not athlete_visible_to_pro(p_athlete) then null else jsonb_build_object(
    'stage', (select t.stage from pro_tracking t, org where t.organization_id = org.id and t.athlete_id = p_athlete),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'tags', n.tags, 'created_at', n.created_at,
                'author', coalesce(p.full_name, '—'), 'mine', n.author_id = public.vp_uid()) order by n.created_at desc), '[]')
                from pro_notes n left join profiles p on p.id = n.author_id, org
               where n.athlete_id = p_athlete and n.organization_id = org.id),
    'evaluations', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'created_at', e.created_at, 'author', coalesce(p.full_name, '—'),
                'mine', e.author_id = public.vp_uid(), 'position_group', e.position_group, 'rubric_version', e.rubric_version,
                'scores', e.scores, 'observation', e.observation, 'context', e.context, 'video_minute', e.video_minute,
                'youtube', (select m.external_id from athlete_media m where m.id = e.media_id)) order by e.created_at desc), '[]')
                from scout_evaluations e left join profiles p on p.id = e.author_id, org
               where e.athlete_id = p_athlete and e.organization_id = org.id and e.scores is not null)
  ) end
$$;

create or replace function pro_tracked_athletes(p_stage text default null)
  returns table (stage text, stage_updated_at timestamptz, id uuid, display_name text, age int, birth_year int, sex text, modality text,
                 primary_position text, secondary_positions text[], foot text, height_cm smallint, state text, country text,
                 current_club text, category text, available boolean, seeking text[], has_video boolean, photo text,
                 focal_x real, focal_y real, zoom real, is_favorite boolean, approved_at timestamptz)
  language sql stable security definer set search_path = public as $$
  select t.stage, t.updated_at, c.*
    from pro_tracking t
    join lateral pro_cards(array[t.athlete_id]) c on true
   where t.organization_id = my_pro_org() and is_approved_pro()
     and (p_stage is null or t.stage = p_stage)
   order by t.updated_at desc
   limit 500
$$;

revoke execute on function pro_athlete_videos(uuid), pro_workspace(uuid), pro_tracked_athletes(text) from public, anonymous;
grant execute on function pro_athlete_videos(uuid), pro_workspace(uuid), pro_tracked_athletes(text) to authenticated;
