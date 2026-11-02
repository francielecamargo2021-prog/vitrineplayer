/**
 * Envio de vídeo grande, direto do navegador para o Blob PRIVADO, em partes de 8 MiB (upload multipart).
 *
 *  * Cada parte tem até 4 novas tentativas, com espera crescente (rede de celular).
 *  * O estado (partes concluídas) é salvo depois de cada parte: se a conexão cair ou a página fechar, o envio
 *    continua de onde parou ao escolher o MESMO arquivo de novo (nome + tamanho + data de modificação),
 *    enquanto a autorização de envio for válida (6 h). Depois disso, recomeça do zero.
 *  * O progresso mostrado é real: bytes de partes confirmadas pelo Blob (não há barra simulada).
 *  * O token de envio é limitado pelo servidor a ESTE caminho, a este tipo e a este tamanho.
 */
export const PART_SIZE = 8 * 1024 * 1024;
export const MAX_RETRIES = 4;

export type Part = { etag: string; partNumber: number };
export type UploadState = {
  fingerprint: string; pathname: string; token: string; contentType: string; size: number;
  key: string; uploadId: string; parts: Part[]; expiresAt: number;
};
export type UploadSdk = {
  createMultipartUpload(pathname: string, opts: { access: "private"; token: string; contentType: string }): Promise<{ key: string; uploadId: string }>;
  uploadPart(pathname: string, body: Blob, opts: { access: "private"; token: string; contentType: string; key: string; uploadId: string; partNumber: number; abortSignal?: AbortSignal }): Promise<Part>;
  completeMultipartUpload(pathname: string, parts: Part[], opts: { access: "private"; token: string; contentType: string; key: string; uploadId: string }): Promise<{ pathname: string }>;
};
export type StateStore = { load(fp: string): UploadState | null; save(s: UploadState): void; clear(fp: string): void };

export const fingerprint = (f: { name: string; size: number; lastModified: number }, athleteId: string) =>
  `${athleteId}|${f.name}|${f.size}|${f.lastModified}`;

export const partCount = (size: number) => Math.max(1, Math.ceil(size / PART_SIZE));

/** Estado salvo ainda utilizável para este arquivo? */
export function resumable(saved: UploadState | null, fp: string, now: number = Date.now()) {
  return Boolean(saved && saved.fingerprint === fp && saved.expiresAt - now > 10 * 60_000 && saved.uploadId);
}

export async function uploadFile(args: {
  file: Blob; state: Omit<UploadState, "key" | "uploadId" | "parts"> & Partial<Pick<UploadState, "key" | "uploadId" | "parts">>;
  sdk: UploadSdk; store: StateStore; onProgress?: (sentBytes: number, total: number) => void;
  signal?: AbortSignal; sleep?: (ms: number) => Promise<void>;
}): Promise<{ pathname: string }> {
  const { file, sdk, store } = args;
  const sleep = args.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const base = { access: "private" as const, token: args.state.token, contentType: args.state.contentType };
  let st: UploadState = { ...args.state, key: args.state.key ?? "", uploadId: args.state.uploadId ?? "", parts: args.state.parts ?? [] };
  if (!st.uploadId) {
    const created = await sdk.createMultipartUpload(st.pathname, base);
    st = { ...st, key: created.key, uploadId: created.uploadId, parts: [] };
    store.save(st);
  }
  const total = partCount(st.size);
  const done = new Set(st.parts.map((p) => p.partNumber));
  const sentBytes = () => st.parts.reduce((n, p) => n + Math.min(PART_SIZE, st.size - (p.partNumber - 1) * PART_SIZE), 0);
  args.onProgress?.(sentBytes(), st.size);
  for (let n = 1; n <= total; n++) {
    if (done.has(n)) continue;
    const body = file.slice((n - 1) * PART_SIZE, Math.min(n * PART_SIZE, st.size));
    let attempt = 0;
    for (;;) {
      if (args.signal?.aborted) throw new Error("aborted");
      try {
        const part = await sdk.uploadPart(st.pathname, body, { ...base, key: st.key, uploadId: st.uploadId, partNumber: n, abortSignal: args.signal });
        st = { ...st, parts: [...st.parts, { etag: part.etag, partNumber: n }] };
        store.save(st);
        args.onProgress?.(sentBytes(), st.size);
        break;
      } catch (e) {
        if (args.signal?.aborted || ++attempt > MAX_RETRIES) throw e;
        await sleep(1000 * 2 ** (attempt - 1));
      }
    }
  }
  const parts = [...st.parts].sort((a, b) => a.partNumber - b.partNumber);
  const out = await sdk.completeMultipartUpload(st.pathname, parts, { ...base, key: st.key, uploadId: st.uploadId });
  store.clear(st.fingerprint);
  return out;
}

/** localStorage do navegador (sem dados pessoais: só caminho, partes e o token curto deste envio). */
export const browserStore: StateStore = {
  load(fp) {
    try {
      const raw = localStorage.getItem(`vp-up:${fp}`);
      return raw ? (JSON.parse(raw) as UploadState) : null;
    } catch {
      return null;
    }
  },
  save(s) {
    try { localStorage.setItem(`vp-up:${s.fingerprint}`, JSON.stringify(s)); } catch { /* modo privado: segue sem retomada */ }
  },
  clear(fp) {
    try { localStorage.removeItem(`vp-up:${fp}`); } catch { /* idem */ }
  },
};
