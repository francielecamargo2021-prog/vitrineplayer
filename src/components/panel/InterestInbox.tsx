"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondInterest } from "@/lib/panel/actions";
import type { PanelDictionary } from "@/i18n/get-dictionary";
import type { ReceivedInterest } from "@/lib/panel/interests";
import { TextArea, ghostButton, primaryButton } from "./controls";

type T = PanelDictionary["interests"];

/** Ações da família sobre um interesse: aceitar, recusar, bloquear, denunciar. */
export function InterestActions({ lang, r, t }: { lang: string; r: ReceivedInterest; t: T }) {
  const [pending, start] = useTransition();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const run = (action: "accept" | "decline" | "block" | "report") => start(async () => {
    setError(null);
    const res = await respondInterest(lang, r.id, action, reason);
    if (res?.error) return setError(res.error === "reason" ? t.errors.reason : t.errors.generic);
    setReporting(false);
    router.refresh();
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {r.status === "requested" && (
          <>
            <button type="button" disabled={pending} onClick={() => run("accept")} className={primaryButton}>{t.accept}</button>
            <button type="button" disabled={pending} onClick={() => run("decline")} className={ghostButton}>{t.decline}</button>
          </>
        )}
        {!r.blocked && (
          <button type="button" disabled={pending} onClick={() => confirm(t.confirmBlock) && run("block")} className={ghostButton}>{t.block}</button>
        )}
        {!r.reported && !reporting && (
          <button type="button" disabled={pending} onClick={() => setReporting(true)} className="min-h-11 px-2 text-[0.875rem] text-fog underline-offset-4 hover:text-[#f0c4c4] hover:underline">{t.report}</button>
        )}
      </div>
      {reporting && (
        <div className="space-y-3 border-l-2 border-[#e5a3a3] pl-4">
          <TextArea label={t.reportReason} name="reason" hint={t.reportHint} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => run("report")} className={primaryButton}>{t.sendReport}</button>
            <button type="button" disabled={pending} onClick={() => setReporting(false)} className={ghostButton}>{t.cancel}</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-[#f0c4c4]">{error}</p>}
    </div>
  );
}
