import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale, htmlLang } from "@/i18n/config";
import { getPanelDictionary } from "@/i18n/get-dictionary";
import { getAiState, getAthleteBundle, requireGuardian, signedPhotoUrls } from "@/lib/panel/data";
import { cancelAiAnalysis, requestAiAnalysis } from "@/lib/panel/ai-actions";
import { addVideo, removeVideo, saveStep, setVisibility, submitForReview, withdrawFromReview } from "@/lib/panel/actions";
import { isStep, stepSlugs } from "@/lib/panel/steps";
import {
  ageOn, availabilityAnswers, categories, categoryFor, countryOptions, feet, modalities, positions, seekingKinds, sexes, traitKeys, youtubeThumb, VIDEO_LIMIT,
} from "@/domain/athlete";
import { Choices, SectionTitle, SelectField, TextArea, TextField, ghostButton, primaryButton } from "@/components/panel/controls";
import { StepForm } from "@/components/panel/StepForm";
import { Repeatable } from "@/components/panel/Repeatable";
import { VideoAddForm } from "@/components/panel/VideoAddForm";
import { BlockManager } from "@/components/panel/BlockManager";
import { PhotoManager } from "@/components/panel/PhotoManager";
import { AiRequestForm } from "@/components/ai/AiRequestForm";

