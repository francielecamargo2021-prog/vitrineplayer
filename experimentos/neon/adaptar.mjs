// Gera as versões Neon das migrations e dos testes a partir dos ORIGINAIS
// (supabase/migrations e supabase/tests), sem alterá-los. Cada troca é listada
// em gerado/TROCAS.md para revisão.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../../", import.meta.url).pathname;
const out = new URL("./gerado/", import.meta.url).pathname;
mkdirSync(join(out, "migrations"), { recursive: true });
mkdirSync(join(out, "tests"), { recursive: true });
const log = [];

function apply(file, text, rules) {
  for (const [desc, re, to] of rules) {
    const n = (text.match(re) ?? []).length;
    if (n) log.push(`- ${file}: ${desc} (${n}x)`);
    text = text.replace(re, to);
  }
  return text;
}

// ---------------------------------------------------------------- migrations
const migrationRules = [
  ["auth.users → neon_auth.\"user\" (tabela de usuários do Neon Auth)", /auth\.users\b/g, 'neon_auth."user"'],
  ["auth.role() → public.request_role()", /auth\.role\(\)/g, "public.request_role()"],
  ["auth.uid() → public.vp_uid() (schema auth fechado para os papéis da aplicação)", /auth\.uid\(\)/g, "public.vp_uid()"],
  ["papel anon → anonymous (nome do papel no Neon)", /\banon\b/g, "anonymous"],
];
for (const f of readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
  const src = readFileSync(join(root, "supabase/migrations", f), "utf8");
  writeFileSync(join(out, "migrations", f), apply(f, src, migrationRules));
}

// ---------------------------------------------------------------- testes
// Cadastro de teste: cria o usuário no Neon Auth (neon_auth."user") e, como a
// Server Action fará, completa o cadastro com WhatsApp, país e consentimentos.
const signupPrelude = `
-- [neon] cadastro de teste = usuário no Neon Auth + complete_signup() (como a Server Action)
create temp table vp_test_signup (id uuid, email text, raw_user_meta_data jsonb) on commit drop;
create function pg_temp.vp_signup() returns trigger language plpgsql as $vp$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'); prev text := current_setting('request.jwt.claims', true);
begin
  insert into neon_auth."user" (id, name, email, "emailVerified") values (new.id, coalesce(m->>'full_name', ''), new.email, false);
  if m ? 'whatsapp' or m ? 'consents' or m ? 'country' then
    perform set_config('request.jwt.claims', json_build_object('sub', new.id, 'role', 'authenticated')::text, true);
    perform complete_signup(m->>'whatsapp', m->>'country', m->>'locale',
      array(select jsonb_array_elements_text(coalesce(m->'consents', '[]'))), m->>'consent_version', m->>'consent_ip', m->>'consent_ua');
    perform set_config('request.jwt.claims', coalesce(prev, ''), true);
  end if;
  return new;
end $vp$;
create trigger vp_signup after insert on vp_test_signup for each row execute function pg_temp.vp_signup();
`;
const testRules = [
  ["pgTAP no schema padrão (Neon não tem o schema extensions)", /create extension if not exists pgtap with schema extensions;/g, "create extension if not exists pgtap;"],
  ["papel anon → anonymous", /\banon\b/g, "anonymous"],
  ["auth.uid() → public.vp_uid()", /auth\.uid\(\)/g, "public.vp_uid()"],
  ["cadastro de teste via Neon Auth (insert em auth.users → vp_test_signup)", /insert into auth\.users \(id, email, raw_user_meta_data\)/g, "insert into vp_test_signup (id, email, raw_user_meta_data)"],
  ["prelúdio do cadastro de teste", /select no_plan\(\);\n/, `select no_plan();\n${signupPrelude}`],
];
for (const f of readdirSync(join(root, "supabase/tests")).filter((f) => f.endsWith(".test.sql")).sort()) {
  const src = readFileSync(join(root, "supabase/tests", f), "utf8");
  writeFileSync(join(out, "tests", f), apply(f, src, testRules));
}

writeFileSync(join(out, "TROCAS.md"), `# Trocas automáticas (originais intactos)\n\n${log.join("\n")}\n`);
console.log(log.join("\n"));
