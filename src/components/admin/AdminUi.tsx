import Link from "next/link";

/** Peças comuns das telas do admin (filetes, sem cartões arredondados). */
export function AdminTitle({ children, lead }: { children: React.ReactNode; lead?: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-[clamp(2.6rem,10vw,5.5rem)] font-black uppercase leading-[0.85] [font-stretch:62%]">{children}</h1>
      {lead && <p className="mt-4 max-w-[68ch] text-[0.9rem] leading-relaxed text-ash">{lead}</p>}
    </div>
  );
}

export function Pills({ items, label }: { items: { href: string; label: string; current: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.current ? "page" : undefined}
          className={`inline-flex min-h-11 items-center border px-4 text-[0.9rem] transition-colors ${i.current ? "border-grass bg-grass/15 text-bone" : "border-white/15 text-fog hover:border-white/40"}`}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function SearchBox({ action, name = "q", value, placeholder, hidden }: { action: string; name?: string; value?: string; placeholder: string; hidden?: Record<string, string> }) {
  return (
    <form method="get" action={action} className="flex max-w-xl gap-2" role="search">
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input name={name} defaultValue={value} placeholder={placeholder} aria-label={placeholder}
        className="h-11 flex-1 border border-white/15 bg-ink/60 px-4 text-[0.95rem] text-bone outline-none placeholder:text-white/30 focus:border-grass" />
      <button className="h-11 border border-white/20 px-4 text-[0.9rem] text-bone hover:border-bone">Buscar</button>
    </form>
  );
}

export function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="border-t border-white/12 pt-6" data-testid={testId}>
      <h2 className="eyebrow text-bone">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-[0.9rem]">
      {rows.filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => (
        <div key={k} className="contents"><dt className="text-ash">{k}</dt><dd className="break-words text-bone">{v}</dd></div>
      ))}
    </dl>
  );
}

export const fmtDate = (v: string | null | undefined, withTime = true) =>
  v ? new Intl.DateTimeFormat("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(new Date(v)) : "—";

/** Rótulos da auditoria em português. */
export const auditLabel: Record<string, string> = {
  "athlete.create": "Atleta cadastrado", "athlete.submit": "Enviado para revisão", "athlete.review.approve": "Atleta aprovado", "athlete.review.reject": "Ajustes pedidos", "athlete.review.suspend": "Atleta suspenso",
  "athlete.review.reinstate": "Atleta reativado", "athlete.correction": "Correção pedida", "media.remove": "Mídia removida",
  "organization.age_band": "Faixa de idade definida", "organization.review.approve": "Organização aprovada", "organization.review.reject": "Organização recusada",
  "organization.review.suspend": "Organização suspensa", "organization.request": "Cadastro de organização",
  "organization.invite": "Convite criado", "organization.join": "Entrou na equipe", "organization.remove_member": "Membro removido",
  "interest.create": "Interesse enviado", "interest.accept": "Interesse aceito", "interest.decline": "Interesse recusado",
  "interest.block": "Organização bloqueada", "interest.report": "Denúncia", "interest.cancel": "Interesse cancelado pelo admin",
  "report.reviewing": "Denúncia em análise", "report.resolved": "Denúncia resolvida", "report.dismissed": "Denúncia arquivada",
  "account.suspend": "Conta suspensa", "account.reinstate": "Conta reativada", "account.delete": "Conta excluída", "account.export": "Dados exportados",
  "ai.grant": "Cortesia de IA", "ai.settings": "Limites da IA", "ai_analysis.request": "Pedido de análise por IA",
  "portal.settings": "Limites do portal", "admin.mfa.login": "Segundo fator verificado", "admin.mfa.enrolled": "Segundo fator configurado",
  "admin.mfa.recovery": "Código de recuperação usado", "admin.mfa.locked": "Segundo fator bloqueado (erros)",
};
