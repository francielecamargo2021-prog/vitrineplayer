import { cadastrar, entrar } from "./actions";

export default async function Entrar({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main>
      <h1>Experimento Neon Auth</h1>
      {erro && <p id="erro" style={{ color: "crimson" }}>Erro: {erro}</p>}
      <form action={cadastrar} id="cadastro">
        <h2>Cadastro</h2>
        <input name="name" placeholder="nome" required /> <input name="email" type="email" required /> <input name="password" type="password" required />
        <button>Cadastrar</button>
      </form>
      <form action={entrar} id="login">
        <h2>Entrar</h2>
        <input name="email" type="email" required /> <input name="password" type="password" required />
        <button>Entrar</button>
      </form>
    </main>
  );
}
