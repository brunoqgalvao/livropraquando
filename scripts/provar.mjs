// Grava no catálogo a prova de que o livro existe em edição brasileira.
// Sem isso o validador recusa a página — inclusive as curadas à mão.
import { P, lerTodos, gravar, canonicalLivro } from './lib.mjs';
import { resolver, tituloBate } from './resolve.mjs';

const forcar = process.argv.includes('--forcar');
let mudou = 0;

for (const l of lerTodos(P.livros)) {
  if (!forcar && (l.disponibilidade?.resolucoes || []).some(r => r.titulo_bateu)) continue;
  const r = await resolver({ isbn: l.isbn13 });
  // resolver por ISBN confirma a edição; o título ainda precisa bater com o nosso
  const resolucoes = r.resolucoes.map(x => {
    if (!x.titulo_bateu) return x;
    const cand = r.candidatos.find(c => c.fonte === x.fonte);
    return { ...x, titulo_bateu: cand ? tituloBate(cand.titulo, l.titulo) : false };
  });
  const provado = resolucoes.some(x => x.titulo_bateu);
  if (!provado) console.log(`  !! ${l.isbn13} ${l.titulo}: nenhuma fonte confirmou`);
  const { arquivo, ...limpo } = l;
  limpo.disponibilidade = { ...(l.disponibilidade || {}), resolucoes };
  if (gravar(arquivo, canonicalLivro(limpo))) mudou++;
  console.log(`  ${provado ? 'ok' : '--'} ${l.isbn13} ${l.titulo} — ${resolucoes.filter(x => x.titulo_bateu).map(x => x.fonte).join(', ') || 'nenhuma'}`);
  await new Promise(s => setTimeout(s, 350));
}
console.log(`${mudou} livro(s) atualizado(s)`);
