export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-3 px-6">
      <h1 className="text-3xl font-semibold">NotaLens</h1>
      <p className="text-muted">
        A IA lê notas fiscais e boletos; regras de negócio conferem o que ela leu; o que não fecha vai para revisão humana.
      </p>
      <p className="text-sm text-muted">Em construção: o motor de regras (V1–V10) já está pronto e testado.</p>
    </main>
  );
}