export default async function EditStep({ params, searchParams }: PageProps<"/[lang]/painel/atleta/[id]/editar/[etapa]">) {
  const { lang, id, etapa } = await params;
  const sp = await searchParams;
  if (!hasLocale(lang) || !isStep(etapa)) notFound();
  const session = await requireGuardian(lang);
  if (!session) return null;
  const { db, user } = session;
  const p = await getPanelDictionary(lang);
  const bundle = await getAthleteBundle(db, user.id, id);
  const a = bundle.athlete;
  const f = p.fields;
  const idx = stepSlugs.indexOf(etapa);
  const base = `/${lang}/painel/atleta/${id}`;
  const labels = { save: p.form.save, saveNext: p.form.saveNext, saved: p.form.saved, error: p.form.error, exit: p.form.exit, errors: { minorSelf: p.form.minorSelf } };
  const action = saveStep.bind(null, lang, id, etapa);
  const opts = <T extends string>(list: readonly T[], map: Record<T, string>) => list.map((v) => ({ value: v, label: map[v] }));
  const yn = [{ value: "yes", label: p.form.yes }, { value: "no", label: p.form.no }];
  const ynValue = (v: boolean | null) => (v === null ? null : v ? "yes" : "no");
  const countryList = countryOptions(htmlLang[lang]);

  let body: React.ReactNode = null;

  if (etapa === "dados") {
    body = (
      <StepForm action={action} labels={labels} exitHref={`/${lang}/painel`}>
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField label={f.fullName} name="full_name" defaultValue={a.full_name} required minLength={3} className="sm:col-span-2" />
          <TextField label={f.sportName} name="sport_name" defaultValue={a.sport_name ?? ""} />
          <TextField label={f.birthDate} name="birth_date" type="date" defaultValue={a.birth_date} required hint={`${f.age}: ${ageOn(a.birth_date)} · ${categoryFor(a.birth_date)}`} />
          <Choices legend={f.sex} name="sex" options={opts(sexes, f.sexes)} value={a.sex} className="sm:col-span-2" />
          <SelectField label={f.country} name="country" defaultValue={a.country} options={countryList} required hint={f.countryHint} />
          <TextField label={f.state} name="state" defaultValue={a.state ?? ""} />
          <TextField label={f.city} name="city" defaultValue={a.city ?? ""} />
        </div>
        <div className="grid gap-6 border-t border-white/10 pt-8 sm:grid-cols-2">
          <SelectField label={f.nationality} name="nationality" defaultValue={a.nationality} options={countryList} placeholder={p.form.select} className="sm:col-span-2" />
          {[0, 1, 2].map((i) => (
            <SelectField key={i} label={i === 0 ? f.otherCitizenship : `${f.otherCitizenship} ${i + 1}`} name="other_citizenships" defaultValue={a.other_citizenships[i] ?? ""} options={countryList} placeholder={p.form.none} optional={p.form.optional} hint={i === 0 ? f.otherCitizenshipHint : undefined} />
          ))}
          <Choices legend={f.passport} name="valid_passport" options={yn} value={ynValue(a.valid_passport)} hint={f.passportHint} className="sm:col-span-2" />
        </div>
      </StepForm>
    );
  }

  if (etapa === "fotos") {
    const urls = await signedPhotoUrls(db, bundle.photos.map((ph) => ph.storage_path!).filter(Boolean));
    body = (
      <>
        <PhotoManager
          lang={lang} athleteId={id} t={p.photos}
          photos={bundle.photos.map((ph) => ({ id: ph.id, url: urls[ph.storage_path!] ?? null, isPrimary: ph.is_primary, x: ph.focal_x, y: ph.focal_y, zoom: ph.zoom }))}
        />
        <NextLink href={`${base}/editar/${stepSlugs[idx + 1]}`} label={p.form.saveNext} exit={`/${lang}/painel`} exitLabel={p.form.exit} />
      </>
    );
  }

  if (etapa === "fisico") {
    body = (
      <StepForm action={action} labels={labels} exitHref={`/${lang}/painel`}>
        <div className="grid gap-6 sm:grid-cols-3">
          <TextField label={f.height} name="height_cm" type="number" inputMode="numeric" min={80} max={230} defaultValue={a.height_cm ?? ""} />
          <TextField label={f.weight} name="weight_kg" type="number" inputMode="numeric" min={15} max={150} defaultValue={a.weight_kg ?? ""} />
          <TextField label={f.measuredAt} name="measured_at" type="date" defaultValue={a.measured_at ?? ""} hint={f.measuredHint} />
        </div>
        <Choices legend={f.foot} name="foot" options={opts(feet, f.feet)} value={a.foot} />
      </StepForm>
    );
  }

  if (etapa === "futebol") {
    const m = (d: string | null) => (d ? d.slice(0, 7) : "");
    body = (
      <StepForm action={action} labels={labels} exitHref={`/${lang}/painel`}>
        <Choices legend={f.modality} name="modality" options={opts(modalities, p.modalities)} value={a.modality} />
        <Choices legend={f.primaryPosition} name="primary_position" options={opts(positions, p.positions)} value={a.primary_position} />
        <Choices legend={f.secondaryPositions} name="secondary_positions" multiple options={opts(positions, p.positions)} value={a.secondary_positions} hint="máx. 3" />
        <div className="grid gap-6 sm:grid-cols-3">
          <SelectField label={f.category} name="category" defaultValue={a.category ?? categoryFor(a.birth_date)} options={categories.map((c) => ({ value: c, label: c }))} />
          <TextField label={f.currentClub} name="current_club" defaultValue={a.current_club ?? ""} />
          <TextField label={f.currentClubSince} name="current_club_since" type="month" defaultValue={m(a.current_club_since)} />
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          <Choices legend={f.federated} name="federated" options={yn} value={a.federated ? "yes" : "no"} />
          <TextField label={f.federation} name="federation" defaultValue={a.federation ?? ""} optional={p.form.optional} className="sm:col-span-2" />
        </div>
        <Repeatable
          legend={f.previousClubs} addLabel={f.addClub} removeLabel={f.remove}
          cols={[{ name: "club", label: f.club }, { name: "club_from", label: f.from, type: "month" }, { name: "club_to", label: f.to, type: "month" }]}
          rows={bundle.clubs.map((c) => ({ club: c.club, club_from: m(c.started_on), club_to: m(c.ended_on) }))}
        />
        <TextArea label={f.competitions} name="competitions" defaultValue={a.competitions.join("\n")} hint={f.competitionsHint} />
        <Repeatable
          legend={f.achievements} addLabel={f.addAchievement} removeLabel={f.remove}
          cols={[{ name: "ach_title", label: f.achievementTitle }, { name: "ach_competition", label: f.achievementCompetition }, { name: "ach_year", label: f.year, type: "number" }]}
          rows={bundle.achievements.map((x) => ({ ach_title: x.title, ach_competition: x.competition ?? "", ach_year: x.year ? String(x.year) : "" }))}
        />
        <TextArea label={f.experiences} name="experiences" defaultValue={a.experiences ?? ""} optional={p.form.optional} />
      </StepForm>
    );
  }

  if (etapa === "perfil") {
    body = (
      <StepForm action={action} labels={labels} exitHref={`/${lang}/painel`}>
        <Choices legend={f.traits} name="traits" multiple options={opts(traitKeys, p.traits)} value={a.traits} hint={`${f.traitsNote} · máx. 8`} />
        <TextArea label={f.bio} name="bio" defaultValue={a.bio ?? ""} hint={f.bioHint} maxLength={1200} />
      </StepForm>
    );
  }

  if (etapa === "disponibilidade") {
    body = (
      <StepForm action={action} labels={labels} exitHref={`/${lang}/painel`}>
        <Choices legend={f.available} name="available" options={yn} value={ynValue(a.available)} />
        <div className="grid gap-8 md:grid-cols-2">
          <Choices legend={f.travel} name="travel" options={opts(availabilityAnswers, f.travelAnswers)} value={a.travel} />
          <Choices legend={f.relocateCity} name="relocate_city" options={opts(availabilityAnswers, f.answers)} value={a.relocate_city} />
          <Choices legend={f.relocateState} name="relocate_state" options={opts(availabilityAnswers, f.answers)} value={a.relocate_state} />
          <Choices legend={f.relocateAbroad} name="relocate_abroad" options={opts(availabilityAnswers, f.answers)} value={a.relocate_abroad} />
        </div>
        <Choices legend={f.seeking} name="seeking" multiple options={opts(seekingKinds, p.seeking)} value={a.seeking} />
        <TextArea label={f.goals} name="goals" defaultValue={a.goals ?? ""} optional={p.form.optional} maxLength={800} />
      </StepForm>
    );
  }

  if (etapa === "videos") {
    body = (
      <div className="space-y-10">
        <p className="max-w-[62ch] leading-relaxed text-fog">{p.videos.lead}</p>
        <p className="text-[0.875rem] text-ash" data-testid="videos-contagem">{bundle.videos.length} / {VIDEO_LIMIT}</p>
        {bundle.videos.length === 0 ? (
          <p className="text-ash">{p.videos.empty}</p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {bundle.videos.map((v) => (
              <li key={v.id}>
                <a href={v.url!} target="_blank" rel="noopener noreferrer" className="group relative block aspect-video overflow-hidden bg-pitch">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={youtubeThumb(v.external_id!)} alt="" loading="lazy" className="size-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  <span className="absolute left-3 top-3 bg-ink/80 px-2 py-1 text-[0.72rem] text-bone">{p.videos.types[v.video_type ?? "other"]}</span>
                </a>
                <div className="mt-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-bone">{v.title || "YouTube"}</p>
                    {v.description && <p className="mt-1 text-[0.85rem] text-ash">{v.description}</p>}
                  </div>
                  <form action={removeVideo.bind(null, lang, id, v.id)}>
                    <button className="h-10 text-[0.85rem] text-ash hover:text-[#f0c4c4]">{p.videos.remove}</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        <VideoAddForm action={addVideo.bind(null, lang, id)} t={p.videos} optional={p.form.optional} />
        <NextLink href={`${base}/editar/${stepSlugs[idx + 1]}`} label={p.form.saveNext} exit={`/${lang}/painel`} exitLabel={p.form.exit} />
      </div>
    );
  }

  if (etapa === "avaliacao") {
    const ai = p.ai;
    const { request } = await getAiState(db, id);
    // pedido em andamento ou concluído: mostra o estado; senão, o formulário
    const showForm = !request || ["unidentified", "failed", "cancelled"].includes(request.status);
    const st = request ? ai.status[request.status] : null;
    body = (
      <div className="space-y-10">
        <p className="max-w-[62ch] leading-relaxed text-fog">{ai.lead}</p>
        {request && st && (
          <section className={`space-y-3 border-l-2 pl-4 ${request.status === "completed" ? "border-grass" : request.status === "unidentified" || request.status === "failed" ? "border-[#e5a3a3]" : "border-white/30"}`}>
            <p className="font-display text-[1.6rem] font-extrabold uppercase leading-none [font-stretch:62%]">{st.title}</p>
            <p className="max-w-[60ch] text-[0.95rem] leading-relaxed text-fog">{st.body}</p>
            <div className="flex flex-wrap gap-3 pt-2">
              {request.status === "completed" && <Link href={`${base}/avaliacao`} className={primaryButton}>{ai.view}</Link>}
              {["awaiting_payment", "queued"].includes(request.status) && (
                <form action={cancelAiAnalysis.bind(null, lang, id, request.id)}>
                  <button className={ghostButton}>{ai.cancel}</button>
                </form>
              )}
            </div>
          </section>
        )}
        {showForm && (bundle.videos.length === 0 ? (
          <p className="text-ash">{ai.noVideos}</p>
        ) : (
          <AiRequestForm
            action={requestAiAnalysis.bind(null, lang, id)} t={ai} defaultPosition={a.primary_position}
            positions={opts(positions, p.positions)}
            videos={bundle.videos.filter((v) => v.external_id).map((v) => ({ id: v.id, title: v.title, thumb: youtubeThumb(v.external_id!), type: v.video_type }))}
          />
        ))}
        <NextLink href={`${base}/editar/${stepSlugs[idx + 1]}`} label={p.form.saveNext} exit={`/${lang}/painel`} exitLabel={p.form.exit} />
      </div>
    );
  }

  if (etapa === "privacidade") {
    const { data: blocked } = await db.rpc("athlete_blocked_organizations", { p_athlete: id });
    body = (
      <div className="space-y-10">
        <p className="max-w-[62ch] leading-relaxed text-fog">{p.privacy.lead}</p>
        <BlockManager lang={lang} athleteId={id} blocked={blocked ?? []} t={p.privacy} />
        <div className="space-y-2 border-l-2 border-grass/60 pl-4 text-[0.9rem] leading-relaxed text-fog">
          <p>{p.privacy.effects}</p>
          <p>{p.privacy.contact}</p>
        </div>
        <NextLink href={`${base}/editar/${stepSlugs[idx + 1]}`} label={p.form.saveNext} exit={`/${lang}/painel`} exitLabel={p.form.exit} />
      </div>
    );
  }

  if (etapa === "publicacao") {
    const pb = p.publish;
    const stage = { draft: 0, pending_payment: 0, in_review: 2, rejected: 1, approved: 3, suspended: 3 }[a.status];
    const missing = [
      !a.primary_position && f.primaryPosition, !a.modality && f.modality, !a.category && f.category,
    ].filter((x): x is string => Boolean(x));
    const canSubmit = ["draft", "pending_payment", "rejected"].includes(a.status);
    body = (
      <div className="space-y-12" data-testid="publicacao">
        <p className="max-w-[62ch] leading-relaxed text-fog">{pb.lead}</p>
        <ol className="grid grid-cols-2 border-y border-white/10 md:grid-cols-4">
          {pb.flow.map((s, i) => (
            <li key={s} className={`border-white/10 py-5 pr-4 max-md:[&:nth-child(odd)]:border-r md:border-r md:last:border-r-0 md:pl-5 md:first:pl-0 ${i <= stage ? "text-bone" : "text-ash"}`}>
              <span className="font-display text-[2.2rem] font-black leading-none [font-stretch:62%]">{String(i + 1).padStart(2, "0")}</span>
              <span className="mt-2 block text-[0.9rem]">{s}</span>
              {i === stage && <span className="mt-2 block h-[3px] w-10 bg-grass" />}
            </li>
          ))}
        </ol>

        <section className="grid gap-8 md:grid-cols-12">
          <div className="md:col-span-5">
            <p className="font-display text-[4rem] font-black uppercase leading-none [font-stretch:62%]">{pb.free}</p>
            <p className="mt-2 text-fog">{pb.freeNote}</p>
          </div>
          <div className="space-y-5 md:col-span-7">
            <p className="text-[0.9rem] leading-relaxed text-ash">{pb.disclaimer}</p>
            {sp.envio === "incompleto" && <p role="alert" className="border-l-2 border-[#e5a3a3] pl-4 text-bone">{pb.incomplete}</p>}
            {sp.envio === "erro" && <p role="alert" className="border-l-2 border-[#e5a3a3] pl-4 text-bone">{pb.submitError}</p>}
            {a.status === "rejected" && <p className="border-l-2 border-[#e5a3a3] pl-4 text-bone">{pb.rejected}</p>}
            {canSubmit && missing.length > 0 && (
              <div className="border-l-2 border-white/20 pl-4 text-[0.95rem] text-fog">
                <p>{pb.requiredTitle}</p>
                <ul className="mt-1 list-disc pl-5">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
              </div>
            )}
            {canSubmit && (
              <form action={submitForReview.bind(null, lang, id)}>
                <button disabled={missing.length > 0} className={`${primaryButton} w-full sm:w-auto sm:min-w-[18rem]`}>
                  {a.status === "rejected" ? pb.resubmit : pb.submit}
                </button>
              </form>
            )}
            {a.status === "in_review" && (
              <>
                <p className="border-l-2 border-grass pl-4 text-bone">{pb.inReview}</p>
                <form action={withdrawFromReview.bind(null, lang, id)}>
                  <button className={ghostButton}>{pb.withdraw}</button>
                </form>
              </>
            )}
          </div>
        </section>

        <section className="space-y-5">
          <SectionTitle>{pb.visibilityTitle}</SectionTitle>
          <p className="text-[0.9rem] text-ash">{pb.visibilityLead}</p>
          <form action={setVisibility.bind(null, lang, id)} className="space-y-5">
            <fieldset className="space-y-2">
              {(["active", "paused", "hidden"] as const).map((v) => (
                <label key={v} className="flex min-h-12 cursor-pointer items-center gap-3 border border-white/12 px-4 has-[:checked]:border-grass">
                  <input type="radio" name="visibility" value={v} defaultChecked={a.visibility === v} className="size-4 accent-[#4f9a6a]" />
                  <span className="text-[0.95rem]">{pb.visibilityOptions[v]}</span>
                </label>
              ))}
            </fieldset>
            <button className={ghostButton}>{p.form.save}</button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <main className="gutter mx-auto max-w-7xl pb-24 pt-8 md:pt-12">
      <div className="lg:grid lg:grid-cols-12 lg:gap-12">
        {/* Etapas: trilho lateral (desktop) / faixa rolável (celular) */}
        <nav aria-label={p.form.stepOf} className="lg:col-span-3">
          <Link href={base} className="font-display text-[1.6rem] font-black uppercase leading-none text-[#e6e5de] [font-stretch:62%] hover:text-bone">
            {a.sport_name || a.full_name}
          </Link>
          <ol className="-mx-4 mt-5 flex gap-1 overflow-x-auto px-4 pb-2 lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:px-0">
            {stepSlugs.map((s, i) => (
              <li key={s} className="shrink-0">
                <Link
                  href={`${base}/editar/${s}`} aria-current={s === etapa ? "step" : undefined}
                  className={`flex h-11 items-center gap-3 border-b-2 px-2 text-[0.9rem] transition-colors lg:border-b-0 lg:border-l-2 lg:px-3 ${s === etapa ? "border-grass text-bone" : "border-transparent text-ash hover:text-bone"}`}
                >
                  <span className="font-mono text-[0.72rem] text-ash">{String(i + 1).padStart(2, "0")}</span>
                  {p.steps[s]}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
        <div className="mt-8 lg:col-span-9 lg:mt-0">
          <p className="eyebrow text-ash">{p.form.stepOf} {idx + 1} {p.form.of} {stepSlugs.length}</p>
          <h1 className="mb-10 mt-2 font-display text-[clamp(2.6rem,10vw,5rem)] font-black uppercase leading-[0.84] [font-stretch:62%]">{p.steps[etapa]}</h1>
          {body}
        </div>
      </div>
    </main>
  );
}

function NextLink({ href, label, exit, exitLabel }: { href: string; label: string; exit: string; exitLabel: string }) {
  return (
    <div className="flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
      <Link href={href} className={`${primaryButton} w-full sm:w-auto sm:min-w-[16rem]`}>{label}</Link>
      <Link href={exit} className="text-center text-[0.875rem] text-ash hover:text-bone sm:ml-auto">{exitLabel}</Link>
    </div>
  );
}
