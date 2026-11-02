/** Envio em partes: partes certas, novas tentativas, retomada sem reenviar o que já foi, progresso real. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PART_SIZE, fingerprint, partCount, resumable, uploadFile, type StateStore, type UploadSdk, type UploadState } from "../resumable-upload.ts";

function memStore() {
  const m = new Map<string, UploadState>();
  const store: StateStore = { load: (fp) => m.get(fp) ?? null, save: (s) => void m.set(s.fingerprint, structuredClone(s)), clear: (fp) => void m.delete(fp) };
  return { m, store };
}

function sdk(opts: { failParts?: Map<number, number> } = {}) {
  const sent: number[] = [];
  const fails = opts.failParts ?? new Map();
  let completed: { etag: string; partNumber: number }[] | null = null;
  const api: UploadSdk = {
    async createMultipartUpload() { return { key: "k1", uploadId: "u1" }; },
    async uploadPart(_p, body, o) {
      const left = fails.get(o.partNumber) ?? 0;
      if (left > 0) { fails.set(o.partNumber, left - 1); throw new Error("network"); }
      sent.push(o.partNumber);
      assert.ok(body.size <= PART_SIZE);
      return { etag: `e${o.partNumber}`, partNumber: o.partNumber };
    },
    async completeMultipartUpload(pathname, parts) { completed = parts; return { pathname }; },
  };
  return { api, sent, get completed() { return completed; } };
}

const file = (size: number) => new Blob([new Uint8Array(size)], { type: "video/mp4" });
const state = (size: number, fp = "fp") => ({ fingerprint: fp, pathname: "analises/a/x.mp4", token: "t", contentType: "video/mp4", size, expiresAt: Date.now() + 6 * 3600_000 });

test("arquivo de 20 MiB em 3 partes, progresso real e estado apagado no fim", async () => {
  const size = 20 * 1024 * 1024;
  const { m, store } = memStore();
  const s = sdk();
  const progress: number[] = [];
  const out = await uploadFile({ file: file(size), state: state(size), sdk: s.api, store, onProgress: (b) => progress.push(b), sleep: async () => {} });
  assert.equal(out.pathname, "analises/a/x.mp4");
  assert.deepEqual(s.sent, [1, 2, 3]);
  assert.deepEqual(s.completed!.map((p) => p.partNumber), [1, 2, 3]);
  assert.deepEqual(progress, [0, PART_SIZE, 2 * PART_SIZE, size]);
  assert.equal(m.size, 0);
  assert.equal(partCount(size), 3);
});

test("falha passageira de rede: nova tentativa da mesma parte", async () => {
  const size = 9 * 1024 * 1024;
  const { store } = memStore();
  const s = sdk({ failParts: new Map([[2, 2]]) });
  const waits: number[] = [];
  await uploadFile({ file: file(size), state: state(size), sdk: s.api, store, sleep: async (ms) => void waits.push(ms) });
  assert.deepEqual(s.sent, [1, 2]);
  assert.deepEqual(waits, [1000, 2000]);
});

test("conexão cai de vez: estado fica salvo e a retomada envia só o que falta", async () => {
  const size = 30 * 1024 * 1024;
  const { m, store } = memStore();
  const s1 = sdk({ failParts: new Map([[3, 99]]) });
  await assert.rejects(uploadFile({ file: file(size), state: state(size), sdk: s1.api, store, sleep: async () => {} }));
  const saved = m.get("fp")!;
  assert.deepEqual(saved.parts.map((p) => p.partNumber), [1, 2]);
  assert.ok(resumable(saved, "fp", Date.now()));
  const s2 = sdk();
  await uploadFile({ file: file(size), state: saved, sdk: s2.api, store, sleep: async () => {} });
  assert.deepEqual(s2.sent, [3, 4], "partes 1 e 2 não são reenviadas");
  assert.deepEqual(s2.completed!.map((p) => p.partNumber), [1, 2, 3, 4]);
});

test("retomada só para o mesmo arquivo e com autorização ainda válida", () => {
  const f = { name: "jogo.mp4", size: 10, lastModified: 1 };
  const fp = fingerprint(f, "ath1");
  const s = { ...state(10, fp), key: "k", uploadId: "u", parts: [] } as UploadState;
  assert.ok(resumable(s, fp, Date.now()));
  assert.ok(!resumable(s, fingerprint({ ...f, lastModified: 2 }, "ath1"), Date.now()), "outro arquivo");
  assert.ok(!resumable(s, fingerprint(f, "ath2"), Date.now()), "outro atleta");
  assert.ok(!resumable({ ...s, expiresAt: Date.now() + 60_000 }, fp, Date.now()), "autorização vencendo");
});

test("cancelar interrompe sem novas tentativas", async () => {
  const size = 9 * 1024 * 1024;
  const { store } = memStore();
  const ac = new AbortController();
  const s = sdk({ failParts: new Map([[1, 5]]) });
  ac.abort();
  await assert.rejects(uploadFile({ file: file(size), state: state(size), sdk: s.api, store, signal: ac.signal, sleep: async () => {} }));
  assert.deepEqual(s.sent, []);
});
