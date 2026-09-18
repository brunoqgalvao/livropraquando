// Descoberta de candidatos pra uma situação. Não escreve no catálogo:
// cospe candidatos com a sinopse, pra curadoria (humana ou do agente) decidir.
import { googleBooks, edicaoBrasileira } from './resolve.mjs';
import { P, hoje, lerTodos } from './lib.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const slug = process.argv[2];
if (!slug) { console.error('uso: node scripts/descobrir.mjs <slug-da-situacao>'); process.exit(2); }
const sit = JSON.parse(readFileSync(join(P.situacoes, `${slug}.json`), 'utf8'));
if (!sit.consultas?.length) { console.error(`situação "${slug}" não tem "consultas"`); process.exit(2); }

// As consultas viram `intitle:` no Google Books. Frase de assunto ("irmão mais
// novo ciúme criança") vira OR frouxo e devolve romance adulto e teologia;
// o que rende é palavra curta e distintiva que caiba num TÍTULO de livro
// infantil — "irmãozinho", "barriga da mamãe". Escreva as consultas assim.
const vistos = new Map();
for (const q of sit.consultas) {
  const r = await googleBooks({ titulo: q });
  if (r.erro) { console.error(`  consulta "${q}": ${r.erro}`); continue; }
  for (const it of (r.itens || [])) {
    if (!it.isbn13 || !edicaoBrasileira(it.isbn13)) continue;   // só edição brasileira
    if (!it.sinopse) continue;                                   // sem sinopse não há evidência
    if (!vistos.has(it.isbn13)) vistos.set(it.isbn13, { ...it, achado_por: q });
  }
  await new Promise(r => setTimeout(r, 400));
}

const catalogo = new Set(lerTodos(P.livros).flatMap(l => [l.isbn13, ...(l.outras_edicoes || []).map(o => o.isbn13)]));
const novos = [...vistos.values()].filter(c => !catalogo.has(c.isbn13));

mkdirSync(P.runtime, { recursive: true });
const saida = join(P.runtime, `candidatos-${slug}.json`);
writeFileSync(saida, JSON.stringify({ slug, em: hoje(), candidatos: novos }, null, 2) + '\n');

console.log(`${slug}: ${vistos.size} com edição BR e sinopse, ${novos.length} fora do catálogo`);
for (const c of novos) {
  console.log(`\n  ${c.isbn13} · ${c.titulo} · ${c.autor} · ${c.editora || 'editora?'} · ${c.ano || '?'}`);
  console.log(`    ${c.sinopse.replace(/\s+/g, ' ').slice(0, 220)}…`);
}
console.log(`\n-> ${saida}`);
