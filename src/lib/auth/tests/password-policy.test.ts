/** Política de senhas (E3). Rodar: npm run test:auth */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PASSWORD_MAX, checkPassword } from "../password-policy.ts";

test("tamanho: menos de 10 ou mais de 128 caracteres é recusado", () => {
  assert.equal(checkPassword("Ab3$xY9!q"), "password"); // 9
  assert.equal(checkPassword("x".repeat(PASSWORD_MAX + 1)), "password");
  assert.equal(checkPassword("Ab3$xY9!qZ"), null); // 10, aleatória
});

test("senhas comuns de vazamentos são recusadas (inclusive com maiúsculas e trocas por números)", () => {
  for (const p of ["1234567890", "qwertyuiop", "Password123", "iloveyou12", "P4ssw0rd123"]) assert.equal(checkPassword(p), "passwordWeak", p);
});

test("palavra comum com poucos números ou símbolos é recusada (pt/es)", () => {
  for (const p of ["flamengo2024", "Corinthians1", "senha123456", "@contrasena1", "futebol2010!", "Pa1meiras2023", "s3nh4s3nh4"]) {
    assert.equal(checkPassword(p), "passwordWeak", p);
  }
});

test("repetições e sequências são recusadas", () => {
  for (const p of ["aaaaaaaaaa", "1212121212", "abcabcabcabc", "abcdefghijk", "9876543210", "zxcvbnmzxc"]) assert.equal(checkPassword(p), "passwordWeak", p);
});

test("nome ou e-mail da pessoa não servem de senha", () => {
  const who = { email: "mariana.souza@example.com", name: "Mariana Souza Lima" };
  assert.equal(checkPassword("marianasouza", who), "passwordWeak");
  assert.equal(checkPassword("Mariana2015!", who), "passwordWeak");
  assert.equal(checkPassword("souza12345", who), "passwordWeak");
});

test("frases e senhas fortes passam, sem exigir símbolos obrigatórios", () => {
  const who = { email: "mariana.souza@example.com", name: "Mariana Souza" };
  for (const p of ["bola azul na janela", "cafe-com-pao-de-queijo", "Treino de quinta 7h", "x9#Lm2!vQp", "goleiro voador 2015"]) {
    assert.equal(checkPassword(p, who), null, p);
  }
});
