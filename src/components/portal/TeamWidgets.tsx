"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInvite, removeTeamMember, revokeTeamInvite } from "@/lib/portal/actions";
import type { PortalDictionary } from "@/i18n/get-dictionary";
import { ghostButton, primaryButton } from "@/components/panel/controls";

export function InviteBox({ lang, t }: { lang: string; t: PortalDictionary["team"] }) {
  const [state, action, pending] = useActionState(createInvite.bind(null, lang), undefined);
  const link = state?.link ? (typeof window === "undefined" ? state.link : `${window.location.origin}${state.link}`) : null;
  return (
    <div className="space-y-4" data-testid="convite">
      <p className="max-w-[60ch] text-[0.9rem] text-fog">{t.inviteLead}</p>
      {link ? (
        <label className="block">
          <span className="eyebrow text-fog">{t.inviteLink}</span>
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} data-testid="link-convite"
            className="mt-2 h-12 w-full border border-grass bg-ink/60 px-4 font-mono text-[0.85rem] text-bone" />
        </label>
      ) : (
        <form action={action}><button disabled={pending} className={primaryButton}>{t.invite}</button></form>
      )}
      {state?.error && <p role="alert" className="text-[#f0c4c4]">{state.error === "full" ? t.full : t.error}</p>}
    </div>
  );
}

export function TeamButton({ kind, lang, id, label }: { kind: "remove" | "revoke"; lang: string; id: string; label: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button type="button" disabled={pending} className={ghostButton}
      onClick={() => start(async () => { await (kind === "remove" ? removeTeamMember : revokeTeamInvite)(lang, id); router.refresh(); })}>
      {label}
    </button>
  );
}
