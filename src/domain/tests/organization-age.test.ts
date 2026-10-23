/** Faixa por tipo de organização e finalidades do interesse (espelho da 0015). Rodar: npm run test:domain */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ageFloor, effectiveBand, purposesFor, validBand } from "../organization-age.ts";

test("padrão sem autorização do admin", () => {
  assert.deepEqual(effectiveBand("school", null, null), { min: 11, max: 22 });
  assert.deepEqual(effectiveBand("club", null, null), { min: 11, max: 22 });
  assert.equal(effectiveBand("scouting_hub", null, null), null, "núcleo: nenhum acesso");
  assert.deepEqual(effectiveBand("scout", null, null), { min: 11, max: 22 });
  assert.deepEqual(effectiveBand("manager", null, null), { min: 15, max: 22 });
  assert.deepEqual(effectiveBand("agent", null, null), { min: 15, max: 22 });
  assert.deepEqual(effectiveBand("brand", null, null), { min: 18, max: 22 });
  assert.deepEqual(effectiveBand("company", null, null), { min: 18, max: 22 });
});

test("faixa do admin nunca abaixo do piso nem acima de 22", () => {
  assert.deepEqual(effectiveBand("school", 6, 22), { min: 6, max: 22 });
  assert.deepEqual(effectiveBand("scouting_hub", 8, 14), { min: 8, max: 14 });
  assert.deepEqual(effectiveBand("manager", 6, 22), { min: 15, max: 22 }, "valor antigo abaixo do piso é corrigido");
  assert.equal(validBand("manager", 10, 22), false);
  assert.equal(validBand("brand", 12, 22), false);
  assert.equal(validBand("scouting_hub", 8, 23), false);
  assert.equal(validBand("scouting_hub", 14, 8), false);
  assert.equal(validBand("school", 6, 22), true);
  assert.equal(ageFloor("scout"), 11);
});

test("finalidades por tipo", () => {
  assert.deepEqual(purposesFor("school"), ["general", "evaluation_invite", "scholarship_50", "scholarship_100", "school_presentation"]);
  assert.deepEqual(purposesFor("club"), ["general", "evaluation_invite"]);
  assert.deepEqual(purposesFor("scouting_hub"), ["general", "evaluation_invite"]);
  assert.deepEqual(purposesFor("manager"), ["general"]);
  assert.deepEqual(purposesFor("brand"), ["general"]);
});
