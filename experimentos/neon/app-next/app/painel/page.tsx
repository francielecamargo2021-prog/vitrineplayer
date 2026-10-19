import { auth, dataApi } from "@/lib/auth";
import { sair } from "../entrar/actions";

export const dynamic = "force-dynamic";

export default async function Painel() {
  const { data: session } = await auth.getSession();
  const perfis = await dataApi("/profiles?select=email,role,country,whatsapp");
  const consent = await dataApi("/consents?select=kind");
  const atletas = await dataApi("/athletes?select=id");
  return (
    <main>
      <h1>Painel</h1>
      <p id="usuario">{session?.user?.email}</p>
      <pre id="perfis">{JSON.stringify(perfis.json)}</pre>
      <p id="consentimentos">{Array.isArray(consent.json) ? consent.json.length : -1}</p>
      <p id="atletas">{Array.isArray(atletas.json) ? atletas.json.length : -1}</p>
      <form action={sair}><button id="sair">Sair</button></form>
    </main>
  );
}
