/** Faixa de idade 6–22 e fase formativa 6–10 (regras de tela e do servidor do app). Rodar: npm run test:domain */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ATHLETE_AGE_MAX, ATHLETE_AGE_MIN, ageOn, birthDateBounds, categories, categoryFor, inAgeRange, isFormativeAge } from "../athlete.ts";

const REF = new Date(2026, 9, 23); // 23/10/2026

test("faixa 6–22: limites exatos no dia do aniversário", () => {
  assert.equal(inAgeRange("2020-10-23", REF), true, "faz 6 hoje");
  assert.equal(inAgeRange("2020-10-24", REF), false, "faz 6 amanhã");
  assert.equal(inAgeRange("2003-10-24", REF), true, "faz 23 amanhã: ainda 22");
  assert.equal(inAgeRange("2003-10-23", REF), false, "fez 23 hoje");
});

test("datas aceitas no formulário batem com a faixa", () => {
  const b = birthDateBounds(REF);
  assert.deepEqual(b, { min: "2003-10-24", max: "2020-10-23" });
  assert.equal(ageOn(b.max, REF), ATHLETE_AGE_MIN);
  assert.equal(ageOn(b.min, REF), ATHLETE_AGE_MAX);
});

test("fase formativa: de 6 a 10 anos", () => {
  assert.equal(isFormativeAge(6), true);
  assert.equal(isFormativeAge(10), true);
  assert.equal(isFormativeAge(11), false);
});

test("categorias de Sub-6 a Sub-23, e a calculada sempre existe na lista", () => {
  assert.equal(categories[0], "Sub-6");
  assert.equal(categories.at(-1), "Sub-23");
  assert.ok(!categories.includes("Adulto"));
  for (let y = 2003; y <= 2020; y++) assert.ok(categories.includes(categoryFor(`${y}-06-01`, 2026)), `${y} → ${categoryFor(`${y}-06-01`, 2026)}`);
  assert.equal(categoryFor("2020-06-01", 2026), "Sub-6");
  assert.equal(categoryFor("2003-06-01", 2026), "Sub-23");
});
