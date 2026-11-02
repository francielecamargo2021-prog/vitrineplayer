/**
 * SQL da integração PitchVision (uma única fonte), executado com a identidade de SERVIÇO.
 * Usado pelo app (repo-db.ts, Neon) e pelo teste ponta a ponta local (Postgres local com as mesmas migrations).
 */
import type { InProgress, PvRepo, Stage, ToSend } from "./integrator.ts";

export type Run = <T = Record<string, unknown>>(text: string, params: unknown[]) => Promise<T[]>;
export type PvDbRepo = PvRepo & { registerEvent(eventId: string, type: string): Promise<boolean> };

const COLS = `r.id as request_id, r.athlete_id, r.pv_match_id, r.pv_request_id, r.pv_stage, r.position::text as position, r.report_locale`;

export function makePvRepo(run: Run): PvDbRepo {
  return {
    requestsToSend: (limit) => run<ToSend>(`select request_id, athlete_id, video_id, blob_pathname, video_type::text as video_type,
      shirt_number, shirt_color, athlete_position::text as athlete_position, birth_year, category from pv_requests_to_send($1)`, [limit]),

    async linkRequest(requestId: string, matchId: string, pvRequestId: string, stage: Stage) {
      const [r] = await run<{ ok: boolean }>(`select pv_link_request($1::uuid, $2, $3, $4) as ok`, [requestId, matchId, pvRequestId, stage]);
      return Boolean(r?.ok);
    },

    inProgress: (limit) => run<InProgress>(`select ${COLS} from ai_analysis_requests r
      where r.provider = 'pitchvision' and r.status = 'processing' and r.pv_request_id is not null
      order by r.updated_at limit $1`, [limit]),

    async byPvRequest(pvRequestId) {
      const [r] = await run<InProgress>(`select ${COLS} from ai_analysis_requests r
        where r.provider = 'pitchvision' and r.status = 'processing' and r.pv_request_id = $1`, [pvRequestId]);
      return r ?? null;
    },

    byPvMatch: (pvMatchId) => run<InProgress>(`select ${COLS} from ai_analysis_requests r
      where r.provider = 'pitchvision' and r.status = 'processing' and r.pv_match_id = $1`, [pvMatchId]),

    async setStage(pvRequestId, stage, status, error) {
      await run(`select pv_set_stage($1, $2, $3::ai_analysis_status, $4)`, [pvRequestId, stage, status ?? null, error ?? null]);
    },

    async saveReport(pvRequestId, p) {
      const [r] = await run<{ id: string | null }>(`select pv_save_report($1, $2, $3, $4::ai_confidence, $5, $6::text[], $7::text[], $8, $9::jsonb) as id`,
        [pvRequestId, p.position_group, p.coverage, p.confidence, p.summary, p.strengths, p.development, p.positioning, JSON.stringify(p.report)]);
      return r?.id ?? null;
    },

    async notifyGuardians(athleteId, template, payload) {
      await run(`insert into notification_outbox (profile_id, channel, template, payload)
        select g.profile_id, 'email', $2, $3::jsonb from athlete_guardians g where g.athlete_id = $1`,
        [athleteId, template, JSON.stringify({ ...payload, athlete_id: athleteId })]);
    },

    async registerEvent(eventId, type) {
      const [r] = await run<{ ok: boolean }>(`select pv_register_event($1, $2) as ok`, [eventId, type]);
      return Boolean(r?.ok);
    },
  };
}
